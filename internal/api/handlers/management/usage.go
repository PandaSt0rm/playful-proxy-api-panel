package management

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/redisqueue"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/usage"
)

type usageExportPayload struct {
	Version    int                      `json:"version"`
	ExportedAt time.Time                `json:"exported_at"`
	Usage      usage.StatisticsSnapshot `json:"usage"`
}

type usageImportPayload struct {
	Version int                      `json:"version"`
	Usage   usage.StatisticsSnapshot `json:"usage"`
}

type usageEventsResponse struct {
	Events []usage.UsageEvent `json:"events"`
	Limit  int                `json:"limit"`
}

type usageSummaryResponse struct {
	GroupBy string             `json:"group_by"`
	Rows    []usage.SummaryRow `json:"rows"`
	Limit   int                `json:"limit"`
}

type usageModelPricesPayload struct {
	Prices []usage.ModelPrice `json:"prices"`
}

type usageAPIKeyAliasesPayload struct {
	Aliases []usage.APIKeyAlias `json:"aliases"`
}

type usageQueueRecord []byte

func (r usageQueueRecord) MarshalJSON() ([]byte, error) {
	if json.Valid(r) {
		return append([]byte(nil), r...), nil
	}
	return json.Marshal(string(r))
}

// GetUsageStatistics returns the request statistics snapshot.
func (h *Handler) GetUsageStatistics(c *gin.Context) {
	var snapshot usage.StatisticsSnapshot
	storage := "memory"
	if store := usage.GetEventStore(); store != nil {
		query, err := h.parseUsageEventQuery(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		storeSnapshot, errSnapshot := store.Snapshot(c.Request.Context(), query)
		if errSnapshot != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query usage events"})
			return
		}
		snapshot = storeSnapshot
		storage = "sqlite"
	} else if h != nil && h.usageStats != nil {
		snapshot = h.usageStats.Snapshot()
	}
	c.JSON(http.StatusOK, gin.H{
		"usage":           snapshot,
		"failed_requests": snapshot.FailureCount,
		"storage":         storage,
	})
}

// ExportUsageStatistics returns a complete usage snapshot for backup/migration.
func (h *Handler) ExportUsageStatistics(c *gin.Context) {
	if strings.EqualFold(strings.TrimSpace(c.Query("format")), "jsonl") {
		store := usage.GetEventStore()
		if store == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "usage event store unavailable"})
			return
		}
		query, err := h.parseUsageEventQuery(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		filename := fmt.Sprintf("ppap-usage-events-%s.jsonl", time.Now().UTC().Format("20060102T150405Z"))
		c.Header("Content-Type", "application/x-ndjson; charset=utf-8")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
		if errExport := store.ExportJSONL(c.Request.Context(), c.Writer, query); errExport != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
		return
	}

	var snapshot usage.StatisticsSnapshot
	if store := usage.GetEventStore(); store != nil {
		query, err := h.parseUsageEventQuery(c)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		storeSnapshot, errSnapshot := store.Snapshot(c.Request.Context(), query)
		if errSnapshot != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query usage events"})
			return
		}
		snapshot = storeSnapshot
	} else if h != nil && h.usageStats != nil {
		snapshot = h.usageStats.Snapshot()
	}
	c.JSON(http.StatusOK, usageExportPayload{
		Version:    1,
		ExportedAt: time.Now().UTC(),
		Usage:      snapshot,
	})
}

