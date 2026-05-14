package management

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/registry"
	coreauth "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/auth"
)

// Response types for the sync available-configs aggregation endpoint.

// SyncAvailableConfigsResponse aggregates all provider, model, and key
// information needed by the ppap-sync CLI tool to configure target tools.
type SyncAvailableConfigsResponse struct {
	// BaseURL is the server's external URL derived from host, port, and TLS config.
	BaseURL string `json:"base_url"`

	// APIKeys lists all configured client API keys with masking (last 4 chars visible)
	// and their index for selection by the CLI sync tool.
	APIKeys []MaskedAPIKey `json:"api_keys"`

	// Providers lists all non-disabled provider entries with their available models.
	Providers []SyncProvider `json:"providers"`

	// OAuthChannels lists OAuth channels with their alias-derived models.
	OAuthChannels []SyncOAuthChannel `json:"oauth_channels"`

	// AllModels is the deduplicated union of all model names across providers and channels.
	AllModels []string `json:"all_models"`
}

// MaskedAPIKey represents an API key with only the last 4 characters visible
// and its index in the server's key list for selection by the CLI sync tool.
type MaskedAPIKey struct {
	// Masked is the key with all but the last 4 characters replaced by '*'.
	Masked string `json:"masked"`

	// Index is the position of this key in the server's API key configuration.
	Index int `json:"index"`
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

	// AccountCount is the number of authenticated accounts contributing to this channel.
	// Zero when the channel comes only from oauth-model-alias config with no live auths.
	AccountCount int `json:"account_count,omitempty"`

	// DisplayName is a human-readable label for UI grouping (e.g., "Codex (OAuth)").
	DisplayName string `json:"display_name,omitempty"`
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
		OAuthChannels: buildOAuthChannels(cfg, h.authManager),
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

// buildMaskedAPIKeys returns a list of API keys with all but the last 4 chars replaced by '*',
// each annotated with its index for selection by the CLI sync tool.
func buildMaskedAPIKeys(cfg *config.Config) []MaskedAPIKey {
	if cfg == nil || len(cfg.APIKeys) == 0 {
		return []MaskedAPIKey{}
	}

	keys := make([]MaskedAPIKey, 0, len(cfg.APIKeys))
	for i, key := range cfg.APIKeys {
		keys = append(keys, MaskedAPIKey{
			Masked: maskAPIKey(key),
			Index:  i,
		})
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

// authLister is the minimal subset of the auth manager needed by sync aggregation.
// Implemented by *coreauth.Manager; allows tests to inject a stub.
type authLister interface {
	List() []*coreauth.Auth
}

// oauthChannelDisplayNames maps a normalized auth provider key to a human-readable label.
// The keys here also define which auth Provider values are treated as real OAuth
// channels for sync — anything outside this set is ignored (e.g., openai-compatibility
// provider names register internal auths whose Provider equals the provider's name).
var oauthChannelDisplayNames = map[string]string{
	"claude":      "Claude (OAuth)",
	"codex":       "Codex (OAuth)",
	"gemini":      "Gemini (OAuth)",
	"gemini-cli":  "Gemini CLI (OAuth)",
	"aistudio":    "AI Studio (OAuth)",
	"kimi":        "Kimi (OAuth)",
	"antigravity": "Antigravity (OAuth)",
}

// isKnownOAuthChannel reports whether the given (normalized) provider key
// corresponds to a real OAuth/file-backed channel that should surface in sync.
func isKnownOAuthChannel(channel string) bool {
	_, ok := oauthChannelDisplayNames[channel]
	return ok
}

// buildOAuthChannels aggregates OAuth channel data from three sources:
//   - authed accounts discovered via the auth manager (live registry models, with
//     fallback to the static catalog when the registry has not yet been populated),
//   - oauth-model-alias config (alias overrides; takes precedence when present),
//   - oauth-excluded-models config (applied to discovered models when no alias overrides).
//
// A nil-typed lister (e.g. when no auth manager is wired) is safe; the result then
// reflects only the alias config, preserving the original behavior.
func buildOAuthChannels(cfg *config.Config, lister authLister) []SyncOAuthChannel {
	if cfg == nil {
		return []SyncOAuthChannel{}
	}

	// 1. Discover channels from authed accounts: channel -> sorted authIDs (deterministic order).
	// Only real OAuth/file-backed channels are surfaced; openai-compatibility providers
	// register internal auths under their own name and would otherwise duplicate the
	// entries already returned in `providers`.
	discovered := make(map[string][]string)
	if !isNilLister(lister) {
		for _, auth := range lister.List() {
			if auth == nil || auth.Disabled {
				continue
			}
			ch := strings.ToLower(strings.TrimSpace(auth.Provider))
			if ch == "" || !isKnownOAuthChannel(ch) {
				continue
			}
			discovered[ch] = append(discovered[ch], auth.ID)
		}
	}

	// 2. Build the unique channel set as the union of discovered + alias-configured channels.
	channelSet := make(map[string]struct{})
	for ch := range discovered {
		channelSet[ch] = struct{}{}
	}
	for channel := range cfg.OAuthModelAlias {
		ch := strings.ToLower(strings.TrimSpace(channel))
		if ch != "" {
			channelSet[ch] = struct{}{}
		}
	}
	if len(channelSet) == 0 {
		return []SyncOAuthChannel{}
	}

	channels := make([]SyncOAuthChannel, 0, len(channelSet))
	for ch := range channelSet {
		aliases := cfg.OAuthModelAlias[ch]
		excluded := cfg.OAuthExcludedModels[ch]
		authIDs := discovered[ch]

		var models []string
		if len(aliases) > 0 {
			// Alias config wins outright — preserves the contract for users who configure aliases.
			models = buildOAuthChannelModels(aliases, excluded)
		} else {
			models = discoverChannelModels(ch, authIDs)
			if len(excluded) > 0 {
				models = filterExcluded(models, excluded)
			}
		}

		if len(models) == 0 {
			continue
		}

		channels = append(channels, SyncOAuthChannel{
			Channel:      ch,
			Models:       models,
			AccountCount: len(authIDs),
			DisplayName:  oauthChannelDisplayName(ch),
		})
	}

	return channels
}

// discoverChannelModels unions the live registry's per-auth model lists across all
// authIDs for a channel, falling back to the static catalog when nothing is registered.
func discoverChannelModels(channel string, authIDs []string) []string {
	seen := make(map[string]struct{})
	var models []string

	reg := registry.GetGlobalRegistry()
	if reg != nil {
		for _, id := range authIDs {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			for _, info := range reg.GetModelsForClient(id) {
				if info == nil {
					continue
				}
				modelID := strings.TrimSpace(info.ID)
				if modelID == "" {
					continue
				}
				key := strings.ToLower(modelID)
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}
				models = append(models, modelID)
			}
		}
	}

	if len(models) > 0 {
		return models
	}

	// Fallback: the per-auth registry has not been populated for this channel yet
	// (e.g., fresh server with auths on disk but no executor warm-up). Use the
	// embedded static catalog so the UI still shows what the channel supports.
	for _, info := range registry.GetStaticModelDefinitionsByChannel(channel) {
		if info == nil {
			continue
		}
		modelID := strings.TrimSpace(info.ID)
		if modelID == "" {
			continue
		}
		key := strings.ToLower(modelID)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		models = append(models, modelID)
	}

	return models
}

// filterExcluded returns models that do not match any exclusion pattern.
func filterExcluded(models, excluded []string) []string {
	if len(excluded) == 0 {
		return models
	}
	result := make([]string, 0, len(models))
	for _, m := range models {
		if !isModelExcluded(m, excluded) {
			result = append(result, m)
		}
	}
	return result
}

// oauthChannelDisplayName returns a UI label for a channel, falling back to a
// titlecased channel name suffixed with "(OAuth)" when the channel is unknown.
func oauthChannelDisplayName(channel string) string {
	if name, ok := oauthChannelDisplayNames[channel]; ok {
		return name
	}
	trimmed := strings.TrimSpace(channel)
	if trimmed == "" {
		return ""
	}
	return strings.ToUpper(trimmed[:1]) + trimmed[1:] + " (OAuth)"
}

// isNilLister reports whether lister is nil, including a typed nil
// (e.g., a (*coreauth.Manager)(nil) wrapped in the interface).
func isNilLister(lister authLister) bool {
	if lister == nil {
		return true
	}
	if m, ok := lister.(*coreauth.Manager); ok && m == nil {
		return true
	}
	return false
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
