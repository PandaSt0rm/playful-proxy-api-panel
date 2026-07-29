package usage

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	internallogging "github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
	coreusage "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/usage"
	log "github.com/sirupsen/logrus"
	_ "modernc.org/sqlite"
)

const (
	DefaultEventQueryLimit = 50000
	maxEventQueryLimit     = 200000
	maxFailureBodyBytes    = 4096
	priceSyncURL           = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
)

type eventStorePlugin struct{}

func init() {
	coreusage.RegisterPlugin(eventStorePlugin{})
}

func (p eventStorePlugin) HandleUsage(ctx context.Context, record coreusage.Record) {
	if !StatisticsEnabled() {
		return
	}
	store := GetEventStore()
	if store == nil {
		return
	}
	if err := store.Record(ctx, record); err != nil {
		store.setLastError(err)
		log.WithError(err).Warn("usage event store record failed")
	}
}

type eventStoreState struct {
	mu    sync.RWMutex
	store *EventStore
}

var activeEventStore eventStoreState

// GetEventStore returns the active SQLite usage event store, if configured.
func GetEventStore() *EventStore {
	activeEventStore.mu.RLock()
	defer activeEventStore.mu.RUnlock()
	return activeEventStore.store
}

func setEventStore(store *EventStore) {
	activeEventStore.mu.Lock()
	activeEventStore.store = store
	activeEventStore.mu.Unlock()
}

// StartEventStore opens and activates a SQLite-backed usage event store.
func StartEventStore(ctx context.Context, path string, retentionDays int) func() {
	path = strings.TrimSpace(path)
	if path == "" || !StatisticsEnabled() {
		return func() {}
	}
	store, err := OpenEventStore(ctx, path, retentionDays)
	if err != nil {
		log.WithError(err).Warnf("usage event store open failed for %s", path)
		return func() {}
	}
	setEventStore(store)
	if retentionDays > 0 {
		if deleted, errPrune := store.Prune(ctx); errPrune != nil {
			store.setLastError(errPrune)
			log.WithError(errPrune).Warn("usage event store prune failed")
		} else if deleted > 0 {
			log.Infof("usage event store pruned %d old events", deleted)
		}
	}
	return func() {
		setEventStore(nil)
		if errClose := store.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage event store close failed")
		}
	}
}

// EventStore persists normalized usage events to SQLite.
type EventStore struct {
	db            *sql.DB
	path          string
	retentionDays int
	lastErrorMu   sync.RWMutex
	lastError     string
}

// UsageEvent is the normalized, redacted per-request usage record exposed by management APIs.
type UsageEvent struct {
	ID                 int64      `json:"id"`
	EventHash          string     `json:"event_hash"`
	RequestID          string     `json:"request_id,omitempty"`
	Timestamp          time.Time  `json:"timestamp"`
	TimestampMs        int64      `json:"timestamp_ms"`
	Provider           string     `json:"provider"`
	Model              string     `json:"model"`
	Alias              string     `json:"alias"`
	Endpoint           string     `json:"endpoint"`
	Method             string     `json:"method"`
	Path               string     `json:"path"`
	AuthType           string     `json:"auth_type"`
	AuthID             string     `json:"auth_id,omitempty"`
	AuthIndex          string     `json:"auth_index"`
	Source             string     `json:"source"`
	SourceHash         string     `json:"source_hash,omitempty"`
	APIKeyHash         string     `json:"api_key_hash,omitempty"`
	APIKeyAlias        string     `json:"api_key_alias,omitempty"`
	Tokens             TokenStats `json:"tokens"`
	LatencyMs          int64      `json:"latency_ms"`
	FirstByteLatencyMs int64      `json:"first_byte_latency_ms"`
	Failed             bool       `json:"failed"`
	StatusCode         int        `json:"status_code"`
	FailureBody        string     `json:"failure_body,omitempty"`
	CreatedAtMs        int64      `json:"created_at_ms"`
}

// EventQuery filters event and summary reads.
type EventQuery struct {
	From       time.Time
	To         time.Time
	Limit      int
	Provider   string
	Model      string
	Endpoint   string
	AuthType   string
	AuthIndex  string
	APIKeyHash string
	Search     string
	Failed     *bool
}

// EventStatus reports operational state for the usage store.
type EventStatus struct {
	Enabled       bool   `json:"enabled"`
	Path          string `json:"path"`
	RetentionDays int    `json:"retention_days"`
	EventCount    int64  `json:"event_count"`
	OldestMs      int64  `json:"oldest_ms"`
	NewestMs      int64  `json:"newest_ms"`
	LastError     string `json:"last_error,omitempty"`
}

// SummaryRow is a grouped usage aggregate for the management UI.
type SummaryRow struct {
	Group              string  `json:"group"`
	Key                string  `json:"key"`
	Label              string  `json:"label"`
	Requests           int64   `json:"requests"`
	Failures           int64   `json:"failures"`
	Successes          int64   `json:"successes"`
	Tokens             int64   `json:"tokens"`
	InputTokens        int64   `json:"input_tokens"`
	OutputTokens       int64   `json:"output_tokens"`
	ReasoningTokens    int64   `json:"reasoning_tokens"`
	CachedTokens       int64   `json:"cached_tokens"`
	AverageLatencyMs   float64 `json:"average_latency_ms"`
	AverageFirstByteMs float64 `json:"average_first_byte_latency_ms"`
	LastSeenMs         int64   `json:"last_seen_ms"`
}

