# CLIProxyAPI v7 Config Coverage

This dashboard treats `src/internal/config/config.go` and `src/config.example.yaml` as the source of truth for supported config keys.

## Typed visual editor

The Config visual editor covers server binding, TLS, Home, remote management, auth directory, API keys, logging, request logging, error log retention, usage statistics, pprof, retry behavior, global proxy, model prefix enforcement, passthrough headers, image generation mode, Gemini CLI internal endpoint, websocket auth, upstream concurrency, quota fallback, Antigravity signature toggles, routing affinity, streaming keepalive, Claude header defaults, Codex header defaults, and payload rules.

## Structured provider editors

Provider editors cover the v7 provider fields for Gemini, Codex, Claude, OpenAI-compatible providers, Vertex-compatible providers, and Amp. Save paths must preserve existing raw item fields while overriding only fields the editor owns. This is especially important for per-provider `disable-cooling`, Claude `cloak.cache-user-id`, Claude `experimental-cch-signing`, OpenAI model `thinking`, Amp `restrict-management-to-localhost`, and Amp mapping `regex`.

## Fallback surface

The source YAML editor remains the fallback for fields that are deliberately not given a dedicated control or for future upstream fields before the dashboard is updated.
