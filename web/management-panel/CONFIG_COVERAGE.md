# CLIProxyAPI v7 Config Coverage

Source of truth: `src/internal/config/config.go`, `src/internal/config/sdk_config.go`, and `src/config.example.yaml`.

## Coverage Matrix

| Config path | Dashboard surface | Save path | Decision |
| --- | --- | --- | --- |
| `host`, `port`, `tls.*`, `home.*`, `remote-management.*`, `auth-dir` | Config visual editor | `/config.yaml` | Structural/runtime fields stay in the config editor. |
| `debug`, `commercial-mode`, `logging-to-file`, `logs-max-total-size-mb`, `error-logs-max-files`, `request-log`, `usage-statistics-*`, `redis-usage-queue-retention-seconds`, `pprof.*` | Config visual editor; dashboard pills for key runtime status | `/config.yaml` plus existing simple endpoints where available | Safe operational controls are exposed visually. |
| `proxy-url`, `passthrough-headers`, `disable-image-generation`, `enable-gemini-cli-endpoint`, `force-model-prefix`, `ws-auth`, `codex.identity-confuse`, `plugins.enabled`, `plugins.dir` | Config visual editor; dashboard shows image generation and WebSocket auth | `/config.yaml` plus existing simple endpoints where available | Network/request behavior is visible without source editing. `codex.identity-confuse`, `plugins.enabled`, and `plugins.dir` are typed controls in the Network section. |
| `plugins.configs.<id>` | Plugins page: per-plugin enable toggle and metadata-driven config editor (priority, declared config fields) | `GET /v0/management/plugins`, `PATCH /v0/management/plugins/:id/enabled`, `PUT /v0/management/plugins/:id/config` | Undeclared/advanced keys remain editable in the config source editor; the editor preserves keys it does not manage. |
| `request-retry`, `max-retry-credentials`, `max-retry-interval`, `quota-exceeded.*`, `routing.*`, `streaming.*` | Config visual editor; dashboard shows retry and routing | `/config.yaml` plus existing simple endpoints where available | Retry/routing controls remain centralized. |
| `upstream-concurrency.default`, `providers`, `queue-timeout-seconds` | Config visual editor, dashboard, provider cards, provider edit pages | `/upstream-concurrency` management endpoints and `/config.yaml` visual save | Full structured support. Provider edit pages write the global provider map. |
| `api-keys` | Config visual editor and API key management | Existing API key endpoints and `/config.yaml` | Existing key-management UX remains the main surface. |
| `gemini-api-key`, `codex-api-key`, `claude-api-key`, `vertex-api-key`, `openai-compatibility` | AI Providers list/edit pages | Provider management endpoints | Provider-owned fields are edited in provider-specific pages and preserve unknown raw fields. |
| Provider `disable-cooling`, Codex `websockets`, Claude `cloak`, Claude `experimental-cch-signing`, OpenAI model `thinking`, OpenAI model `thinking-payloads` | AI Providers list/edit pages | Provider management endpoints | v7 provider-specific fields have structured editor support. `thinking-payloads` maps reasoning labels to JSON merged into upstream requests, with GLM/Qwen/OpenRouter presets in the editor. |
| `claude-header-defaults`, `codex-header-defaults`, `payload.*`, Antigravity signature toggles | Config visual editor | `/config.yaml` | Advanced request shaping is centralized in Config. |
| `ampcode.*` | Amp provider page and Config source fallback | Amp management endpoints | Amp summary exposes security-relevant `restrict-management-to-localhost`; mappings preserve regex support. |
| `oauth-excluded-models`, `oauth-model-alias` | Auth Files dedicated pages | OAuth management endpoints | Dedicated pages remain the source of truth. |
| `sync-profiles` | Tooling Templates | Sync profile endpoints | Sync profile editing remains with tooling template flows. |
| `sync-state-path` | Config source editor (source-only) | `/config.yaml` | Operational path for ppap-sync status reports (like `usage-statistics-path`); no typed control needed. The reported state itself is displayed on Tooling Templates via the sync-state endpoint. |

## Source-Only Policy

Fields are source-only only when they are structural, secret-bearing, legacy migration aliases, or not safe to quick-edit outside the full config context. Future upstream keys should appear first in source mode and then be added to this matrix when a typed control is implemented.
