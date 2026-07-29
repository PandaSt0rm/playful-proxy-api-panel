package controlstore

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct {
	db *sql.DB
}

type Revision struct {
	ID             string
	CreatedAt      time.Time
	ActorIP        string
	ManagementPath string
	Action         string
	BeforeSHA256   string
	AfterSHA256    string
	BeforeYAML     []byte
	AfterYAML      []byte
}

type Budget struct {
	ID             string
	Name           string
	Scope          string
	MatchValue     string
	Period         string
	LimitMicroUSD  int64
	WarningPercent int
	Enabled        bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func ResolvePath(configPath string) string {
	if configured := os.Getenv("AIPROXY_CONTROL_DB"); configured != "" {
		return configured
	}
	if writable := os.Getenv("WRITABLE_PATH"); writable != "" {
		return filepath.Join(writable, "aiproxy-control.sqlite")
	}
	return filepath.Join(filepath.Dir(configPath), "aiproxy-control.sqlite")
}

func Open(ctx context.Context, path string) (*Store, error) {
	if path == "" {
		return nil, errors.New("control store path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create control store directory: %w", err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open control store: %w", err)
	}
	db.SetMaxOpenConns(1)
	store := &Store{db: db}
	if _, err = db.ExecContext(ctx, "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("configure control store: %w", err)
	}
	if err = os.Chmod(path, 0o600); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("secure control store: %w", err)
	}
	if err = store.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin control store migration: %w", err)
	}
	defer tx.Rollback()
	var exists int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'").Scan(&exists); err != nil {
		return fmt.Errorf("inspect control store schema: %w", err)
	}
	if exists == 0 {
		script, readErr := migrations.ReadFile("migrations/001_initial.sql")
		if readErr != nil {
			return fmt.Errorf("read control store migration: %w", readErr)
		}
		if _, err = tx.ExecContext(ctx, string(script)); err != nil {
			return fmt.Errorf("apply control store migration 1: %w", err)
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)", time.Now().UTC().Format(time.RFC3339)); err != nil {
			return fmt.Errorf("record control store migration 1: %w", err)
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit control store migration: %w", err)
	}
	return nil
}

func NewID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate id: %w", err)
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(raw[:])
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:32], nil
}

func (s *Store) InsertRevision(ctx context.Context, revision Revision) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO config_revisions(id,created_at,actor_ip,management_path,action,before_sha256,after_sha256,before_yaml,after_yaml) VALUES(?,?,?,?,?,?,?,?,?)`, revision.ID, revision.CreatedAt.UTC().Format(time.RFC3339), revision.ActorIP, revision.ManagementPath, revision.Action, revision.BeforeSHA256, revision.AfterSHA256, revision.BeforeYAML, revision.AfterYAML)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM config_revisions WHERE id NOT IN (SELECT id FROM config_revisions ORDER BY created_at DESC,id DESC LIMIT 500)`); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ListRevisions(ctx context.Context, limit int) ([]Revision, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,created_at,actor_ip,management_path,action,before_sha256,after_sha256 FROM config_revisions ORDER BY created_at DESC,id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	revisions := make([]Revision, 0)
	for rows.Next() {
		var revision Revision
		var created string
		if err = rows.Scan(&revision.ID, &created, &revision.ActorIP, &revision.ManagementPath, &revision.Action, &revision.BeforeSHA256, &revision.AfterSHA256); err != nil {
			return nil, err
		}
		revision.CreatedAt, err = time.Parse(time.RFC3339, created)
		if err != nil {
			return nil, err
		}
		revisions = append(revisions, revision)
	}
	return revisions, rows.Err()
}

func (s *Store) GetRevision(ctx context.Context, id string) (Revision, error) {
	var revision Revision
	var created string
	err := s.db.QueryRowContext(ctx, `SELECT id,created_at,actor_ip,management_path,action,before_sha256,after_sha256,before_yaml,after_yaml FROM config_revisions WHERE id=?`, id).Scan(&revision.ID, &created, &revision.ActorIP, &revision.ManagementPath, &revision.Action, &revision.BeforeSHA256, &revision.AfterSHA256, &revision.BeforeYAML, &revision.AfterYAML)
	if err != nil {
		return Revision{}, err
	}
	revision.CreatedAt, err = time.Parse(time.RFC3339, created)
	return revision, err
}

