# CLI Proxy SDK Guide

1. Install the module.
2. Load `config.yaml`.
3. Build the service.
4. Run the service.
5. Cancel the context to stop.

The `sdk/cliproxy` module exposes the proxy as a reusable Go library. External programs can embed routing, authentication, hot-reload, and translation without the CLI binary.

## Install & Import

```bash
go get github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy
```

```go
import (
    "context"
    "errors"
    "time"

    "github.com/router-for-me/CLIProxyAPI/v6/internal/config"
    "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy"
)
```

Note the `/v6` module path in these samples. Match the module path in the repository `go.mod` when you import.

## Minimal Embed

```go
cfg, err := config.LoadConfig("config.yaml")
if err != nil { panic(err) }

svc, err := cliproxy.NewBuilder().
    WithConfig(cfg).
    WithConfigPath("config.yaml"). // absolute or working-dir relative
    Build()
if err != nil { panic(err) }

ctx, cancel := context.WithCancel(context.Background())
defer cancel()

if err := svc.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
    panic(err)
}
```

The service manages config and auth watchers, background token refresh, and graceful shutdown. Cancel the context to stop it.

Check: the process listens on the port in `config.yaml` (default `8317`).

## Server Options (middleware, routes, logs)

Pass server options with `WithServerOptions`:

```go
svc, _ := cliproxy.NewBuilder().
  WithConfig(cfg).
  WithConfigPath("config.yaml").
  WithServerOptions(
    // Add global middleware
    cliproxy.WithMiddleware(func(c *gin.Context) { c.Header("X-Embed", "1"); c.Next() }),
    // Tweak gin engine early (CORS, trusted proxies, etc.)
    cliproxy.WithEngineConfigurator(func(e *gin.Engine) { e.ForwardedByClientIP = true }),
    // Add your own routes after defaults
    cliproxy.WithRouterConfigurator(func(e *gin.Engine, _ *handlers.BaseAPIHandler, _ *config.Config) {
      e.GET("/healthz", func(c *gin.Context) { c.String(200, "ok") })
    }),
    // Override request log writer/dir
    cliproxy.WithRequestLoggerFactory(func(cfg *config.Config, cfgPath string) logging.RequestLogger {
      return logging.NewFileRequestLogger(true, "logs", filepath.Dir(cfgPath))
    }),
  ).
  Build()
```

These options mirror the internals used by the CLI server.

## Management API (when embedded)

- Management endpoints mount only when `remote-management.secret-key` is set in `config.yaml`.
- Remote access also requires `remote-management.allow-remote: true`.
- See MANAGEMENT_API.md for endpoints. Your embedded server exposes them under `/v0/management` on the configured port.

## Use the core auth manager

The service uses a core `auth.Manager` for selection, execution, and auto-refresh. When you embed, you can supply your own manager to customize transports or hooks:

```go
core := coreauth.NewManager(coreauth.NewFileStore(cfg.AuthDir), nil, nil)
core.SetRoundTripperProvider(myRTProvider) // per-auth *http.Transport

svc, _ := cliproxy.NewBuilder().
    WithConfig(cfg).
    WithConfigPath("config.yaml").
    WithCoreAuthManager(core).
    Build()
```

Implement a custom per-auth transport:

```go
type myRTProvider struct{}
func (myRTProvider) RoundTripperFor(a *coreauth.Auth) http.RoundTripper {
    if a == nil || a.ProxyURL == "" { return nil }
    u, _ := url.Parse(a.ProxyURL)
    return &http.Transport{ Proxy: http.ProxyURL(u) }
}
```

Programmatic execution is available on the manager:

```go
// Non-streaming
resp, err := core.Execute(ctx, []string{"gemini"}, req, opts)

// Streaming
chunks, err := core.ExecuteStream(ctx, []string{"gemini"}, req, opts)
for ch := range chunks { /* ... */ }
```

Note: Built-in provider executors wire automatically when you run the `Service`.

If you use `Manager` alone without the HTTP server, you must register your own executors that implement `auth.ProviderExecutor`.

## Custom Client Sources

Replace the default loaders if credentials live outside the local filesystem:

```go
type memoryTokenProvider struct{}
func (p *memoryTokenProvider) Load(ctx context.Context, cfg *config.Config) (*cliproxy.TokenClientResult, error) {
    // Populate from memory/remote store and return counts
    return &cliproxy.TokenClientResult{}, nil
}

svc, _ := cliproxy.NewBuilder().
  WithConfig(cfg).
  WithConfigPath("config.yaml").
  WithTokenClientProvider(&memoryTokenProvider{}).
  WithAPIKeyClientProvider(cliproxy.NewAPIKeyClientProvider()).
  Build()
```

## Hooks

Observe lifecycle events. Do not patch service internals:

```go
hooks := cliproxy.Hooks{
  OnBeforeStart: func(cfg *config.Config) { log.Infof("starting on :%d", cfg.Port) },
  OnAfterStart:  func(s *cliproxy.Service) { log.Info("ready") },
}
svc, _ := cliproxy.NewBuilder().WithConfig(cfg).WithConfigPath("config.yaml").WithHooks(hooks).Build()
```

## Shutdown

`Run` defers `Shutdown`, so a cancel of the parent context is enough. To stop manually:

```go
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
_ = svc.Shutdown(ctx)
```

## Notes

- Hot reload: changes to `config.yaml` and `auths/` are picked up automatically.
- The request log can be toggled at runtime via the Management API.
- Gemini Web features (`gemini-web.*`) are honored in the embedded server.
