# @sdk/access SDK Reference

1. Import `sdk/access`.
2. Create a manager.
3. Attach providers.
4. Call `Authenticate` on each request.
5. Register custom providers before `Build()` when you embed.

The `github.com/router-for-me/CLIProxyAPI/v6/sdk/access` package centralizes inbound request authentication for the proxy. It offers a lightweight manager that chains credential providers.

Servers can reuse the same access control logic inside or outside the CLI runtime. Match the module path in repository `go.mod` when you import.

## Import

```go
import (
    sdkaccess "github.com/router-for-me/CLIProxyAPI/v6/sdk/access"
)
```

Add the module with `go get github.com/router-for-me/CLIProxyAPI/v6/sdk/access`.

## Provider Registry

Providers are registered globally and then attached to a `Manager` as a snapshot:

- `RegisterProvider(type, provider)` installs a pre-initialized provider instance.
- Registration order is preserved the first time each `type` is seen.
- `RegisteredProviders()` returns the providers in that order.

## Manager Lifecycle

```go
manager := sdkaccess.NewManager()
manager.SetProviders(sdkaccess.RegisteredProviders())
```

- `NewManager` constructs an empty manager.
- `SetProviders` replaces the provider slice with a defensive copy.
- `Providers` retrieves a snapshot that other goroutines can iterate safely.

If the manager itself is `nil` or no providers are configured, the call returns `nil, nil`. Callers can treat access control as disabled.

## Authenticate requests

```go
result, authErr := manager.Authenticate(ctx, req)
switch {
case authErr == nil:
    // Authentication succeeded; result describes the provider and principal.
case sdkaccess.IsAuthErrorCode(authErr, sdkaccess.AuthErrorCodeNoCredentials):
    // No recognizable credentials were supplied.
case sdkaccess.IsAuthErrorCode(authErr, sdkaccess.AuthErrorCodeInvalidCredential):
    // Supplied credentials were present but rejected.
default:
    // Internal/transport failure was returned by a provider.
}
```

`Manager.Authenticate` walks the configured providers in order. It returns on the first success. It skips providers that return `AuthErrorCodeNotHandled`.

It aggregates `AuthErrorCodeNoCredentials` and `AuthErrorCodeInvalidCredential` for a final result.

Each `Result` includes the provider identifier, the resolved principal, and optional metadata (for example, which header carried the credential).

Check: a valid API key returns `authErr == nil` and a non-empty principal.

## Built-in `config-api-key` Provider

The proxy includes one built-in access provider:

- `config-api-key`: Validates API keys declared under top-level `api-keys`.
  - Credential sources: `Authorization: Bearer`, `X-Goog-Api-Key`, `X-Api-Key`, `?key=`, `?auth_token=`
  - Metadata: `Result.Metadata["source"]` is set to the matched source label.

In the CLI server and `sdk/cliproxy`, this provider is registered automatically from the loaded configuration.

```yaml
api-keys:
  - sk-test-123
  - sk-prod-456
```

## Load providers from external Go modules

To consume a provider from another Go module, import it for its registration side effect:

```go
import (
    _ "github.com/acme/xplatform/sdk/access/providers/partner" // registers partner-token
    sdkaccess "github.com/router-for-me/CLIProxyAPI/v6/sdk/access"
)
```

The blank identifier import makes `init` run so `sdkaccess.RegisterProvider` executes before you call `RegisteredProviders()` (or before `cliproxy.NewBuilder().Build()`).

### Metadata and audit

`Result.Metadata` carries provider-specific context. The built-in `config-api-key` provider stores the credential source.

Source labels: `authorization`, `x-goog-api-key`, `x-api-key`, `query-key`, `query-auth-token`. Populate this map in custom providers to enrich logs and audits.

## Write custom providers

```go
type customProvider struct{}

func (p *customProvider) Identifier() string { return "my-provider" }

func (p *customProvider) Authenticate(ctx context.Context, r *http.Request) (*sdkaccess.Result, *sdkaccess.AuthError) {
    token := r.Header.Get("X-Custom")
    if token == "" {
        return nil, sdkaccess.NewNotHandledError()
    }
    if token != "expected" {
        return nil, sdkaccess.NewInvalidCredentialError()
    }
    return &sdkaccess.Result{
        Provider:  p.Identifier(),
        Principal: "service-user",
        Metadata:  map[string]string{"source": "x-custom"},
    }, nil
}

func init() {
    sdkaccess.RegisterProvider("custom", &customProvider{})
}
```

A provider must implement `Identifier()` and `Authenticate()`. To make it available to the access manager, call `RegisterProvider` inside `init` with an initialized provider instance.

## Error Semantics

| Constructor | Code | Meaning | HTTP |
| --- | --- | --- | --- |
| `NewNoCredentialsError()` | `AuthErrorCodeNoCredentials` | No credentials were present or recognized | 401 |
| `NewInvalidCredentialError()` | `AuthErrorCodeInvalidCredential` | Credentials were present but rejected | 401 |
| `NewNotHandledError()` | `AuthErrorCodeNotHandled` | Fall through to the next provider | — |
| `NewInternalAuthError(message, cause)` | `AuthErrorCodeInternal` | Transport/system failure | 500 |

Errors propagate immediately to the caller unless they are classified as `not_handled` / `no_credentials` / `invalid_credential` and the manager can aggregate them.

## Integration with cliproxy Service

`sdk/cliproxy` wires `@sdk/access` automatically when you build a CLI service via `cliproxy.NewBuilder`. Supply a manager to reuse the same instance in your host process:

```go
coreCfg, _ := config.LoadConfig("config.yaml")
accessManager := sdkaccess.NewManager()

svc, _ := cliproxy.NewBuilder().
  WithConfig(coreCfg).
  WithConfigPath("config.yaml").
  WithRequestAccessManager(accessManager).
  Build()
```

Register any custom providers (typically via blank imports) before you call `Build()` so they are present in the global registry snapshot.

### Hot reload

When configuration changes:

1. Refresh any config-backed providers.
2. Reset the manager provider chain.

```go
// configaccess is github.com/router-for-me/CLIProxyAPI/v6/internal/access/config_access
configaccess.Register(&newCfg.SDKConfig)
accessManager.SetProviders(sdkaccess.RegisteredProviders())
```

This mirrors the behaviour in `internal/access.ApplyAccessProviders`. Runtime updates work without a process restart.