func (s *Store) ListBudgets(ctx context.Context) ([]Budget, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,scope,match_value,period,limit_microusd,warning_percent,enabled,created_at,updated_at FROM usage_budgets ORDER BY created_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	budgets := make([]Budget, 0)
	for rows.Next() {
		var budget Budget
		var enabled int
		var created, updated string
		if err = rows.Scan(&budget.ID, &budget.Name, &budget.Scope, &budget.MatchValue, &budget.Period, &budget.LimitMicroUSD, &budget.WarningPercent, &enabled, &created, &updated); err != nil {
			return nil, err
		}
		budget.Enabled = enabled == 1
		budget.CreatedAt, err = time.Parse(time.RFC3339, created)
		if err == nil {
			budget.UpdatedAt, err = time.Parse(time.RFC3339, updated)
		}
		if err != nil {
			return nil, err
		}
		budgets = append(budgets, budget)
	}
	return budgets, rows.Err()
}

type Diagnostic struct {
	ID, TargetKind, TargetAuthIndex, TargetLabel, CheckKind, Status, Category, Message string
	CheckedAt                                                                          time.Time
	LatencyMS                                                                          int64
	HTTPStatus, ModelCount                                                             *int
	DetailJSON                                                                         []byte
}

func (s *Store) InsertDiagnostic(ctx context.Context, item Diagnostic) error {
	var httpStatus, modelCount any
	if item.HTTPStatus != nil {
		httpStatus = *item.HTTPStatus
	}
	if item.ModelCount != nil {
		modelCount = *item.ModelCount
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO provider_diagnostics
		(id,checked_at,target_kind,target_auth_index,target_label,check_kind,status,latency_ms,http_status,model_count,category,message,detail_json)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		item.ID, item.CheckedAt.UTC().Format(time.RFC3339Nano), item.TargetKind, item.TargetAuthIndex, item.TargetLabel,
		item.CheckKind, item.Status, item.LatencyMS, httpStatus, modelCount, item.Category, item.Message, item.DetailJSON)
	return err
}

func (s *Store) ListDiagnostics(ctx context.Context, targetKind, targetAuthIndex string, limit int) ([]Diagnostic, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,checked_at,target_kind,target_auth_index,target_label,check_kind,status,latency_ms,http_status,model_count,category,message,detail_json
		FROM provider_diagnostics WHERE (?='' OR target_kind=?) AND (?='' OR target_auth_index=?)
		ORDER BY checked_at DESC,id DESC LIMIT ?`, targetKind, targetKind, targetAuthIndex, targetAuthIndex, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Diagnostic, 0)
	for rows.Next() {
		var item Diagnostic
		var checked string
		var httpStatus, modelCount sql.NullInt64
		if err = rows.Scan(&item.ID, &checked, &item.TargetKind, &item.TargetAuthIndex, &item.TargetLabel, &item.CheckKind, &item.Status, &item.LatencyMS, &httpStatus, &modelCount, &item.Category, &item.Message, &item.DetailJSON); err != nil {
			return nil, err
		}
		item.CheckedAt, err = time.Parse(time.RFC3339Nano, checked)
		if err != nil {
			return nil, err
		}
		if httpStatus.Valid {
			value := int(httpStatus.Int64)
			item.HTTPStatus = &value
		}
		if modelCount.Valid {
			value := int(modelCount.Int64)
			item.ModelCount = &value
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreateBudget(ctx context.Context, budget Budget) error {
	enabled := 0
	if budget.Enabled {
		enabled = 1
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO usage_budgets(id,name,scope,match_value,period,limit_microusd,warning_percent,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, budget.ID, budget.Name, budget.Scope, budget.MatchValue, budget.Period, budget.LimitMicroUSD, budget.WarningPercent, enabled, budget.CreatedAt.UTC().Format(time.RFC3339), budget.UpdatedAt.UTC().Format(time.RFC3339))
	return err
}

func (s *Store) UpdateBudget(ctx context.Context, budget Budget) (bool, error) {
	enabled := 0
	if budget.Enabled {
		enabled = 1
	}
	result, err := s.db.ExecContext(ctx, `UPDATE usage_budgets SET name=?,scope=?,match_value=?,period=?,limit_microusd=?,warning_percent=?,enabled=?,updated_at=? WHERE id=?`, budget.Name, budget.Scope, budget.MatchValue, budget.Period, budget.LimitMicroUSD, budget.WarningPercent, enabled, budget.UpdatedAt.UTC().Format(time.RFC3339), budget.ID)
	if err != nil {
		return false, err
	}
	affected, err := result.RowsAffected()
	return affected == 1, err
}

func (s *Store) DeleteBudget(ctx context.Context, id string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM usage_budgets WHERE id=?`, id)
	if err != nil {
		return false, err
	}
	affected, err := result.RowsAffected()
	return affected == 1, err
}
