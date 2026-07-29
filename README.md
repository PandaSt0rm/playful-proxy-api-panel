# AIPROXY

1. Copy a config template.
2. Start AIPROXY.
3. Open the management console on port `8317`.

Languages: English | [中文](README_CN.md) | [日本語](README_JA.md)


**AIPROXY is a self-hosted, upstream-compatible CLIProxyAPI fork.** It includes a built-in management console, persistent usage analytics, and Codex-focused model ergonomics.

It keeps the OpenAI/Gemini/Claude/Codex/Grok-compatible proxy surface from [`router-for-me/CLIProxyAPI`](https://github.com/router-for-me/CLIProxyAPI). It adds usage snapshots, cost estimates, panel assets released with the backend, and safer thinking-strength aliases.

Use upstream CLIProxyAPI for the vanilla project. Use AIPROXY for the same proxy style with more local visibility and a tighter operations loop.

## What Makes AIPROXY Different

- **Usage analytics built in**: restored `/v0/management/usage`, import/export endpoints, persistent local snapshots, cache hit rate, first-byte latency, average latency, TPS, token breakdowns, and per-model/per-API rollups.
- **Panel and backend released together**: management console source lives in [`web/console`](web/console). Each release ships the `management.html` for that tag.
- **Codex is a primary workflow**: OpenAI Codex OAuth, GPT model routing, Spark pricing estimation, and thinking-strength aliases stay maintained in this fork.
- **Thinking aliases are predictable**: both `model(high)` and `model-high` work for `low`, `medium`, `high`, and `xhigh`. Explicit aliases and exact model names stay higher priority.
- **Upstream compatibility stays the baseline**: upstream fixes merge when they do not conflict with AIPROXY behavior. Recent Redis usage queue retention support is included.

## Core Features

- OpenAI/Gemini/Claude/Codex/Grok-compatible API endpoints for CLI models
- OAuth login for OpenAI Codex, Claude Code, and Grok (xAI)
- Streaming and non-streaming responses
- Function calling/tools and multimodal input (text, images, and xAI Grok image and video models)
- Multi-account routing and load balancing
- Gemini CLI, AI Studio Build, Claude Code, OpenAI Codex, xAI Grok, and Amp CLI support
- OpenAI-compatible upstream providers such as OpenRouter through config
- Reusable Go SDK so host programs can embed the proxy

## Quick Start

1. Download the [latest AIPROXY release](https://github.com/PandaSt0rm/aiproxy/releases/latest).
2. Extract the archive for your platform.
3. Copy and edit a local config file.
4. Start the process.

```bash
cp config.example.yaml config.yaml
./aiproxy -config ./config.yaml
```

The default HTTP port is `8317`.

Check: open `http://localhost:8317/management.html`.

Release archives cover the same platform families as upstream CPA: Linux, Windows, macOS, and FreeBSD on `amd64` and `aarch64`/`arm64` where Go supports them.

## Docker

The Docker image is `ghcr.io/PandaSt0rm/aiproxy` for `linux/amd64` and `linux/arm64`. The image bundles the AIPROXY management console from the same tag.

`/management.html` works with no separate panel asset download.

From a release archive or a cloned checkout:

```bash
cp config.docker.example.yaml config.yaml
mkdir -p auths logs data
# edit config.yaml: replace change-me-management-key and change-me-api-key
docker compose pull
docker compose up -d
```

Build the image locally instead of a GHCR pull:

```bash
docker compose up -d --build
```

Default persistent paths in `docker-compose.yml`:

| Host path | Container path |
| --- | --- |
| `./config.yaml` | `/CLIProxyAPI/config.yaml` |
| `./auths` | `/root/.cli-proxy-api` |
| `./data` | `/CLIProxyAPI/data` |
| `./logs` | `/CLIProxyAPI/logs` |

Docker bridge requests are remote from the container. `config.docker.example.yaml` enables `remote-management.allow-remote` and requires a management key.

CAUTION: Replace the example keys before you expose the service beyond your own machine.

Keep these files out of git: `config.yaml`, `.env`, OAuth files, API keys, auth directories, logs, data snapshots, and generated stores.

## Configuration Notes

Start from [`config.example.yaml`](config.example.yaml). Useful AIPROXY-specific settings:

| Setting | Purpose |
| --- | --- |
| `usage-statistics-enabled` | Enable built-in usage snapshots. |
| `usage-statistics-path` | Optional path for the usage snapshot outside the config directory. |
| `redis-usage-queue-retention-seconds` | Tune Redis usage queue retention when the Redis usage queue is enabled. |
| `home` | v7 Redis-compatible Home control-plane settings. In Home mode AIPROXY disables in-process management endpoints and forwards usage to Home. |
| `/v0/management/usage-queue` | Pop queued usage records for integrations that consume the Redis-compatible usage stream. |
| `oauth-model-alias` | Define friendly model aliases. Old config compatibility stays. |

For models that declare thinking levels, AIPROXY can expose automatic aliases such as:

```text
gpt-5.3-codex-spark-low
gpt-5.3-codex-spark-medium
gpt-5.3-codex-spark-high
gpt-5.3-codex-spark-xhigh
```

The older parenthesized style still works:

```text
gpt-5.3-codex-spark(high)
```

## Codex Spark Pricing

`gpt-5.3-codex-spark` is in AIPROXY pricing data for local usage-cost estimation. Until official preview pricing settles, AIPROXY estimates it with the `gpt-5.3-codex` rate.

References:

- [Introducing GPT-5.3-Codex-Spark](https://openai.com/index/introducing-gpt-5-3-codex-spark/)
- [Codex rate card](https://help.openai.com/en/articles/11369540-codex-rate-card)
- [OpenAI API pricing](https://openai.com/api/pricing/)

## Management

| Item | Location |
| --- | --- |
| Management console source | [`web/console`](web/console) |
| Management API docs | [help.router-for.me/management/api](https://help.router-for.me/management/api) |
| Usage endpoints | `/v0/management/usage`, `/v0/management/usage/export`, `/v0/management/usage/import` |
| Usage queue endpoint | `/v0/management/usage-queue?count=100` |
| Amp CLI guide | [help.router-for.me/agent-client/amp-cli.html](https://help.router-for.me/agent-client/amp-cli.html) |

The release asset `management.html` is built from the same tag as the backend binaries. An AIPROXY instance can point its panel updater at this repository.

## SDK And Docs

- SDK usage: [docs/sdk-usage.md](docs/sdk-usage.md)
- Advanced executors and translators: [docs/sdk-advanced.md](docs/sdk-advanced.md)
- Access: [docs/sdk-access.md](docs/sdk-access.md)
- Watcher: [docs/sdk-watcher.md](docs/sdk-watcher.md)
- Custom provider example: [`examples/custom-provider`](examples/custom-provider)

## License

MIT. See [LICENSE](LICENSE).
