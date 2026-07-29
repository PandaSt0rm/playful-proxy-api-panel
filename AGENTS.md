# AGENTS.md

Go 1.26+ proxy server. It provides OpenAI/Gemini/Claude/Codex compatible APIs with OAuth and round-robin load balancing.

## Repository

- GitHub: https://github.com/router-for-me/CLIProxyAPI
- AIPROXY fork source: https://github.com/PandaSt0rm/aiproxy

## Commands

```bash
gofmt -w .                                          # Format (required after Go changes)
go build -o aiproxy ./cmd/aiproxy                   # Build
go run ./cmd/aiproxy                                # Run dev server
go test ./...                                       # Run all tests
go test -v -run TestName ./path/to/pkg              # Run single test
go build -o test-output ./cmd/aiproxy && rm test-output  # Verify compile (REQUIRED after changes)
```

Common flags: `--config <path>`, `--tui`, `--standalone`, `--local-model`, `--no-browser`, `--oauth-callback-port <port>`

Check: run `go build -o test-output ./cmd/aiproxy && rm test-output` after code changes.

## Config

- Default config: `config.yaml` (template: `config.example.yaml`)
- `.env` loads from the working directory
- Auth material defaults under `auths/`
- Storage backends: file-based default; optional Postgres/git/object store (`PGSTORE_*`, `GITSTORE_*`, `OBJECTSTORE_*`)

## Architecture

| Path | Role |
| --- | --- |
| `cmd/aiproxy/` | AIPROXY server entrypoint |
| `cmd/server/` | Legacy/server entrypoint path kept for router compatibility |
| `cmd/aiproxy-oauth-bridge/` | OAuth bridge helper process |
| `internal/api/` | Gin HTTP API (routes, middleware, modules) |
| `internal/api/modules/amp/` | Amp integration (Amp-style routes + reverse proxy) |
| `internal/thinking/` | Main thinking/reasoning pipeline |
| `internal/runtime/executor/` | Per-provider runtime executors (incl. Codex WebSocket) |
| `internal/translator/` | Provider protocol translators (and shared `common`) |
| `internal/registry/` | Model registry + remote updater (`StartModelsUpdater`); `--local-model` disables remote updates |
| `internal/store/` | Storage implementations and secret resolution |
| `internal/managementasset/` | Config snapshots and management assets |
| `internal/cache/` | Request signature cache |
| `internal/watcher/` | Config hot-reload and watchers |
| `internal/wsrelay/` | WebSocket relay sessions |
| `internal/usage/` | Usage and token accounting |
| `internal/tui/` | Bubbletea terminal UI (`--tui`, `--standalone`) |
| `internal/oauthbridge/` | OAuth bridge protocol and server |
| `internal/bootstrap/` | Process bootstrap and run path |
| `sdk/cliproxy/` | Embeddable SDK entry (service/builder/watchers/pipeline) |
| `test/` | Cross-module integration tests |

`internal/thinking/` flow:

1. `ApplyThinking()` (`apply.go`) parses suffixes (`suffix.go`; suffix overrides body).
2. It normalizes config to canonical `ThinkingConfig` (`types.go`).
3. It normalizes and validates centrally (`validate.go`/`convert.go`).
4. It applies provider-specific output via `ProviderApplier`.

Do not break this "canonical representation → per-provider translation" architecture.

## Code Conventions

- Keep changes small and simple (KISS).
- Write comments in English only.
- If you edit code that already contains non-English comments, translate them to English. Do not add new non-English comments.
- For user-visible strings, keep the language already used in that file or area.
- Write new Markdown docs in English unless the file is language-specific (for example `README_CN.md`).
- As a rule, do not make standalone changes to `internal/translator/`. You can modify it only as part of broader changes elsewhere.
- If a task requires changes only in `internal/translator/`, run `gh repo view --json viewerPermission -q .viewerPermission`. Confirm you have `WRITE`, `MAINTAIN`, or `ADMIN`. If you do, proceed.
- If you do not have write access, file a GitHub issue with the goal, rationale, and intended implementation code. Then stop further work.
- `internal/runtime/executor/` must contain executors and their unit tests only. Place helper or support files under `internal/runtime/executor/helps/`.
- Follow `gofmt`. Keep imports goimports-style. Wrap errors with context where helpful.
- Do not use `log.Fatal`/`log.Fatalf` (these terminate the process). Prefer returned errors and logrus.
- Shadowed variables: use a method suffix (`errStart := server.Start()`).
- Wrap defer errors: `defer func() { if err := f.Close(); err != nil { log.Errorf(...) } }()`
- Use logrus structured logs. Do not leak secrets or tokens in logs.
- Avoid panics in HTTP handlers. Prefer logged errors and meaningful HTTP status codes.
- Timeouts are allowed only during credential acquisition. After an upstream connection is established, do not set timeouts for later network behavior.
- Intentional timeout exceptions that must remain:
  - Codex websocket liveness deadlines in `internal/runtime/executor/codex_websockets_executor.go`
  - wsrelay session deadlines in `internal/wsrelay/session.go`
  - management APICall timeout in `internal/api/handlers/management/api_tools.go`
  - `cmd/fetch_antigravity_models` utility timeouts