type ModelPrice struct {
	Model                 string    `json:"model"`
	InputPerMillion       float64   `json:"input_per_million"`
	CachedInputPerMillion float64   `json:"cached_input_per_million"`
	OutputPerMillion      float64   `json:"output_per_million"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type APIKeyAlias struct {
	APIKeyHash string    `json:"api_key_hash"`
	Alias      string    `json:"alias"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type ImportResult struct {
	Added   int64 `json:"added"`
	Skipped int64 `json:"skipped"`
}

func OpenEventStore(ctx context.Context, path string, retentionDays int) (*EventStore, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("usage event store path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create usage event store directory: %w", err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open usage event store: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	store := &EventStore{db: db, path: path, retentionDays: retentionDays}
	if err := store.init(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *EventStore) init(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	statements := []string{
		`PRAGMA busy_timeout = 5000`,
		`PRAGMA journal_mode = WAL`,
		`CREATE TABLE IF NOT EXISTS usage_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_hash TEXT NOT NULL UNIQUE,
			request_id TEXT NOT NULL DEFAULT '',
			timestamp_ms INTEGER NOT NULL,
			timestamp TEXT NOT NULL,
			provider TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT '',
			alias TEXT NOT NULL DEFAULT '',
			endpoint TEXT NOT NULL DEFAULT '',
			method TEXT NOT NULL DEFAULT '',
			path TEXT NOT NULL DEFAULT '',
			auth_type TEXT NOT NULL DEFAULT '',
			auth_id TEXT NOT NULL DEFAULT '',
			auth_index TEXT NOT NULL DEFAULT '',
			source TEXT NOT NULL DEFAULT '',
			source_hash TEXT NOT NULL DEFAULT '',
			api_key_hash TEXT NOT NULL DEFAULT '',
			input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			reasoning_tokens INTEGER NOT NULL DEFAULT 0,
			cached_tokens INTEGER NOT NULL DEFAULT 0,
			cache_read_tokens INTEGER NOT NULL DEFAULT 0,
			cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens INTEGER NOT NULL DEFAULT 0,
			latency_ms INTEGER NOT NULL DEFAULT 0,
			first_byte_latency_ms INTEGER NOT NULL DEFAULT 0,
			failed INTEGER NOT NULL DEFAULT 0,
			status_code INTEGER NOT NULL DEFAULT 0,
			failure_body TEXT NOT NULL DEFAULT '',
			created_at_ms INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp_ms DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(model)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_endpoint ON usage_events(endpoint)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_hash ON usage_events(api_key_hash)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_events_failed ON usage_events(failed)`,
		`CREATE TABLE IF NOT EXISTS usage_model_prices (
			model TEXT PRIMARY KEY,
			input_per_million REAL NOT NULL DEFAULT 0,
			cached_input_per_million REAL NOT NULL DEFAULT 0,
			output_per_million REAL NOT NULL DEFAULT 0,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS usage_api_key_aliases (
			api_key_hash TEXT PRIMARY KEY,
			alias TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
	}
	for _, stmt := range statements {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("initialize usage event store: %w", err)
		}
	}
	return nil
}

func (s *EventStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *EventStore) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *EventStore) LastError() string {
	if s == nil {
		return ""
	}
	s.lastErrorMu.RLock()
	defer s.lastErrorMu.RUnlock()
	return s.lastError
}

func (s *EventStore) setLastError(err error) {
	if s == nil || err == nil {
		return
	}
	s.lastErrorMu.Lock()
	s.lastError = err.Error()
	s.lastErrorMu.Unlock()
}

func (s *EventStore) Record(ctx context.Context, record coreusage.Record) error {
	if s == nil || s.db == nil {
		return nil
	}
	event := EventFromRecord(ctx, record)
	// Usage records are dispatched asynchronously, so the originating request
	// context is frequently already canceled by the time we persist them. The
	// success path publishes usage at end-of-stream, immediately before the
	// HTTP handler cancels the request context, which would otherwise abort
	// BeginTx with "context canceled" and silently drop every successful
	// request (leaving only failures, which publish earlier in the lifecycle).
	// Detach cancellation for the write; EventFromRecord above already captured
	// the context values it needs, and WithoutCancel preserves them.
	ctx = context.WithoutCancel(ctx)
	result, err := s.InsertEvents(ctx, []UsageEvent{event})
	if err != nil {
		return err
	}
	if result.Added > 0 && s.retentionDays > 0 {
		_, _ = s.Prune(ctx)
	}
	return nil
}

func EventFromRecord(ctx context.Context, record coreusage.Record) UsageEvent {
	timestamp := record.RequestedAt
	if timestamp.IsZero() {
		timestamp = time.Now()
	}
	timestamp = timestamp.UTC()

	modelName := strings.TrimSpace(record.Model)
	if modelName == "" {
		modelName = "unknown"
	}
	aliasName := strings.TrimSpace(record.Alias)
	if aliasName == "" {
		aliasName = modelName
	}
	provider := strings.TrimSpace(record.Provider)
	if provider == "" {
		provider = "unknown"
	}
	authType := strings.TrimSpace(record.AuthType)
	if authType == "" {
		authType = "unknown"
	}
	endpoint := strings.TrimSpace(internallogging.GetEndpoint(ctx))
	method, path := splitEndpoint(endpoint)
	if endpoint == "" {
		endpoint = "unknown"
	}
	tokens := normaliseDetail(record.Detail)
	failed := record.Failed
	if !failed {
		failed = !resolveSuccess(ctx)
	}
	fail := normaliseFail(record.Fail, failed)
	if status := internallogging.GetResponseStatus(ctx); status > 0 {
		fail.StatusCode = status
	}
	if failed && fail.StatusCode <= 0 {
		fail.StatusCode = http.StatusInternalServerError
	}
	requestID := strings.TrimSpace(internallogging.GetRequestID(ctx))
	event := UsageEvent{
		RequestID:          requestID,
		Timestamp:          timestamp,
		TimestampMs:        timestamp.UnixMilli(),
		Provider:           provider,
		Model:              modelName,
		Alias:              aliasName,
		Endpoint:           endpoint,
		Method:             method,
		Path:               path,
		AuthType:           authType,
		AuthID:             strings.TrimSpace(record.AuthID),
		AuthIndex:          strings.TrimSpace(record.AuthIndex),
		Source:             strings.TrimSpace(record.Source),
		SourceHash:         hashDisplayValue(record.Source),
		APIKeyHash:         hashDisplayValue(record.APIKey),
		Tokens:             tokens,
		LatencyMs:          normaliseLatency(record.Latency),
		FirstByteLatencyMs: normaliseLatency(record.FirstByteLatency),
		Failed:             failed,
		StatusCode:         fail.StatusCode,
		FailureBody:        sanitizeFailureBody(fail.Body),
		CreatedAtMs:        time.Now().UTC().UnixMilli(),
	}
	event.EventHash = eventHash(event)
	return event
}

func (s *EventStore) InsertEvents(ctx context.Context, events []UsageEvent) (ImportResult, error) {
	result := ImportResult{}
	if s == nil || s.db == nil || len(events) == 0 {
		return result, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return result, fmt.Errorf("begin usage event insert: %w", err)
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()
	stmt, err := tx.PrepareContext(ctx, `INSERT OR IGNORE INTO usage_events (
		event_hash, request_id, timestamp_ms, timestamp, provider, model, alias, endpoint, method, path,
		auth_type, auth_id, auth_index, source, source_hash, api_key_hash,
		input_tokens, output_tokens, reasoning_tokens, cached_tokens, cache_read_tokens, cache_creation_tokens, total_tokens,
		latency_ms, first_byte_latency_ms, failed, status_code, failure_body, created_at_ms
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return result, fmt.Errorf("prepare usage event insert: %w", err)
	}
	defer func() {
		if errClose := stmt.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage event insert statement close failed")
		}
	}()
	for _, raw := range events {
		event := normalizeEvent(raw)
		res, errExec := stmt.ExecContext(
			ctx,
			event.EventHash,
			event.RequestID,
			event.TimestampMs,
			event.Timestamp.UTC().Format(time.RFC3339Nano),
			event.Provider,
			event.Model,
			event.Alias,
			event.Endpoint,
			event.Method,
			event.Path,
			event.AuthType,
			event.AuthID,
			event.AuthIndex,
			event.Source,
			event.SourceHash,
			event.APIKeyHash,
			event.Tokens.InputTokens,
			event.Tokens.OutputTokens,
			event.Tokens.ReasoningTokens,
			event.Tokens.CachedTokens,
			event.Tokens.CacheReadTokens,
			event.Tokens.CacheCreationTokens,
			event.Tokens.TotalTokens,
			event.LatencyMs,
			event.FirstByteLatencyMs,
			boolToInt(event.Failed),
			event.StatusCode,
			event.FailureBody,
			event.CreatedAtMs,
		)
		if errExec != nil {
			return result, fmt.Errorf("insert usage event: %w", errExec)
		}
		affected, _ := res.RowsAffected()
		if affected > 0 {
			result.Added++
		} else {
			result.Skipped++
		}
	}
	if errCommit := tx.Commit(); errCommit != nil {
		return result, fmt.Errorf("commit usage event insert: %w", errCommit)
	}
	tx = nil
	return result, nil
}

type CostAggregate struct {
	Provider, Model, APIKeyHash                                        string
	InputTokens, CachedTokens, OutputTokens, TotalTokens, RequestCount int64
}

func (s *EventStore) Events(ctx context.Context, query EventQuery) ([]UsageEvent, error) {
	if s == nil || s.db == nil {
		return nil, nil
	}
	where, args := buildEventWhere(query)
	limit := normalizeLimit(query.Limit)
	stmt := `SELECT
		e.id, e.event_hash, e.request_id, e.timestamp_ms, e.timestamp, e.provider, e.model, e.alias, e.endpoint, e.method, e.path,
		e.auth_type, e.auth_id, e.auth_index, e.source, e.source_hash, e.api_key_hash, COALESCE(a.alias, ''),
		e.input_tokens, e.output_tokens, e.reasoning_tokens, e.cached_tokens, e.cache_read_tokens, e.cache_creation_tokens, e.total_tokens,
		e.latency_ms, e.first_byte_latency_ms, e.failed, e.status_code, e.failure_body, e.created_at_ms
		FROM usage_events e
		LEFT JOIN usage_api_key_aliases a ON a.api_key_hash = e.api_key_hash` + where +
		` ORDER BY e.timestamp_ms DESC, e.id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, stmt, args...)
	if err != nil {
		return nil, fmt.Errorf("query usage events: %w", err)
	}
	defer func() {
		if errClose := rows.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage event rows close failed")
		}
	}()
	return scanEvents(rows)
}

func (s *EventStore) CostAggregates(ctx context.Context, from, to time.Time) ([]CostAggregate, error) {
	if s == nil || s.db == nil {
		return nil, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT provider,model,api_key_hash,
		COALESCE(SUM(input_tokens),0),COALESCE(SUM(cached_tokens),0),COALESCE(SUM(output_tokens),0),
		COALESCE(SUM(total_tokens),0),COUNT(*)
		FROM usage_events WHERE timestamp_ms>=? AND timestamp_ms<? GROUP BY provider,model,api_key_hash`,
		from.UnixMilli(), to.UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("query cost aggregates: %w", err)
	}
	defer rows.Close()
	aggregates := make([]CostAggregate, 0)
	for rows.Next() {
		var item CostAggregate
		if err = rows.Scan(&item.Provider, &item.Model, &item.APIKeyHash, &item.InputTokens, &item.CachedTokens, &item.OutputTokens, &item.TotalTokens, &item.RequestCount); err != nil {
			return nil, err
		}
		aggregates = append(aggregates, item)
	}
	return aggregates, rows.Err()
}

func (s *EventStore) Snapshot(ctx context.Context, query EventQuery) (StatisticsSnapshot, error) {
	if s == nil || s.db == nil {
		return StatisticsSnapshot{}, nil
	}
	events, err := s.Events(ctx, query)
	if err != nil {
		return StatisticsSnapshot{}, err
	}
	sort.Slice(events, func(i, j int) bool {
		if events[i].TimestampMs == events[j].TimestampMs {
			return events[i].ID < events[j].ID
		}
		return events[i].TimestampMs < events[j].TimestampMs
	})

	stats := NewRequestStatistics()
	stats.mu.Lock()
	for _, event := range events {
		apiName := eventDisplayKey(event)
		modelName := strings.TrimSpace(event.Model)
		if modelName == "" {
			modelName = "unknown"
		}
		apiStatsValue, ok := stats.apis[apiName]
		if !ok || apiStatsValue == nil {
			apiStatsValue = &apiStats{Models: make(map[string]*modelStats)}
			stats.apis[apiName] = apiStatsValue
		}
		stats.recordImported(apiName, modelName, apiStatsValue, RequestDetail{
			Timestamp:          event.Timestamp,
			LatencyMs:          event.LatencyMs,
			FirstByteLatencyMs: event.FirstByteLatencyMs,
			Source:             event.Source,
			AuthIndex:          firstNonEmpty(event.AuthIndex, event.APIKeyAlias, shortHash(event.APIKeyHash)),
			Tokens:             event.Tokens,
			Failed:             event.Failed,
			Fail: FailDetail{
				StatusCode: event.StatusCode,
				Body:       event.FailureBody,
			},
		})
	}
	stats.mu.Unlock()
	return stats.Snapshot(), nil
}

func (s *EventStore) Summary(ctx context.Context, groupBy string, query EventQuery) ([]SummaryRow, error) {
	if s == nil || s.db == nil {
		return nil, nil
	}
	groupBy = strings.TrimSpace(strings.ToLower(groupBy))
	groupColumn, labelColumn := summaryColumns(groupBy)
	if groupColumn == "" {
		return nil, fmt.Errorf("unsupported group_by %q", groupBy)
	}
	where, args := buildEventWhere(query)
	stmt := fmt.Sprintf(`SELECT
		%s AS group_key,
		%s AS group_label,
		COUNT(*) AS requests,
		COALESCE(SUM(e.failed), 0) AS failures,
		COALESCE(SUM(e.total_tokens), 0) AS total_tokens,
		COALESCE(SUM(e.input_tokens), 0) AS input_tokens,
		COALESCE(SUM(e.output_tokens), 0) AS output_tokens,
		COALESCE(SUM(e.reasoning_tokens), 0) AS reasoning_tokens,
		COALESCE(SUM(e.cached_tokens), 0) AS cached_tokens,
		COALESCE(AVG(CASE WHEN e.latency_ms > 0 THEN e.latency_ms END), 0) AS average_latency_ms,
		COALESCE(AVG(CASE WHEN e.first_byte_latency_ms > 0 THEN e.first_byte_latency_ms END), 0) AS average_first_byte_latency_ms,
		COALESCE(MAX(e.timestamp_ms), 0) AS last_seen_ms
		FROM usage_events e
		LEFT JOIN usage_api_key_aliases a ON a.api_key_hash = e.api_key_hash
		%s
		GROUP BY group_key, group_label
		ORDER BY requests DESC, total_tokens DESC
		LIMIT ?`, groupColumn, labelColumn, where)
	args = append(args, normalizeLimit(query.Limit))
	rows, err := s.db.QueryContext(ctx, stmt, args...)
	if err != nil {
		return nil, fmt.Errorf("query usage summary: %w", err)
	}
	defer func() {
		if errClose := rows.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage summary rows close failed")
		}
	}()
	var out []SummaryRow
	for rows.Next() {
		var row SummaryRow
		row.Group = groupBy
		if errScan := rows.Scan(
			&row.Key,
			&row.Label,
			&row.Requests,
			&row.Failures,
			&row.Tokens,
			&row.InputTokens,
			&row.OutputTokens,
			&row.ReasoningTokens,
			&row.CachedTokens,
			&row.AverageLatencyMs,
			&row.AverageFirstByteMs,
			&row.LastSeenMs,
		); errScan != nil {
			return nil, fmt.Errorf("scan usage summary: %w", errScan)
		}
		row.Label = firstNonEmpty(row.Label, row.Key, "unknown")
		row.Successes = row.Requests - row.Failures
		out = append(out, row)
	}
	if errRows := rows.Err(); errRows != nil {
		return nil, fmt.Errorf("iterate usage summary: %w", errRows)
	}
	return out, nil
}

func (s *EventStore) Status(ctx context.Context) (EventStatus, error) {
	status := EventStatus{
		Enabled:       s != nil && s.db != nil,
		RetentionDays: 0,
	}
	if s == nil || s.db == nil {
		return status, nil
	}
	status.Path = s.path
	status.RetentionDays = s.retentionDays
	status.LastError = s.LastError()
	row := s.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(MIN(timestamp_ms), 0), COALESCE(MAX(timestamp_ms), 0) FROM usage_events`)
	if err := row.Scan(&status.EventCount, &status.OldestMs, &status.NewestMs); err != nil {
		return status, fmt.Errorf("query usage event status: %w", err)
	}
	return status, nil
}

func (s *EventStore) Prune(ctx context.Context) (int64, error) {
	if s == nil || s.db == nil || s.retentionDays <= 0 {
		return 0, nil
	}
	cutoff := time.Now().UTC().Add(-time.Duration(s.retentionDays) * 24 * time.Hour).UnixMilli()
	res, err := s.db.ExecContext(ctx, `DELETE FROM usage_events WHERE timestamp_ms < ?`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("prune usage events: %w", err)
	}
	deleted, _ := res.RowsAffected()
	return deleted, nil
}

func (s *EventStore) ExportJSONL(ctx context.Context, writer io.Writer, query EventQuery) error {
	if s == nil || s.db == nil {
		return nil
	}
	if writer == nil {
		return errors.New("usage event export writer is nil")
	}
	query.Limit = maxEventQueryLimit
	events, err := s.Events(ctx, query)
	if err != nil {
		return err
	}
	buffered := bufio.NewWriter(writer)
	encoder := json.NewEncoder(buffered)
	for i := len(events) - 1; i >= 0; i-- {
		if errEncode := encoder.Encode(events[i]); errEncode != nil {
			return fmt.Errorf("encode usage event jsonl: %w", errEncode)
		}
	}
	return buffered.Flush()
}

func (s *EventStore) ImportJSONL(ctx context.Context, reader io.Reader) (ImportResult, error) {
	result := ImportResult{}
	if s == nil || s.db == nil || reader == nil {
		return result, nil
	}
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	batch := make([]UsageEvent, 0, 256)
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		inserted, err := s.InsertEvents(ctx, batch)
		if err != nil {
			return err
		}
		result.Added += inserted.Added
		result.Skipped += inserted.Skipped
		batch = batch[:0]
		return nil
	}
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var event UsageEvent
		if err := json.Unmarshal(line, &event); err != nil {
			return result, fmt.Errorf("decode usage event jsonl: %w", err)
		}
		batch = append(batch, event)
		if len(batch) >= 256 {
			if err := flush(); err != nil {
				return result, err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return result, fmt.Errorf("scan usage event jsonl: %w", err)
	}
	if err := flush(); err != nil {
		return result, err
	}
	return result, nil
}

func (s *EventStore) ModelPrices(ctx context.Context) ([]ModelPrice, error) {
	if s == nil || s.db == nil {
		return nil, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT model, input_per_million, cached_input_per_million, output_per_million, updated_at FROM usage_model_prices ORDER BY model`)
	if err != nil {
		return nil, fmt.Errorf("query usage model prices: %w", err)
	}
	defer func() {
		if errClose := rows.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage model price rows close failed")
		}
	}()
	var prices []ModelPrice
	for rows.Next() {
		var price ModelPrice
		var updatedAt string
		if errScan := rows.Scan(&price.Model, &price.InputPerMillion, &price.CachedInputPerMillion, &price.OutputPerMillion, &updatedAt); errScan != nil {
			return nil, fmt.Errorf("scan usage model price: %w", errScan)
		}
		price.UpdatedAt = parseStoredTime(updatedAt)
		prices = append(prices, price)
	}
	return prices, rows.Err()
}

