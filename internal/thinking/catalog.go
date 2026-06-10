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

// legacyReasoningCatalog lists upstream model-name patterns that accept
// level-based reasoning effort but are absent from the registry's static
// model data (internal/registry/models/models.json). The registry is always
// consulted first via DefaultThinkingForModel, so keep this list restricted
// to models the registry does not carry — remove an entry once the model
// appears in models.json.
var legacyReasoningCatalog = []reasoningCatalogEntry{
	// GPT / Codex reasoning models predating the registry's codex catalog.
	// The registry carries gpt-5.3-codex-spark but not the base gpt-5.3-codex.
	{pattern: "gpt-5.3-codex", levels: []string{"low", "medium", "high", "xhigh"}},
	{pattern: "gpt-5.2", levels: []string{"low", "medium", "high", "xhigh"}},

	// OpenAI o-series reasoning. `o3` covers `o3-mini` and dated variants;
	// `o1` covers `o1-preview`, `o1-mini`, and dated variants.
	{pattern: "o4-mini", levels: []string{"low", "medium", "high"}},
	{pattern: "o3", levels: []string{"low", "medium", "high"}},
	{pattern: "o1", levels: []string{"low", "medium", "high"}},
}

// DefaultThinkingForModel returns a default ThinkingSupport for known
// reasoning-capable model names, or nil when the model is not known to
// support level-based reasoning. The lookup is case-insensitive against the
// upstream model name (i.e. `OpenAICompatibilityModel.Name`), not the
// locally-configured alias.
//
// Resolution order:
//  1. The registry's static model data (kept current by the remote models
//     updater), matched by exact ID first and then by the longest dash-prefix
//     so dated variants like "claude-opus-4-8-20260115" resolve to their base
//     model.
//  2. legacyReasoningCatalog for models the registry does not carry.
//
// The result is levels-only even when the registry declares budget ranges:
// these defaults drive reasoning-effort routing for OpenAI-compatibility
// upstreams, where numeric thinking budgets are not expressible.
//
// A nil return signals callers not to auto-generate reasoning-effort
// variants for that model.
func DefaultThinkingForModel(name string) *registry.ThinkingSupport {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "" {
		return nil
	}
	if info := registry.LookupStaticModelInfoByPrefix(normalized); info != nil && info.Thinking != nil && len(info.Thinking.Levels) > 0 {
		return &registry.ThinkingSupport{Levels: append([]string(nil), info.Thinking.Levels...)}
	}
	for _, entry := range legacyReasoningCatalog {
		if matchesReasoningPattern(normalized, entry.pattern) {
			return &registry.ThinkingSupport{Levels: append([]string(nil), entry.levels...)}
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