// ImportUsageStatistics merges a previously exported usage snapshot into memory.
func (h *Handler) ImportUsageStatistics(c *gin.Context) {
	if h == nil || h.usageStats == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usage statistics unavailable"})
		return
	}

	data, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}
	trimmed := bytes.TrimSpace(data)

	var payload usageImportPayload
	if err := json.Unmarshal(trimmed, &payload); err == nil && looksLikeUsageSnapshot(trimmed, payload) {
		if payload.Version != 0 && payload.Version != 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported version"})
			return
		}

		result := h.usageStats.MergeSnapshot(payload.Usage)
		if store := usage.GetEventStore(); store != nil {
			if _, errStore := importSnapshotIntoEventStore(c.Request.Context(), store, payload.Usage); errStore != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist usage events"})
				return
			}
		}
		if err := usage.SaveConfiguredStatistics(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to persist usage statistics"})
			return
		}
		snapshot := h.usageStats.Snapshot()
		c.JSON(http.StatusOK, gin.H{
			"added":           result.Added,
			"skipped":         result.Skipped,
			"total_requests":  snapshot.TotalRequests,
			"failed_requests": snapshot.FailureCount,
		})
		return
	}

	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usage event store unavailable"})
		return
	}
	result, errImport := store.ImportJSONL(c.Request.Context(), bytes.NewReader(trimmed))
	if errImport != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": errImport.Error()})
		return
	}
	status, _ := store.Status(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{
		"added":           result.Added,
		"skipped":         result.Skipped,
		"total_requests":  status.EventCount,
		"failed_requests": 0,
	})
}

// GetUsageEvents returns normalized persisted usage events.
func (h *Handler) GetUsageEvents(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusOK, usageEventsResponse{Events: []usage.UsageEvent{}, Limit: h.usageQueryLimit()})
		return
	}
	query, err := h.parseUsageEventQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	events, errEvents := store.Events(c.Request.Context(), query)
	if errEvents != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query usage events"})
		return
	}
	c.JSON(http.StatusOK, usageEventsResponse{Events: events, Limit: query.Limit})
}

// GetUsageSummary returns grouped usage aggregates.
func (h *Handler) GetUsageSummary(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusOK, usageSummaryResponse{
			GroupBy: firstNonEmptyValue(c.Query("group_by"), "model"),
			Rows:    []usage.SummaryRow{},
			Limit:   h.usageQueryLimit(),
		})
		return
	}
	query, err := h.parseUsageEventQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	groupBy := firstNonEmptyValue(c.Query("group_by"), "model")
	rows, errSummary := store.Summary(c.Request.Context(), groupBy, query)
	if errSummary != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": errSummary.Error()})
		return
	}
	c.JSON(http.StatusOK, usageSummaryResponse{GroupBy: groupBy, Rows: rows, Limit: query.Limit})
}

// GetUsageStatus reports persistent usage store health.
func (h *Handler) GetUsageStatus(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusOK, usage.EventStatus{Enabled: false})
		return
	}
	status, err := store.Status(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query usage status"})
		return
	}
	c.JSON(http.StatusOK, status)
}

// PruneUsageEvents applies the configured SQLite usage event retention policy immediately.
func (h *Handler) PruneUsageEvents(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usage event store unavailable"})
		return
	}
	deleted, err := store.Prune(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prune usage events"})
		return
	}
	status, errStatus := store.Status(c.Request.Context())
	if errStatus != nil {
		c.JSON(http.StatusOK, gin.H{"deleted": deleted})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": deleted, "status": status})
}

// GetUsageModelPrices returns custom model price overrides.
func (h *Handler) GetUsageModelPrices(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusOK, usageModelPricesPayload{Prices: []usage.ModelPrice{}})
		return
	}
	prices, err := store.ModelPrices(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query model prices"})
		return
	}
	c.JSON(http.StatusOK, usageModelPricesPayload{Prices: prices})
}

// PutUsageModelPrices replaces or upserts model price overrides.
func (h *Handler) PutUsageModelPrices(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usage event store unavailable"})
		return
	}
	var payload usageModelPricesPayload
	data, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}
	if err := json.Unmarshal(data, &payload); err != nil || len(payload.Prices) == 0 {
		var direct []usage.ModelPrice
		if errDirect := json.Unmarshal(data, &direct); errDirect != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid model price payload"})
			return
		}
		payload.Prices = direct
	}
	saved, errSave := store.SaveModelPrices(c.Request.Context(), payload.Prices)
	if errSave != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": errSave.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"saved": saved})
}

