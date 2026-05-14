package management

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

// Response types for the sync available-configs aggregation endpoint.

// SyncAvailableConfigsResponse aggregates all provider, model, and key
// information needed by the ppap-sync CLI tool to configure target tools.
type SyncAvailableConfigsResponse struct {
	// BaseURL is the server's external URL derived from host, port, and TLS config.
	BaseURL string `json:"base_url"`

	// APIKeys lists all configured client API keys with masking (last 4 chars visible).
	APIKeys []string `json:"api_keys"`

	// Providers lists all non-disabled provider entries with their available models.
	Providers []SyncProvider `json:"providers"`

	// OAuthChannels lists OAuth channels with their alias-derived models.
	OAuthChannels []SyncOAuthChannel `json:"oauth_channels"`

	// AllModels is the deduplicated union of all model names across providers and channels.
	AllModels []string `json:"all_models"`
}

// SyncProvider describes a single API provider type and its available models.
type SyncProvider struct {
	// Type identifies the provider category (e.g., "openai-compatibility", "claude-api-key").
	Type string `json:"type"`

	// Name is an optional human-readable provider name (used by openai-compatibility entries).
	Name string `json:"name,omitempty"`

	// Models lists all available model IDs including aliases, with exclusions applied.
	Models []string `json:"models"`
}

// SyncOAuthChannel describes an OAuth channel with its alias-transformed model list.
type SyncOAuthChannel struct {
	// Channel identifies the OAuth channel (e.g., "claude", "codex", "gemini-cli").
	Channel string `json:"channel"`

	// Models lists the available models after applying aliases and exclusion filters.
	Models []string `json:"models"`
}

// GetSyncAvailableConfigs returns aggregated config data for the sync tool.
// GET /v0/management/sync/available-configs
func (h *Handler) GetSyncAvailableConfigs(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	cfg := h.cfg

	resp := SyncAvailableConfigsResponse{
		BaseURL:       buildBaseURL(cfg),
		APIKeys:       buildMaskedAPIKeys(cfg),
		Providers:     buildProviders(cfg),
		OAuthChannels: buildOAuthChannels(cfg),
	}
	resp.AllModels = buildAllModels(resp.Providers, resp.OAuthChannels)

	c.JSON(http.StatusOK, resp)
}

// buildBaseURL constructs the server's external URL from host, port, and TLS config.
func buildBaseURL(cfg *config.Config) string {
	if cfg == nil {
		return ""
	}

	host := cfg.Host
	if host == "" {
		host = "127.0.0.1"
	}

	scheme := "http"
	if cfg.TLS.Enable {
		scheme = "https"
	}

	return fmt.Sprintf("%s://%s:%d", scheme, host, cfg.Port)
}

// buildMaskedAPIKeys returns a list of API keys with all but the last 4 chars replaced by '*'.
func buildMaskedAPIKeys(cfg *config.Config) []string {
	if cfg == nil || len(cfg.APIKeys) == 0 {
		return []string{}
	}

	keys := make([]string, 0, len(cfg.APIKeys))
	for _, key := range cfg.APIKeys {
		keys = append(keys, maskAPIKey(key))
	}
	return keys
}

// maskAPIKey replaces all characters except the last 4 with '*'.
// Keys with 4 or fewer characters are fully masked to avoid revealing
// the entire key when it is too short to partially mask meaningfully.
func maskAPIKey(key string) string {
	if len(key) <= 4 {
		return strings.Repeat("*", len(key))
	}
	return strings.Repeat("*", len(key)-4) + key[len(key)-4:]
}

// namedAlias is a constraint for model types that expose GetName/GetAlias.
type namedAlias interface {
	GetName() string
	GetAlias() string
}