func (s *EventStore) SaveModelPrices(ctx context.Context, prices []ModelPrice) (int64, error) {
	if s == nil || s.db == nil || len(prices) == 0 {
		return 0, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin usage model price save: %w", err)
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()
	stmt, err := tx.PrepareContext(ctx, `INSERT INTO usage_model_prices (model, input_per_million, cached_input_per_million, output_per_million, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(model) DO UPDATE SET
			input_per_million = excluded.input_per_million,
			cached_input_per_million = excluded.cached_input_per_million,
			output_per_million = excluded.output_per_million,
			updated_at = excluded.updated_at`)
	if err != nil {
		return 0, fmt.Errorf("prepare usage model price save: %w", err)
	}
	defer func() {
		if errClose := stmt.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage model price statement close failed")
		}
	}()
	var saved int64
	now := time.Now().UTC()
	for _, raw := range prices {
		price := raw
		price.Model = strings.TrimSpace(price.Model)
		if price.Model == "" {
			continue
		}
		if price.UpdatedAt.IsZero() {
			price.UpdatedAt = now
		}
		if _, errExec := stmt.ExecContext(ctx, price.Model, nonNegativeFloat(price.InputPerMillion), nonNegativeFloat(price.CachedInputPerMillion), nonNegativeFloat(price.OutputPerMillion), price.UpdatedAt.UTC().Format(time.RFC3339Nano)); errExec != nil {
			return saved, fmt.Errorf("save usage model price: %w", errExec)
		}
		saved++
	}
	if errCommit := tx.Commit(); errCommit != nil {
		return saved, fmt.Errorf("commit usage model price save: %w", errCommit)
	}
	tx = nil
	return saved, nil
}

