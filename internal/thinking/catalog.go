package thinking

import (
	"strings"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
)

// reasoningCatalogEntry maps an upstream model-name pattern to the thinking
// levels it supports. A pattern matches a model name when the lowercased
// upstream name equals the pattern exactly or starts with `pattern + "-"`,
// so `o1` covers `o1`, `o1-mini`, `o1-preview`, and dated variants like
// `o1-2024-12-17` without matching unrelated names like `o10`.
type reasoningCatalogEntry struct {
	pattern string
	levels  []string
}

// reasoningCatalog lists the upstream model-name patterns that PPAP knows
// support level-based reasoning routing. The catalog is the default for
// OpenAI-compatibility models whose YAML config does not set `thinking:`
// explicitly. Models outside the catalog get no automatic `-low` / `-medium`
// / `-high` / `-xhigh` variants.
//
// Entries seeded from `internal/registry/models/models.json`, which is the
// authoritative source for OAuth-backed providers. Patterns are listed
// more-specific-first so that prefix matching resolves `gpt-5.4-mini-...`
// to the mini entry rather than the broader `gpt-5.4` entry. Add a pattern
// only when the upstream provider actually accepts level-based effort for
// that model.
var reasoningCatalog = []reasoningCatalogEntry{
	// Claude (Anthropic) reasoning models. Note: `max` is declared for
	// fidelity with the registry but does not produce an alias variant
	// today (the alias generator only iterates low/medium/high/xhigh).
	{pattern: "claude-opus-4-7", levels: []string{"low", "medium", "high", "xhigh", "max"}},
	{pattern: "claude-opus-4-6", levels: []string{"low", "medium", "high", "max"}},
	{pattern: "claude-sonnet-4-6", levels: []string{"low", "medium", "high"}},

	// GPT / Codex reasoning models. More-specific patterns first.
	{pattern: "gpt-5.5", levels: []string{"low", "medium", "high", "xhigh"}},
	{pattern: "gpt-5.4-mini", levels: []string{"low", "medium", "high", "xhigh"}},
	{pattern: "gpt-5.4", levels: []string{"low", "medium", "high", "xhigh"}},
	{pattern: "gpt-5.3-codex-spark", levels: []string{"low", "medium", "high", "xhigh"}},
	{pattern: "gpt-5.3-codex", levels: []string{"low", "medium", "high", "xhigh"}},
	{pattern: "gpt-5.2", levels: []string{"low", "medium", "high", "xhigh"}},
	{pattern: "codex-auto-review", levels: []string{"low", "medium", "high", "xhigh"}},

	// OpenAI o-series reasoning. `o3` covers `o3-mini` and dated variants;
	// `o1` covers `o1-preview`, `o1-mini`, and dated variants.
	{pattern: "o4-mini", levels: []string{"low", "medium", "high"}},
	{pattern: "o3", levels: []string{"low", "medium", "high"}},
	{pattern: "o1", levels: []string{"low", "medium", "high"}},
}

// DefaultThinkingForModel returns a default ThinkingSupport for known
// reasoning-capable model names, or nil when the model is not in the
// catalog. The lookup is case-insensitive against the upstream model name
// (i.e. `OpenAICompatibilityModel.Name`), not the locally-configured alias.
//
// A nil return signals callers not to auto-generate reasoning-effort
// variants for that model.
func DefaultThinkingForModel(name string) *registry.ThinkingSupport {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "" {
		return nil
	}
	for _, entry := range reasoningCatalog {
		if matchesReasoningPattern(normalized, entry.pattern) {
			levels := make([]string, len(entry.levels))
			copy(levels, entry.levels)
			return &registry.ThinkingSupport{Levels: levels}
		}
	}
	return nil
}

func matchesReasoningPattern(name, pattern string) bool {
	if name == pattern {
		return true
	}
	return strings.HasPrefix(name, pattern+"-")
}