// buildProviders aggregates models from all configured provider types.
// Each provider type produces a single entry with all models merged from its keys.
// Disabled openai-compatibility entries are excluded.
func buildProviders(cfg *config.Config) []SyncProvider {
	if cfg == nil {
		return []SyncProvider{}
	}

	var providers []SyncProvider

	// OpenAI compatibility providers — one entry per config item.
	for _, entry := range cfg.OpenAICompatibility {
		if entry.Disabled {
			continue
		}
		models := collectModels(entry.Models, nil)
		providers = append(providers, SyncProvider{
			Type:   "openai-compatibility",
			Name:   entry.Name,
			Models: models,
		})
	}

	// Claude API keys — merged into one entry.
	if len(cfg.ClaudeKey) > 0 {
		var allModels []string
		for _, key := range cfg.ClaudeKey {
			allModels = mergeStringSlices(allModels, collectModels(key.Models, key.ExcludedModels))
		}
		providers = append(providers, SyncProvider{
			Type:   "claude-api-key",
			Models: allModels,
		})
	}

	// Codex API keys — merged into one entry.
	if len(cfg.CodexKey) > 0 {
		var allModels []string
		for _, key := range cfg.CodexKey {
			allModels = mergeStringSlices(allModels, collectModels(key.Models, key.ExcludedModels))
		}
		providers = append(providers, SyncProvider{
			Type:   "codex-api-key",
			Models: allModels,
		})
	}

	// Gemini API keys — merged into one entry.
	if len(cfg.GeminiKey) > 0 {
		var allModels []string
		for _, key := range cfg.GeminiKey {
			allModels = mergeStringSlices(allModels, collectModels(key.Models, key.ExcludedModels))
		}
		providers = append(providers, SyncProvider{
			Type:   "gemini-api-key",
			Models: allModels,
		})
	}

	// Vertex API keys — merged into one entry.
	if len(cfg.VertexCompatAPIKey) > 0 {
		var allModels []string
		for _, key := range cfg.VertexCompatAPIKey {
			allModels = mergeStringSlices(allModels, collectModels(key.Models, key.ExcludedModels))
		}
		providers = append(providers, SyncProvider{
			Type:   "vertex-api-key",
			Models: allModels,
		})
	}

	if providers == nil {
		return []SyncProvider{}
	}
	return providers
}

// collectModels extracts model names and aliases from a model list,
// applying exclusion patterns and deduplicating.
func collectModels[M namedAlias](models []M, excluded []string) []string {
	seen := make(map[string]struct{})
	var result []string

	for _, m := range models {
		name := m.GetName()
		alias := m.GetAlias()

		if name != "" && !isModelExcluded(name, excluded) {
			key := strings.ToLower(name)
			if _, ok := seen[key]; !ok {
				seen[key] = struct{}{}
				result = append(result, name)
			}
		}
		if alias != "" && alias != name && !isModelExcluded(alias, excluded) {
			key := strings.ToLower(alias)
			if _, ok := seen[key]; !ok {
				seen[key] = struct{}{}
				result = append(result, alias)
			}
		}
	}

	if result == nil {
		return []string{}
	}
	return result
}

// mergeStringSlices appends new strings to base, skipping duplicates (case-insensitive).
func mergeStringSlices(base, additions []string) []string {
	if base == nil {
		base = []string{}
	}
	seen := make(map[string]struct{}, len(base))
	for _, s := range base {
		seen[strings.ToLower(s)] = struct{}{}
	}
	for _, s := range additions {
		key := strings.ToLower(s)
		if _, ok := seen[key]; !ok {
			seen[key] = struct{}{}
			base = append(base, s)
		}
	}
	return base
}

// buildOAuthChannels aggregates OAuth channel data from oauth-model-alias and
// oauth-excluded-models configuration. Only channels with alias configuration
// produce entries; the models list is derived from the alias definitions with
// exclusion filters applied.
func buildOAuthChannels(cfg *config.Config) []SyncOAuthChannel {
	if cfg == nil || len(cfg.OAuthModelAlias) == 0 {
		return []SyncOAuthChannel{}
	}

	var channels []SyncOAuthChannel
	for channel, aliases := range cfg.OAuthModelAlias {
		ch := strings.ToLower(strings.TrimSpace(channel))
		if ch == "" || len(aliases) == 0 {
			continue
		}

		models := buildOAuthChannelModels(aliases, cfg.OAuthExcludedModels[ch])
		if len(models) > 0 {
			channels = append(channels, SyncOAuthChannel{
				Channel: ch,
				Models:  models,
			})
		}
	}

	if channels == nil {
		return []SyncOAuthChannel{}
	}
	return channels
}