func FetchLiteLLMModelPrices(ctx context.Context) ([]ModelPrice, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, priceSyncURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create model price sync request: %w", err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch model price sync data: %w", err)
	}
	defer func() {
		if errClose := response.Body.Close(); errClose != nil {
			log.WithError(errClose).Warn("model price sync body close failed")
		}
	}()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("model price sync returned status %d", response.StatusCode)
	}
	var payload map[string]map[string]any
	if errDecode := json.NewDecoder(io.LimitReader(response.Body, 32*1024*1024)).Decode(&payload); errDecode != nil {
		return nil, fmt.Errorf("decode model price sync data: %w", errDecode)
	}
	prices := make([]ModelPrice, 0, len(payload))
	now := time.Now().UTC()
	for model, entry := range payload {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		input := numberFromAny(entry["input_cost_per_token"]) * 1_000_000
		output := numberFromAny(entry["output_cost_per_token"]) * 1_000_000
		cached := numberFromAny(entry["cache_read_input_token_cost"]) * 1_000_000
		if cached == 0 {
			cached = numberFromAny(entry["cache_creation_input_token_cost"]) * 1_000_000
		}
		if input == 0 && output == 0 && cached == 0 {
			continue
		}
		prices = append(prices, ModelPrice{
			Model:                 model,
			InputPerMillion:       input,
			CachedInputPerMillion: cached,
			OutputPerMillion:      output,
			UpdatedAt:             now,
		})
	}
	sort.Slice(prices, func(i, j int) bool {
		return prices[i].Model < prices[j].Model
	})
	return prices, nil
}

