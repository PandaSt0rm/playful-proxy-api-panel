CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE config_revisions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor_ip TEXT NOT NULL,
  management_path TEXT NOT NULL,
  action TEXT NOT NULL,
  before_sha256 TEXT NOT NULL,
  after_sha256 TEXT NOT NULL,
  before_yaml BLOB NOT NULL,
  after_yaml BLOB NOT NULL
);
CREATE INDEX config_revisions_created_at ON config_revisions(created_at DESC);
CREATE TABLE provider_diagnostics (
  id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_auth_index TEXT NOT NULL,
  target_label TEXT NOT NULL,
  check_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  http_status INTEGER,
  model_count INTEGER,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  detail_json BLOB NOT NULL
);
CREATE INDEX provider_diagnostics_target ON provider_diagnostics(target_kind, target_auth_index, checked_at DESC, id DESC);
CREATE TABLE usage_budgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  match_value TEXT NOT NULL,
  period TEXT NOT NULL,
  limit_microusd INTEGER NOT NULL,
  warning_percent INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(scope, match_value, period)
);
