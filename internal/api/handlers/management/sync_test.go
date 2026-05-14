package management

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

// setupSyncTest creates a handler with a temp config file for testing.
func setupSyncTest(t *testing.T, cfg *config.Config) (*Handler, string) {
	t.Helper()
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte("port: 8317\n"), 0644); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}
	if cfg == nil {
		cfg = &config.Config{}
	}
	h := NewHandler(cfg, cfgPath, nil)
	return h, cfgPath
}

// performSyncRequest creates a test request against the GetSyncAvailableConfigs handler.
func performSyncRequest(h *Handler) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodGet, "/v0/management/sync/available-configs", nil)
	c.Request = req
	h.GetSyncAvailableConfigs(c)
	return w
}

// parseSyncResponse parses the response body into a SyncAvailableConfigsResponse.
func parseSyncResponse(t *testing.T, body []byte) SyncAvailableConfigsResponse {
	t.Helper()
	var resp SyncAvailableConfigsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	return resp
}

// --- Structure and Empty State Tests ---

// TestGetSyncAvailableConfigs_EmptyServer verifies VAL-SRV-057:
// Empty server returns valid empty structure with no nil panics.
func TestGetSyncAvailableConfigs_EmptyServer(t *testing.T) {
	h, _ := setupSyncTest(t, &config.Config{})
	w := performSyncRequest(h)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	resp := parseSyncResponse(t, w.Body.Bytes())

	// Empty config with port 0 and no host still produces a base_url
	// (the endpoint always returns a URL when port is present).
	if resp.BaseURL == "" {
		t.Fatal("expected non-empty base_url")
	}
	if resp.APIKeys == nil || len(resp.APIKeys) != 0 {
		t.Fatalf("expected empty api_keys array, got %v", resp.APIKeys)
	}
	if resp.Providers == nil || len(resp.Providers) != 0 {
		t.Fatalf("expected empty providers array, got %v", resp.Providers)
	}
	if resp.OAuthChannels == nil || len(resp.OAuthChannels) != 0 {
		t.Fatalf("expected empty oauth_channels array, got %v", resp.OAuthChannels)
	}
	if resp.AllModels == nil || len(resp.AllModels) != 0 {
		t.Fatalf("expected empty all_models array, got %v", resp.AllModels)
	}
}