func (s *EventStore) APIKeyAliases(ctx context.Context) ([]APIKeyAlias, error) {
	if s == nil || s.db == nil {
		return nil, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT api_key_hash, alias, updated_at FROM usage_api_key_aliases ORDER BY alias, api_key_hash`)
	if err != nil {
		return nil, fmt.Errorf("query usage api key aliases: %w", err)
	}
	defer func() {
		if errClose := rows.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage api key alias rows close failed")
		}
	}()
	var aliases []APIKeyAlias
	for rows.Next() {
		var alias APIKeyAlias
		var updatedAt string
		if errScan := rows.Scan(&alias.APIKeyHash, &alias.Alias, &updatedAt); errScan != nil {
			return nil, fmt.Errorf("scan usage api key alias: %w", errScan)
		}
		alias.UpdatedAt = parseStoredTime(updatedAt)
		aliases = append(aliases, alias)
	}
	return aliases, rows.Err()
}

func (s *EventStore) SaveAPIKeyAlias(ctx context.Context, alias APIKeyAlias) error {
	if s == nil || s.db == nil {
		return nil
	}
	alias.APIKeyHash = strings.TrimSpace(alias.APIKeyHash)
	alias.Alias = strings.TrimSpace(alias.Alias)
	if alias.APIKeyHash == "" || alias.Alias == "" {
		return errors.New("api_key_hash and alias are required")
	}
	if alias.UpdatedAt.IsZero() {
		alias.UpdatedAt = time.Now().UTC()
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO usage_api_key_aliases (api_key_hash, alias, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(api_key_hash) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at`,
		alias.APIKeyHash, alias.Alias, alias.UpdatedAt.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("save usage api key alias: %w", err)
	}
	return nil
}