// buildOAuthChannelModels derives the model list for an OAuth channel from
// its alias definitions. When Fork is true, both original name and alias are
// included; otherwise only the alias. Exclusion patterns from oauth-excluded-models
// are applied after alias expansion.
func buildOAuthChannelModels(aliases []config.OAuthModelAlias, excluded []string) []string {
	seen := make(map[string]struct{})
	var models []string

	for _, a := range aliases {
		name := strings.TrimSpace(a.Name)
		alias := strings.TrimSpace(a.Alias)

		// When Fork is true, include the original model name.
		if a.Fork && name != "" {
			key := strings.ToLower(name)
			if _, ok := seen[key]; !ok {
				seen[key] = struct{}{}
				if !isModelExcluded(name, excluded) {
					models = append(models, name)
				}
			}
		}

		// Always include the alias.
		if alias != "" {
			key := strings.ToLower(alias)
			if _, ok := seen[key]; !ok {
				seen[key] = struct{}{}
				if !isModelExcluded(alias, excluded) {
					models = append(models, alias)
				}
			}
		}
	}

	if models == nil {
		return []string{}
	}
	return models
}

// buildAllModels produces a deduplicated flat list of all model names across
// all providers and OAuth channels.
func buildAllModels(providers []SyncProvider, channels []SyncOAuthChannel) []string {
	seen := make(map[string]struct{})
	var all []string

	for _, p := range providers {
		for _, m := range p.Models {
			key := strings.ToLower(m)
			if _, ok := seen[key]; !ok {
				seen[key] = struct{}{}
				all = append(all, m)
			}
		}
	}

	for _, ch := range channels {
		for _, m := range ch.Models {
			key := strings.ToLower(m)
			if _, ok := seen[key]; !ok {
				seen[key] = struct{}{}
				all = append(all, m)
			}
		}
	}

	if all == nil {
		return []string{}
	}
	return all
}

// isModelExcluded checks whether a model ID matches any exclusion pattern.
// Patterns support '*' as a wildcard matching any substring (case-insensitive).
func isModelExcluded(modelID string, excluded []string) bool {
	if len(excluded) == 0 {
		return false
	}
	for _, pattern := range excluded {
		if matchWildcard(pattern, modelID) {
			return true
		}
	}
	return false
}

// matchWildcard performs case-insensitive wildcard matching where '*'
// matches any substring. This mirrors the wildcard matching logic used
// in the model registry for excluded-models filtering.
func matchWildcard(pattern, value string) bool {
	if pattern == "" {
		return false
	}

	pattern = strings.ToLower(strings.TrimSpace(pattern))
	value = strings.ToLower(strings.TrimSpace(value))

	// Fast path: no wildcard — exact match.
	if !strings.Contains(pattern, "*") {
		return pattern == value
	}

	parts := strings.Split(pattern, "*")

	// Handle prefix before the first '*'.
	if prefix := parts[0]; prefix != "" {
		if !strings.HasPrefix(value, prefix) {
			return false
		}
		value = value[len(prefix):]
	}

	// Handle suffix after the last '*'.
	if suffix := parts[len(parts)-1]; suffix != "" {
		if !strings.HasSuffix(value, suffix) {
			return false
		}
		value = value[:len(value)-len(suffix)]
	}

	// Handle middle segments in order.
	for i := 1; i < len(parts)-1; i++ {
		segment := parts[i]
		if segment == "" {
			continue
		}
		idx := strings.Index(value, segment)
		if idx < 0 {
			return false
		}
		value = value[idx+len(segment):]
	}

	return true
}