// TestGetSyncAvailableConfigs_CompleteStructure verifies VAL-SRV-050:
// Response contains all five required keys with non-null values.
func TestGetSyncAvailableConfigs_CompleteStructure(t *testing.T) {
	cfg := &config.Config{
		Host: "192.168.1.100",
		Port: 8317,
		SDKConfig: config.SDKConfig{
			APIKeys: []string{"sk-test12345678"},
		},
		OpenAICompatibility: []config.OpenAICompatibility{
			{
				Name:    "test-provider",
				BaseURL: "https://api.example.com",
				Models: []config.OpenAICompatibilityModel{
					{Name: "gpt-4o", Alias: "gpt-4o-alias"},
				},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify all keys are present and non-null in the raw JSON
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	requiredKeys := []string{"base_url", "api_keys", "providers", "oauth_channels", "all_models"}
	for _, key := range requiredKeys {
		val, ok := raw[key]
		if !ok {
			t.Fatalf("missing required key %q in response", key)
		}
		if string(val) == "null" {
			t.Fatalf("key %q is null in response", key)
		}
	}
}

// --- API Key Masking Tests ---

// TestGetSyncAvailableConfigs_APIKeyMasking verifies VAL-SRV-051:
// API keys show only last 4 characters and include index.
func TestGetSyncAvailableConfigs_APIKeyMasking(t *testing.T) {
	cfg := &config.Config{
		SDKConfig: config.SDKConfig{
			APIKeys: []string{"sk-abc1234def5678"},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	if len(resp.APIKeys) != 1 {
		t.Fatalf("expected 1 api key, got %d", len(resp.APIKeys))
	}

	// Verify index
	if resp.APIKeys[0].Index != 0 {
		t.Fatalf("expected index 0, got %d", resp.APIKeys[0].Index)
	}

	masked := resp.APIKeys[0].Masked
	// Should show only last 4 chars: "5678"
	if masked == "sk-abc1234def5678" {
		t.Fatal("full API key exposed in response")
	}
	if len(masked) != len("sk-abc1234def5678") {
		t.Fatalf("masked key length mismatch: got %d, expected %d", len(masked), len("sk-abc1234def5678"))
	}
	if masked[len(masked)-4:] != "5678" {
		t.Fatalf("expected last 4 chars '5678', got %q", masked[len(masked)-4:])
	}
	// All chars before last 4 should be *
	for i := 0; i < len(masked)-4; i++ {
		if masked[i] != '*' {
			t.Fatalf("expected '*' at position %d, got %c", i, masked[i])
		}
	}
}

// TestMaskAPIKey_ShortKey tests masking of keys with 4 or fewer chars.
func TestMaskAPIKey_ShortKey(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"abc", "***"},
		{"ab", "**"},
		{"a", "*"},
		{"", ""},
		{"abcd", "****"},   // 4-char key fully masked
		{"abcde", "*bcde"}, // 5-char key: 1 mask + last 4
		{"sk-short", "****hort"},
	}
	for _, tt := range tests {
		got := maskAPIKey(tt.input)
		if got != tt.expected {
			t.Errorf("maskAPIKey(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

// --- Provider Tests ---

// TestGetSyncAvailableConfigs_AllProviderTypes verifies VAL-SRV-052:
// All configured provider types included.
func TestGetSyncAvailableConfigs_AllProviderTypes(t *testing.T) {
	cfg := &config.Config{
		OpenAICompatibility: []config.OpenAICompatibility{
			{
				Name:    "openai-test",
				BaseURL: "https://openai.example.com",
				Models:  []config.OpenAICompatibilityModel{{Name: "gpt-4o"}},
			},
		},
		ClaudeKey: []config.ClaudeKey{
			{
				APIKey:  "claude-key",
				BaseURL: "https://claude.example.com",
				Models:  []config.ClaudeModel{{Name: "claude-sonnet-4-20250514"}},
			},
		},
		CodexKey: []config.CodexKey{
			{
				APIKey:  "codex-key",
				BaseURL: "https://codex.example.com",
				Models:  []config.CodexModel{{Name: "codex-1"}},
			},
		},
		GeminiKey: []config.GeminiKey{
			{
				APIKey: "gemini-key",
				Models: []config.GeminiModel{{Name: "gemini-2.5-pro"}},
			},
		},
		VertexCompatAPIKey: []config.VertexCompatKey{
			{
				APIKey: "vertex-key",
				Models: []config.VertexCompatModel{{Name: "gemini-vertex-pro"}},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	providerTypes := make(map[string]bool)
	for _, p := range resp.Providers {
		providerTypes[p.Type] = true
	}

	expectedTypes := []string{"openai-compatibility", "claude-api-key", "codex-api-key", "gemini-api-key", "vertex-api-key"}
	for _, expected := range expectedTypes {
		if !providerTypes[expected] {
			t.Errorf("expected provider type %q in response", expected)
		}
	}
}

// TestGetSyncAvailableConfigs_ModelAliases verifies VAL-SRV-053:
// Model aliases included alongside original names.
func TestGetSyncAvailableConfigs_ModelAliases(t *testing.T) {
	cfg := &config.Config{
		OpenAICompatibility: []config.OpenAICompatibility{
			{
				Name:    "test",
				BaseURL: "https://api.example.com",
				Models: []config.OpenAICompatibilityModel{
					{Name: "gpt-5-codex", Alias: "codex-latest"},
				},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	if len(resp.Providers) == 0 {
		t.Fatal("expected at least one provider")
	}

	models := resp.Providers[0].Models
	hasOriginal := false
	hasAlias := false
	for _, m := range models {
		if m == "gpt-5-codex" {
			hasOriginal = true
		}
		if m == "codex-latest" {
			hasAlias = true
		}
	}
	if !hasOriginal {
		t.Error("expected original model name 'gpt-5-codex' in models")
	}
	if !hasAlias {
		t.Error("expected alias 'codex-latest' in models")
	}

	// Also check all_models
	allOriginal := false
	allAlias := false
	for _, m := range resp.AllModels {
		if m == "gpt-5-codex" {
			allOriginal = true
		}
		if m == "codex-latest" {
			allAlias = true
		}
	}
	if !allOriginal {
		t.Error("expected original model name in all_models")
	}
	if !allAlias {
		t.Error("expected alias in all_models")
	}
}

// TestGetSyncAvailableConfigs_DisabledProvidersExcluded verifies VAL-SRV-056:
// Disabled providers excluded from response.
func TestGetSyncAvailableConfigs_DisabledProvidersExcluded(t *testing.T) {
	cfg := &config.Config{
		OpenAICompatibility: []config.OpenAICompatibility{
			{
				Name:     "disabled-provider",
				BaseURL:  "https://disabled.example.com",
				Disabled: true,
				Models:   []config.OpenAICompatibilityModel{{Name: "disabled-model"}},
			},
			{
				Name:    "active-provider",
				BaseURL: "https://active.example.com",
				Models:  []config.OpenAICompatibilityModel{{Name: "active-model"}},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	if len(resp.Providers) != 1 {
		t.Fatalf("expected 1 provider (disabled excluded), got %d", len(resp.Providers))
	}
	if resp.Providers[0].Name != "active-provider" {
		t.Fatalf("expected 'active-provider', got %q", resp.Providers[0].Name)
	}
}

// --- OAuth Channel Tests ---

// TestGetSyncAvailableConfigs_OAuthChannels verifies VAL-SRV-054:
// OAuth channel models included.
func TestGetSyncAvailableConfigs_OAuthChannels(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"claude": {
				{Name: "claude-sonnet-4-20250514", Alias: "sonnet"},
			},
			"gemini-cli": {
				{Name: "gemini-2.5-pro", Alias: "gemini-pro"},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	channels := make(map[string]SyncOAuthChannel)
	for _, ch := range resp.OAuthChannels {
		channels[ch.Channel] = ch
	}

	if ch, ok := channels["claude"]; !ok {
		t.Error("expected claude OAuth channel")
	} else {
		found := false
		for _, m := range ch.Models {
			if m == "sonnet" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected alias 'sonnet' in claude channel models, got %v", ch.Models)
		}
	}

	if ch, ok := channels["gemini-cli"]; !ok {
		t.Error("expected gemini-cli OAuth channel")
	} else {
		found := false
		for _, m := range ch.Models {
			if m == "gemini-pro" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected alias 'gemini-pro' in gemini-cli channel models, got %v", ch.Models)
		}
	}
}

// TestGetSyncAvailableConfigs_ModelExclusions verifies VAL-SRV-055:
// Excluded models do not appear in response.
func TestGetSyncAvailableConfigs_ModelExclusions(t *testing.T) {
	cfg := &config.Config{
		ClaudeKey: []config.ClaudeKey{
			{
				APIKey:  "key",
				BaseURL: "https://claude.example.com",
				Models: []config.ClaudeModel{
					{Name: "claude-sonnet-4-20250514"},
					{Name: "claude-opus-4-20250514"},
				},
				ExcludedModels: []string{"claude-opus-*"},
			},
		},
		OAuthExcludedModels: map[string][]string{
			"claude": {"*-preview"},
		},
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"claude": {
				{Name: "claude-sonnet-4-20250514", Alias: "claude-sonnet-preview"},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	// Check provider models: opus should be excluded
	var providerModels []string
	for _, p := range resp.Providers {
		if p.Type == "claude-api-key" {
			providerModels = p.Models
			break
		}
	}
	for _, m := range providerModels {
		if m == "claude-opus-4-20250514" {
			t.Error("excluded model 'claude-opus-4-20250514' should not appear in provider models")
		}
	}

	// Check OAuth channel: *-preview exclusion should filter claude-sonnet-preview
	for _, ch := range resp.OAuthChannels {
		if ch.Channel == "claude" {
			for _, m := range ch.Models {
				if m == "claude-sonnet-preview" {
					t.Error("excluded model 'claude-sonnet-preview' should not appear in OAuth channel models")
				}
			}
		}
	}
}

// TestGetSyncAvailableConfigs_WildcardExclusion tests wildcard pattern exclusion.
func TestGetSyncAvailableConfigs_WildcardExclusion(t *testing.T) {
	cfg := &config.Config{
		GeminiKey: []config.GeminiKey{
			{
				APIKey: "key",
				Models: []config.GeminiModel{
					{Name: "gemini-2.5-pro"},
					{Name: "gemini-2.5-flash"},
					{Name: "gemini-3-pro"},
				},
				ExcludedModels: []string{"gemini-2.5-*", "*flash*"},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	var providerModels []string
	for _, p := range resp.Providers {
		if p.Type == "gemini-api-key" {
			providerModels = p.Models
			break
		}
	}

	for _, m := range providerModels {
		if m == "gemini-2.5-pro" {
			t.Error("gemini-2.5-pro should be excluded by gemini-2.5-* pattern")
		}
		if m == "gemini-2.5-flash" {
			t.Error("gemini-2.5-flash should be excluded by gemini-2.5-* and *flash* patterns")
		}
		if m == "gemini-3-pro" {
			// This should NOT be excluded
			return
		}
	}
	t.Errorf("gemini-3-pro should NOT be excluded, provider models: %v", providerModels)
}

// --- All Models Deduplication Tests ---

// TestGetSyncAvailableConfigs_DeduplicatedAllModels verifies VAL-SRV-058:
// all_models is a deduplicated flat list.
func TestGetSyncAvailableConfigs_DeduplicatedAllModels(t *testing.T) {
	cfg := &config.Config{
		OpenAICompatibility: []config.OpenAICompatibility{
			{
				Name:    "test1",
				BaseURL: "https://api1.example.com",
				Models: []config.OpenAICompatibilityModel{
					{Name: "gpt-4o"},
					{Name: "shared-model", Alias: "shared-alias"},
				},
			},
			{
				Name:    "test2",
				BaseURL: "https://api2.example.com",
				Models: []config.OpenAICompatibilityModel{
					{Name: "gpt-4o"},       // duplicate
					{Name: "shared-model"}, // duplicate
					{Name: "unique-model"},
				},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	// Check for duplicates (case-insensitive)
	seen := make(map[string]int)
	for _, m := range resp.AllModels {
		key := m // preserve case for dedup check
		seen[key]++
	}
	for m, count := range seen {
		if count > 1 {
			t.Errorf("duplicate model %q in all_models (count: %d)", m, count)
		}
	}

	// Verify expected models are present
	expected := []string{"gpt-4o", "shared-model", "shared-alias", "unique-model"}
	expectedSet := make(map[string]bool)
	for _, e := range expected {
		expectedSet[e] = true
	}
	for _, e := range expected {
		found := false
		for _, m := range resp.AllModels {
			if m == e {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected model %q in all_models, got %v", e, resp.AllModels)
		}
	}
}

// --- Base URL Tests ---

// TestGetSyncAvailableConfigs_BaseURL verifies VAL-SRV-059:
// base_url reflects server configuration.
func TestGetSyncAvailableConfigs_BaseURL(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		port     int
		tls      bool
		expected string
	}{
		{"default", "", 8317, false, "http://127.0.0.1:8317"},
		{"custom host", "0.0.0.0", 9090, false, "http://0.0.0.0:9090"},
		{"tls enabled", "example.com", 443, true, "https://example.com:443"},
		{"localhost", "localhost", 8080, false, "http://localhost:8080"},
		{"empty host defaults to 127.0.0.1", "", 8317, false, "http://127.0.0.1:8317"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &config.Config{
				Host: tt.host,
				Port: tt.port,
				TLS:  config.TLSConfig{Enable: tt.tls},
			}
			h, _ := setupSyncTest(t, cfg)
			w := performSyncRequest(h)
			resp := parseSyncResponse(t, w.Body.Bytes())

			if resp.BaseURL != tt.expected {
				t.Errorf("expected base_url %q, got %q", tt.expected, resp.BaseURL)
			}
		})
	}
}

// --- OAuth Model Alias Tests ---

// TestGetSyncAvailableConfigs_OAuthModelAliases verifies VAL-SRV-060:
// OAuth model aliases included with fork handling.
func TestGetSyncAvailableConfigs_OAuthModelAliases(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"claude": {
				{Name: "claude-sonnet-4-20250514", Alias: "sonnet-latest", Fork: true},
				{Name: "claude-opus-4-20250514", Alias: "opus-latest", Fork: false},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	var claudeChannel *SyncOAuthChannel
	for i := range resp.OAuthChannels {
		if resp.OAuthChannels[i].Channel == "claude" {
			claudeChannel = &resp.OAuthChannels[i]
			break
		}
	}
	if claudeChannel == nil {
		t.Fatal("expected claude OAuth channel")
	}

	models := claudeChannel.Models
	modelSet := make(map[string]bool)
	for _, m := range models {
		modelSet[m] = true
	}

	// Fork=true: both original and alias should be present
	if !modelSet["claude-sonnet-4-20250514"] {
		t.Error("expected original name 'claude-sonnet-4-20250514' when fork=true")
	}
	if !modelSet["sonnet-latest"] {
		t.Error("expected alias 'sonnet-latest' when fork=true")
	}

	// Fork=false: only alias should be present
	if modelSet["claude-opus-4-20250514"] {
		t.Error("original name 'claude-opus-4-20250514' should NOT appear when fork=false")
	}
	if !modelSet["opus-latest"] {
		t.Error("expected alias 'opus-latest' when fork=false")
	}
}

// --- Helper Function Tests ---

func TestMatchWildcard(t *testing.T) {
	tests := []struct {
		pattern string
		value   string
		match   bool
	}{
		{"gemini-2.5-*", "gemini-2.5-pro", true},
		{"gemini-2.5-*", "gemini-2.5-flash", true},
		{"gemini-2.5-*", "gemini-3-pro", false},
		{"*-preview", "claude-preview", true},
		{"*-preview", "claude-stable", false},
		{"*flash*", "gemini-2.5-flash-lite", true},
		{"*flash*", "gemini-2.5-pro", false},
		{"exact-match", "exact-match", true},
		{"exact-match", "no-match", false},
		{"*", "anything", true},
		{"", "anything", false},
	}

	for _, tt := range tests {
		got := matchWildcard(tt.pattern, tt.value)
		if got != tt.match {
			t.Errorf("matchWildcard(%q, %q) = %v, want %v", tt.pattern, tt.value, got, tt.match)
		}
	}
}

// --- Multi-Key Provider Tests ---

// TestGetSyncAvailableConfigs_MultiKeyProviders tests that multiple keys of same
// type are merged into a single provider entry.
func TestGetSyncAvailableConfigs_MultiKeyProviders(t *testing.T) {
	cfg := &config.Config{
		ClaudeKey: []config.ClaudeKey{
			{
				APIKey:  "key1",
				BaseURL: "https://claude1.example.com",
				Models:  []config.ClaudeModel{{Name: "claude-sonnet-4-20250514"}},
			},
			{
				APIKey:  "key2",
				BaseURL: "https://claude2.example.com",
				Models:  []config.ClaudeModel{{Name: "claude-opus-4-20250514", Alias: "opus"}},
			},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	claudeProviders := 0
	for _, p := range resp.Providers {
		if p.Type == "claude-api-key" {
			claudeProviders++
		}
	}
	if claudeProviders != 1 {
		t.Fatalf("expected 1 merged claude-api-key provider, got %d", claudeProviders)
	}

	// All models from both keys should be present
	modelSet := make(map[string]bool)
	for _, p := range resp.Providers {
		if p.Type == "claude-api-key" {
			for _, m := range p.Models {
				modelSet[m] = true
			}
		}
	}
	for _, expected := range []string{"claude-sonnet-4-20250514", "claude-opus-4-20250514", "opus"} {
		if !modelSet[expected] {
			t.Errorf("expected model %q in merged provider", expected)
		}
	}
}

// TestGetSyncAvailableConfigs_MultipleAPIKeys tests multiple API keys are all masked
// and each has the correct index.
func TestGetSyncAvailableConfigs_MultipleAPIKeys(t *testing.T) {
	cfg := &config.Config{
		SDKConfig: config.SDKConfig{
			APIKeys: []string{"sk-short", "sk-abc1234567890"},
		},
	}

	h, _ := setupSyncTest(t, cfg)
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())

	if len(resp.APIKeys) != 2 {
		t.Fatalf("expected 2 api keys, got %d", len(resp.APIKeys))
	}

	// Verify indices
	if resp.APIKeys[0].Index != 0 {
		t.Errorf("expected first key index 0, got %d", resp.APIKeys[0].Index)
	}
	if resp.APIKeys[1].Index != 1 {
		t.Errorf("expected second key index 1, got %d", resp.APIKeys[1].Index)
	}

	// First key "sk-short" is 8 chars, mask first 4: "****hort"
	if resp.APIKeys[0].Masked != "****hort" {
		t.Errorf("expected masked short key '****hort', got %q", resp.APIKeys[0].Masked)
	}

	// Second key: only last 4 visible
	second := resp.APIKeys[1].Masked
	if second[len(second)-4:] != "7890" {
		t.Errorf("expected last 4 chars '7890', got %q", second[len(second)-4:])
	}
	for i := 0; i < len(second)-4; i++ {
		if second[i] != '*' {
			t.Errorf("expected '*' at position %d, got %c", i, second[i])
		}
	}
}