func (s *EventStore) DeleteAPIKeyAlias(ctx context.Context, hash string) error {
	if s == nil || s.db == nil {
		return nil
	}
	hash = strings.TrimSpace(hash)
	if hash == "" {
		return errors.New("api_key_hash is required")
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM usage_api_key_aliases WHERE api_key_hash = ?`, hash); err != nil {
		return fmt.Errorf("delete usage api key alias: %w", err)
	}
	return nil
}

func scanEvents(rows *sql.Rows) ([]UsageEvent, error) {
	var events []UsageEvent
	for rows.Next() {
		var event UsageEvent
		var timestampText string
		var failedInt int
		if err := rows.Scan(
			&event.ID,
			&event.EventHash,
			&event.RequestID,
			&event.TimestampMs,
			&timestampText,
			&event.Provider,
			&event.Model,
			&event.Alias,
			&event.Endpoint,
			&event.Method,
			&event.Path,
			&event.AuthType,
			&event.AuthID,
			&event.AuthIndex,
			&event.Source,
			&event.SourceHash,
			&event.APIKeyHash,
			&event.APIKeyAlias,
			&event.Tokens.InputTokens,
			&event.Tokens.OutputTokens,
			&event.Tokens.ReasoningTokens,
			&event.Tokens.CachedTokens,
			&event.Tokens.CacheReadTokens,
			&event.Tokens.CacheCreationTokens,
			&event.Tokens.TotalTokens,
			&event.LatencyMs,
			&event.FirstByteLatencyMs,
			&failedInt,
			&event.StatusCode,
			&event.FailureBody,
			&event.CreatedAtMs,
		); err != nil {
			return nil, fmt.Errorf("scan usage event: %w", err)
		}
		event.Failed = failedInt != 0
		event.Timestamp = parseStoredTime(timestampText)
		if event.Timestamp.IsZero() && event.TimestampMs > 0 {
			event.Timestamp = time.UnixMilli(event.TimestampMs).UTC()
		}
		event.Tokens = normaliseTokenStats(event.Tokens)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate usage events: %w", err)
	}
	return events, nil
}

func buildEventWhere(query EventQuery) (string, []any) {
	var clauses []string
	var args []any
	if !query.From.IsZero() {
		clauses = append(clauses, "e.timestamp_ms >= ?")
		args = append(args, query.From.UTC().UnixMilli())
	}
	if !query.To.IsZero() {
		clauses = append(clauses, "e.timestamp_ms <= ?")
		args = append(args, query.To.UTC().UnixMilli())
	}
	exactFilters := []struct {
		column string
		value  string
	}{
		{"e.provider", query.Provider},
		{"e.model", query.Model},
		{"e.endpoint", query.Endpoint},
		{"e.auth_type", query.AuthType},
		{"e.auth_index", query.AuthIndex},
		{"e.api_key_hash", query.APIKeyHash},
	}
	for _, filter := range exactFilters {
		if value := strings.TrimSpace(filter.value); value != "" {
			clauses = append(clauses, filter.column+" = ?")
			args = append(args, value)
		}
	}
	if query.Failed != nil {
		clauses = append(clauses, "e.failed = ?")
		args = append(args, boolToInt(*query.Failed))
	}
	if search := strings.TrimSpace(query.Search); search != "" {
		like := "%" + search + "%"
		clauses = append(clauses, `(e.provider LIKE ? OR e.model LIKE ? OR e.alias LIKE ? OR e.endpoint LIKE ? OR e.auth_type LIKE ? OR e.auth_index LIKE ? OR e.source LIKE ? OR e.api_key_hash LIKE ? OR COALESCE(a.alias, '') LIKE ?)`)
		args = append(args, like, like, like, like, like, like, like, like, like)
	}
	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func summaryColumns(groupBy string) (string, string) {
	switch groupBy {
	case "", "model":
		return "COALESCE(NULLIF(e.model, ''), 'unknown')", "COALESCE(NULLIF(e.model, ''), 'unknown')"
	case "provider":
		return "COALESCE(NULLIF(e.provider, ''), 'unknown')", "COALESCE(NULLIF(e.provider, ''), 'unknown')"
	case "endpoint":
		return "COALESCE(NULLIF(e.endpoint, ''), 'unknown')", "COALESCE(NULLIF(e.endpoint, ''), 'unknown')"
	case "auth_index", "account":
		return "COALESCE(NULLIF(e.auth_index, ''), NULLIF(e.source, ''), 'unknown')", "COALESCE(NULLIF(e.source, ''), NULLIF(e.auth_index, ''), 'unknown')"
	case "auth_type":
		return "COALESCE(NULLIF(e.auth_type, ''), 'unknown')", "COALESCE(NULLIF(e.auth_type, ''), 'unknown')"
	case "api_key", "api_key_hash":
		return "COALESCE(NULLIF(e.api_key_hash, ''), 'unkeyed')", "COALESCE(NULLIF(a.alias, ''), NULLIF(e.api_key_hash, ''), 'unkeyed')"
	case "source":
		return "COALESCE(NULLIF(e.source_hash, ''), NULLIF(e.source, ''), 'unknown')", "COALESCE(NULLIF(e.source, ''), NULLIF(e.source_hash, ''), 'unknown')"
	case "status":
		return "CAST(e.status_code AS TEXT)", "CAST(e.status_code AS TEXT)"
	default:
		return "", ""
	}
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return DefaultEventQueryLimit
	}
	if limit > maxEventQueryLimit {
		return maxEventQueryLimit
	}
	return limit
}

func normalizeEvent(event UsageEvent) UsageEvent {
	if event.Timestamp.IsZero() {
		if event.TimestampMs > 0 {
			event.Timestamp = time.UnixMilli(event.TimestampMs).UTC()
		} else {
			event.Timestamp = time.Now().UTC()
		}
	} else {
		event.Timestamp = event.Timestamp.UTC()
	}
	if event.TimestampMs <= 0 {
		event.TimestampMs = event.Timestamp.UnixMilli()
	}
	event.Provider = firstNonEmpty(strings.TrimSpace(event.Provider), "unknown")
	event.Model = firstNonEmpty(strings.TrimSpace(event.Model), "unknown")
	event.Alias = firstNonEmpty(strings.TrimSpace(event.Alias), event.Model)
	event.Endpoint = firstNonEmpty(strings.TrimSpace(event.Endpoint), "unknown")
	event.Method = strings.TrimSpace(event.Method)
	event.Path = strings.TrimSpace(event.Path)
	if event.Method == "" || event.Path == "" {
		event.Method, event.Path = splitEndpoint(event.Endpoint)
	}
	event.AuthType = firstNonEmpty(strings.TrimSpace(event.AuthType), "unknown")
	event.AuthID = strings.TrimSpace(event.AuthID)
	event.AuthIndex = strings.TrimSpace(event.AuthIndex)
	event.Source = strings.TrimSpace(event.Source)
	event.SourceHash = firstNonEmpty(strings.TrimSpace(event.SourceHash), hashDisplayValue(event.Source))
	event.APIKeyHash = strings.TrimSpace(event.APIKeyHash)
	event.APIKeyAlias = strings.TrimSpace(event.APIKeyAlias)
	event.Tokens = normaliseTokenStats(event.Tokens)
	event.LatencyMs = nonNegativeInt(event.LatencyMs)
	event.FirstByteLatencyMs = nonNegativeInt(event.FirstByteLatencyMs)
	event.StatusCode = nonNegativeStatus(event.StatusCode, event.Failed)
	event.FailureBody = sanitizeFailureBody(event.FailureBody)
	if event.CreatedAtMs <= 0 {
		event.CreatedAtMs = time.Now().UTC().UnixMilli()
	}
	if strings.TrimSpace(event.EventHash) == "" {
		event.EventHash = eventHash(event)
	}
	return event
}

func eventHash(event UsageEvent) string {
	tokens := normaliseTokenStats(event.Tokens)
	parts := []string{
		event.RequestID,
		strconv.FormatInt(event.TimestampMs, 10),
		event.Provider,
		event.Model,
		event.Alias,
		event.Endpoint,
		event.AuthType,
		event.AuthID,
		event.AuthIndex,
		event.SourceHash,
		event.APIKeyHash,
		strconv.FormatInt(tokens.InputTokens, 10),
		strconv.FormatInt(tokens.OutputTokens, 10),
		strconv.FormatInt(tokens.ReasoningTokens, 10),
		strconv.FormatInt(tokens.CachedTokens, 10),
		strconv.FormatInt(tokens.TotalTokens, 10),
		strconv.FormatInt(event.LatencyMs, 10),
		strconv.Itoa(event.StatusCode),
		strconv.FormatBool(event.Failed),
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:])
}

func eventDisplayKey(event UsageEvent) string {
	return firstNonEmpty(event.APIKeyAlias, shortHash(event.APIKeyHash), event.AuthIndex, event.Source, event.Endpoint, event.Provider, "unknown")
}

func hashDisplayValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func shortHash(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) <= 12 {
		return value
	}
	return value[:12]
}

func splitEndpoint(endpoint string) (string, string) {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return "", ""
	}
	parts := strings.Fields(endpoint)
	if len(parts) >= 2 {
		return parts[0], strings.Join(parts[1:], " ")
	}
	if strings.HasPrefix(endpoint, "/") {
		return "", endpoint
	}
	return endpoint, ""
}

func sanitizeFailureBody(body string) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return ""
	}
	body = strings.Map(func(r rune) rune {
		switch r {
		case '\n', '\r', '\t':
			return r
		default:
			if r < 0x20 {
				return -1
			}
			return r
		}
	}, body)
	for len(body) > maxFailureBodyBytes {
		body = body[:maxFailureBodyBytes]
		if utf8.ValidString(body) {
			break
		}
		body = body[:len(body)-1]
	}
	return body
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nonNegativeInt(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}

func nonNegativeFloat(value float64) float64 {
	if value < 0 {
		return 0
	}
	return value
}

func nonNegativeStatus(value int, failed bool) int {
	if value > 0 {
		return value
	}
	if failed {
		return http.StatusInternalServerError
	}
	return http.StatusOK
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func parseStoredTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UTC()
	}
	if parsedMs, err := strconv.ParseInt(value, 10, 64); err == nil && parsedMs > 0 {
		return time.UnixMilli(parsedMs).UTC()
	}
	return time.Time{}
}

func numberFromAny(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		parsed, _ := typed.Float64()
		return parsed
	case string:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return parsed
	default:
		return 0
	}
}