// SyncUsageModelPrices refreshes model price estimates from LiteLLM's public price file.
func (h *Handler) SyncUsageModelPrices(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usage event store unavailable"})
		return
	}
	prices, err := usage.FetchLiteLLMModelPrices(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	saved, errSave := store.SaveModelPrices(c.Request.Context(), prices)
	if errSave != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save synced model prices"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"saved": saved, "source": "litellm", "url": "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"})
}

// GetUsageAPIKeyAliases returns API-key display aliases keyed by SHA-256 hash.
func (h *Handler) GetUsageAPIKeyAliases(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusOK, usageAPIKeyAliasesPayload{Aliases: []usage.APIKeyAlias{}})
		return
	}
	aliases, err := store.APIKeyAliases(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query api key aliases"})
		return
	}
	c.JSON(http.StatusOK, usageAPIKeyAliasesPayload{Aliases: aliases})
}

// PutUsageAPIKeyAliases upserts one or more API-key display aliases.
func (h *Handler) PutUsageAPIKeyAliases(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usage event store unavailable"})
		return
	}
	var payload struct {
		usage.APIKeyAlias
		Aliases []usage.APIKeyAlias `json:"aliases"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid api key alias payload"})
		return
	}
	aliases := payload.Aliases
	if len(aliases) == 0 && payload.APIKeyHash != "" {
		aliases = []usage.APIKeyAlias{payload.APIKeyAlias}
	}
	var saved int
	for _, alias := range aliases {
		if err := store.SaveAPIKeyAlias(c.Request.Context(), alias); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		saved++
	}
	c.JSON(http.StatusOK, gin.H{"saved": saved})
}

// DeleteUsageAPIKeyAlias removes a stored API-key display alias.
func (h *Handler) DeleteUsageAPIKeyAlias(c *gin.Context) {
	store := usage.GetEventStore()
	if store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usage event store unavailable"})
		return
	}
	hash := firstNonEmptyValue(c.Param("hash"), c.Query("api_key_hash"))
	if err := store.DeleteAPIKeyAlias(c.Request.Context(), hash); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// GetUsageQueue pops queued usage records from the usage queue.
func (h *Handler) GetUsageQueue(c *gin.Context) {
	if h == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "handler unavailable"})
		return
	}

	count, errCount := parseUsageQueueCount(c.Query("count"))
	if errCount != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": errCount.Error()})
		return
	}

	items := redisqueue.PopOldest(count)
	records := make([]usageQueueRecord, 0, len(items))
	for _, item := range items {
		records = append(records, usageQueueRecord(append([]byte(nil), item...)))
	}

	c.JSON(http.StatusOK, records)
}

func parseUsageQueueCount(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 1, nil
	}
	count, errCount := strconv.Atoi(value)
	if errCount != nil || count <= 0 {
		return 0, errors.New("count must be a positive integer")
	}
	return count, nil
}

func (h *Handler) usageQueryLimit() int {
	if h == nil || h.cfg == nil || h.cfg.UsageStatisticsQueryLimit <= 0 {
		return usage.DefaultEventQueryLimit
	}
	if h.cfg.UsageStatisticsQueryLimit > 200000 {
		return 200000
	}
	return h.cfg.UsageStatisticsQueryLimit
}

func (h *Handler) parseUsageEventQuery(c *gin.Context) (usage.EventQuery, error) {
	query := usage.EventQuery{
		Limit:      h.usageQueryLimit(),
		Provider:   strings.TrimSpace(c.Query("provider")),
		Model:      strings.TrimSpace(c.Query("model")),
		Endpoint:   strings.TrimSpace(c.Query("endpoint")),
		AuthType:   strings.TrimSpace(c.Query("auth_type")),
		AuthIndex:  strings.TrimSpace(c.Query("auth_index")),
		APIKeyHash: strings.TrimSpace(c.Query("api_key_hash")),
		Search:     strings.TrimSpace(c.Query("search")),
	}
	if limitValue := strings.TrimSpace(c.Query("limit")); limitValue != "" {
		limit, err := strconv.Atoi(limitValue)
		if err != nil || limit <= 0 {
			return query, errors.New("limit must be a positive integer")
		}
		query.Limit = limit
	}
	if fromValue := strings.TrimSpace(c.Query("from")); fromValue != "" {
		from, err := parseUsageQueryTime(fromValue)
		if err != nil {
			return query, fmt.Errorf("invalid from: %w", err)
		}
		query.From = from
	}
	if toValue := strings.TrimSpace(c.Query("to")); toValue != "" {
		to, err := parseUsageQueryTime(toValue)
		if err != nil {
			return query, fmt.Errorf("invalid to: %w", err)
		}
		query.To = to
	}
	if failedValue := strings.TrimSpace(c.Query("failed")); failedValue != "" {
		failed, err := strconv.ParseBool(failedValue)
		if err != nil {
			return query, errors.New("failed must be true or false")
		}
		query.Failed = &failed
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		switch strings.ToLower(status) {
		case "failed", "failure", "error":
			failed := true
			query.Failed = &failed
		case "ok", "success", "successful":
			failed := false
			query.Failed = &failed
		default:
			return query, errors.New("status must be success or failed")
		}
	}
	return query, nil
}

func parseUsageQueryTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UTC(), nil
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed.UTC(), nil
	}
	if millis, err := strconv.ParseInt(value, 10, 64); err == nil {
		if millis > 1_000_000_000_000 {
			return time.UnixMilli(millis).UTC(), nil
		}
		return time.Unix(millis, 0).UTC(), nil
	}
	return time.Time{}, errors.New("expected RFC3339, yyyy-mm-dd, unix seconds, or unix milliseconds")
}

func looksLikeUsageSnapshot(raw []byte, payload usageImportPayload) bool {
	if bytes.Contains(raw, []byte(`"usage"`)) {
		return true
	}
	if payload.Usage.TotalRequests > 0 || payload.Usage.SuccessCount > 0 || payload.Usage.FailureCount > 0 {
		return true
	}
	return len(payload.Usage.APIs) > 0
}

func importSnapshotIntoEventStore(ctx context.Context, store *usage.EventStore, snapshot usage.StatisticsSnapshot) (usage.ImportResult, error) {
	var events []usage.UsageEvent
	for apiName, apiSnapshot := range snapshot.APIs {
		for modelName, modelSnapshot := range apiSnapshot.Models {
			for _, detail := range modelSnapshot.Details {
				timestamp := detail.Timestamp
				if timestamp.IsZero() {
					timestamp = time.Now().UTC()
				}
				statusCode := detail.Fail.StatusCode
				if statusCode <= 0 {
					if detail.Failed {
						statusCode = http.StatusInternalServerError
					} else {
						statusCode = http.StatusOK
					}
				}
				event := usage.UsageEvent{
					Timestamp:          timestamp,
					TimestampMs:        timestamp.UTC().UnixMilli(),
					Provider:           "legacy",
					Model:              modelName,
					Alias:              modelName,
					Endpoint:           "legacy",
					AuthType:           "legacy",
					APIKeyHash:         hashUsageDisplayValue(apiName),
					AuthIndex:          detail.AuthIndex,
					Source:             detail.Source,
					Tokens:             detail.Tokens,
					LatencyMs:          detail.LatencyMs,
					FirstByteLatencyMs: detail.FirstByteLatencyMs,
					Failed:             detail.Failed,
					StatusCode:         statusCode,
					FailureBody:        detail.Fail.Body,
					CreatedAtMs:        time.Now().UTC().UnixMilli(),
				}
				events = append(events, event)
			}
		}
	}
	return store.InsertEvents(ctx, events)
}

func hashUsageDisplayValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func firstNonEmptyValue(values ...string) string {
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}
