package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSanitizeSyncProfiles_Empty(t *testing.T) {
	cfg := &Config{}
	cfg.SanitizeSyncProfiles()
	if cfg.SyncProfiles != nil {
		t.Fatalf("expected nil SyncProfiles, got %v", cfg.SyncProfiles)
	}
}

func TestSanitizeSyncProfiles_NilConfig(t *testing.T) {
	var cfg *Config
	cfg.SanitizeSyncProfiles() // should not panic
}

func TestSanitizeSyncProfiles_TrimsName(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "  my-profile  ", Targets: []SyncProfileTarget{{Tool: "factory-droid"}}},
		},
	}
	cfg.SanitizeSyncProfiles()
	if cfg.SyncProfiles[0].Name != "my-profile" {
		t.Fatalf("expected trimmed name %q, got %q", "my-profile", cfg.SyncProfiles[0].Name)
	}
}

func TestSanitizeSyncProfiles_RemovesEmptyName(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "", Targets: []SyncProfileTarget{{Tool: "factory-droid"}}},
			{Name: "   ", Targets: []SyncProfileTarget{{Tool: "claude-code"}}},
			{Name: "valid", Targets: []SyncProfileTarget{{Tool: "hermes"}}},
		},
	}
	cfg.SanitizeSyncProfiles()
	if len(cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile after removing empty names, got %d", len(cfg.SyncProfiles))
	}
	if cfg.SyncProfiles[0].Name != "valid" {
		t.Fatalf("expected profile name %q, got %q", "valid", cfg.SyncProfiles[0].Name)
	}
}

func TestSanitizeSyncProfiles_RemovesInvalidTool(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid"},
					{Tool: "invalid-tool"},
					{Tool: "claude-code"},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	profile := cfg.SyncProfiles[0]
	if len(profile.Targets) != 2 {
		t.Fatalf("expected 2 targets after removing invalid tool, got %d", len(profile.Targets))
	}
	if profile.Targets[0].Tool != "factory-droid" {
		t.Fatalf("expected first target tool %q, got %q", "factory-droid", profile.Targets[0].Tool)
	}
	if profile.Targets[1].Tool != "claude-code" {
		t.Fatalf("expected second target tool %q, got %q", "claude-code", profile.Targets[1].Tool)
	}
}

func TestSanitizeSyncProfiles_ToolCaseInsensitive(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "Factory-Droid"},
					{Tool: "CLAUDE-CODE"},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	if cfg.SyncProfiles[0].Targets[0].Tool != "factory-droid" {
		t.Fatalf("expected lowercased tool %q, got %q", "factory-droid", cfg.SyncProfiles[0].Targets[0].Tool)
	}
	if cfg.SyncProfiles[0].Targets[1].Tool != "claude-code" {
		t.Fatalf("expected lowercased tool %q, got %q", "claude-code", cfg.SyncProfiles[0].Targets[1].Tool)
	}
}

func TestSanitizeSyncProfiles_DeduplicateTools(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", ActiveModel: "gpt-4o"},
					{Tool: "factory-droid", ActiveModel: "o3"},
					{Tool: "claude-code"},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	profile := cfg.SyncProfiles[0]
	if len(profile.Targets) != 2 {
		t.Fatalf("expected 2 targets after dedup, got %d", len(profile.Targets))
	}
	// First occurrence should be kept.
	if profile.Targets[0].ActiveModel != "gpt-4o" {
		t.Fatalf("expected first target active-model %q, got %q", "gpt-4o", profile.Targets[0].ActiveModel)
	}
}

func TestSanitizeSyncProfiles_DeduplicateProfileNames(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "Staging", Targets: []SyncProfileTarget{{Tool: "factory-droid"}}},
			{Name: "staging", Targets: []SyncProfileTarget{{Tool: "claude-code"}}},
			{Name: "Production", Targets: []SyncProfileTarget{{Tool: "hermes"}}},
		},
	}
	cfg.SanitizeSyncProfiles()
	if len(cfg.SyncProfiles) != 2 {
		t.Fatalf("expected 2 profiles after name dedup, got %d", len(cfg.SyncProfiles))
	}
	if cfg.SyncProfiles[0].Name != "Staging" {
		t.Fatalf("expected first profile %q, got %q", "Staging", cfg.SyncProfiles[0].Name)
	}
	if cfg.SyncProfiles[1].Name != "Production" {
		t.Fatalf("expected second profile %q, got %q", "Production", cfg.SyncProfiles[1].Name)
	}
}

func TestSanitizeSyncProfiles_RemovesEmptyTool(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: ""},
					{Tool: "  "},
					{Tool: "forgecode"},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	if len(cfg.SyncProfiles[0].Targets) != 1 {
		t.Fatalf("expected 1 target after removing empty tools, got %d", len(cfg.SyncProfiles[0].Targets))
	}
}

func TestSanitizeSyncProfiles_TrimsModelFilter(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", ModelFilter: "  ^gpt-.*  "},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	if cfg.SyncProfiles[0].Targets[0].ModelFilter != "^gpt-.*" {
		t.Fatalf("expected trimmed model-filter %q, got %q", "^gpt-.*", cfg.SyncProfiles[0].Targets[0].ModelFilter)
	}
}

func TestSanitizeSyncProfiles_ClearsInvalidRegex(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", ModelFilter: "[invalid"},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	if cfg.SyncProfiles[0].Targets[0].ModelFilter != "" {
		t.Fatalf("expected cleared model-filter for invalid regex, got %q", cfg.SyncProfiles[0].Targets[0].ModelFilter)
	}
}

func TestSanitizeSyncProfiles_TrimsActiveModel(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "claude-code", ActiveModel: "  claude-sonnet-4-20250514  "},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	if cfg.SyncProfiles[0].Targets[0].ActiveModel != "claude-sonnet-4-20250514" {
		t.Fatalf("expected trimmed active-model %q, got %q", "claude-sonnet-4-20250514", cfg.SyncProfiles[0].Targets[0].ActiveModel)
	}
}

func TestSanitizeSyncProfiles_NegativeAPIKeyIndex(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", APIKeyIndex: -1},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()
	if cfg.SyncProfiles[0].Targets[0].APIKeyIndex != 0 {
		t.Fatalf("expected api-key-index clamped to 0, got %d", cfg.SyncProfiles[0].Targets[0].APIKeyIndex)
	}
}

func TestSanitizeSyncProfiles_EmptyTargetsAllowed(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "placeholder", Targets: []SyncProfileTarget{}},
		},
	}
	cfg.SanitizeSyncProfiles()
	if len(cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile with empty targets, got %d", len(cfg.SyncProfiles))
	}
	if len(cfg.SyncProfiles[0].Targets) != 0 {
		t.Fatalf("expected 0 targets, got %d", len(cfg.SyncProfiles[0].Targets))
	}
}

func TestSanitizeSyncProfiles_NilTargetsAllowed(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "placeholder", Targets: nil},
		},
	}
	cfg.SanitizeSyncProfiles()
	if len(cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile with nil targets, got %d", len(cfg.SyncProfiles))
	}
}

func TestSanitizeSyncProfiles_AllValidToolIDs(t *testing.T) {
	allTools := []string{
		"factory-droid", "forgecode", "hermes", "opencode",
		"claude-code", "codex", "continue", "aider", "cursor",
	}
	targets := make([]SyncProfileTarget, len(allTools))
	for i, tool := range allTools {
		targets[i] = SyncProfileTarget{Tool: tool}
	}

	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "all-tools", Targets: targets},
		},
	}
	cfg.SanitizeSyncProfiles()

	if len(cfg.SyncProfiles[0].Targets) != len(allTools) {
		t.Fatalf("expected %d targets (all valid), got %d", len(allTools), len(cfg.SyncProfiles[0].Targets))
	}
}

func TestSanitizeSyncProfiles_ComplexProfile(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "  Dev Profile  ",
				Targets: []SyncProfileTarget{
					{Tool: "Factory-Droid", ModelFilter: "^gpt-.*", APIKeyIndex: 0, ActiveModel: "gpt-4o"},
					{Tool: "factory-droid", ModelFilter: "^o3-.*", APIKeyIndex: 1},
					{Tool: "claude-code", ActiveModel: "  claude-sonnet-4-20250514  "},
					{Tool: "invalid-tool"},
					{Tool: "", ModelFilter: "missing"},
				},
			},
			{
				Name: "",
				Targets: []SyncProfileTarget{
					{Tool: "hermes"},
				},
			},
			{
				Name: "  Dev Profile  ",
				Targets: []SyncProfileTarget{
					{Tool: "forgecode"},
				},
			},
		},
	}
	cfg.SanitizeSyncProfiles()

	// Should only have 1 profile (first "Dev Profile", empty name removed, duplicate name removed).
	if len(cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(cfg.SyncProfiles))
	}

	profile := cfg.SyncProfiles[0]
	if profile.Name != "Dev Profile" {
		t.Fatalf("expected name %q, got %q", "Dev Profile", profile.Name)
	}

	// Should have 2 targets: factory-droid (first) and claude-code (invalid/empty removed, duplicate tool removed).
	if len(profile.Targets) != 2 {
		t.Fatalf("expected 2 targets, got %d", len(profile.Targets))
	}

	t0 := profile.Targets[0]
	if t0.Tool != "factory-droid" || t0.ModelFilter != "^gpt-.*" || t0.APIKeyIndex != 0 || t0.ActiveModel != "gpt-4o" {
		t.Fatalf("unexpected first target: %+v", t0)
	}

	t1 := profile.Targets[1]
	if t1.Tool != "claude-code" || t1.ActiveModel != "claude-sonnet-4-20250514" {
		t.Fatalf("unexpected second target: %+v", t1)
	}
}

// --- ValidateSyncProfiles tests ---

func TestValidateSyncProfiles_NilConfig(t *testing.T) {
	var cfg *Config
	if err := cfg.ValidateSyncProfiles(); err != nil {
		t.Fatalf("expected nil error for nil config, got %v", err)
	}
}

func TestValidateSyncProfiles_ValidProfile(t *testing.T) {
	cfg := &Config{
		SDKConfig: SDKConfig{
			APIKeys: []string{"key1", "key2"},
		},
		SyncProfiles: []SyncProfile{
			{
				Name: "valid-profile",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", ModelFilter: "^gpt-.*", APIKeyIndex: 0, ActiveModel: "gpt-4o"},
					{Tool: "claude-code", APIKeyIndex: 1},
				},
			},
		},
	}
	if err := cfg.ValidateSyncProfiles(); err != nil {
		t.Fatalf("expected no validation error, got %v", err)
	}
}

func TestValidateSyncProfiles_EmptyName(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "", Targets: []SyncProfileTarget{{Tool: "factory-droid"}}},
		},
	}
	err := cfg.ValidateSyncProfiles()
	if err == nil {
		t.Fatal("expected validation error for empty name")
	}
}

func TestValidateSyncProfiles_InvalidTool(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "bogus-tool"},
				},
			},
		},
	}
	err := cfg.ValidateSyncProfiles()
	if err == nil {
		t.Fatal("expected validation error for invalid tool")
	}
}

func TestValidateSyncProfiles_DuplicateTool(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid"},
					{Tool: "factory-droid"},
				},
			},
		},
	}
	err := cfg.ValidateSyncProfiles()
	if err == nil {
		t.Fatal("expected validation error for duplicate tool")
	}
}

func TestValidateSyncProfiles_APIKeyIndexOutOfBounds(t *testing.T) {
	cfg := &Config{
		SDKConfig: SDKConfig{
			APIKeys: []string{"key1"},
		},
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", APIKeyIndex: 5},
				},
			},
		},
	}
	err := cfg.ValidateSyncProfiles()
	if err == nil {
		t.Fatal("expected validation error for out-of-bounds api-key-index")
	}
}

func TestValidateSyncProfiles_APIKeyIndexNegative(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", APIKeyIndex: -1},
				},
			},
		},
	}
	err := cfg.ValidateSyncProfiles()
	if err == nil {
		t.Fatal("expected validation error for negative api-key-index")
	}
}

func TestValidateSyncProfiles_InvalidModelFilter(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", ModelFilter: "[invalid"},
				},
			},
		},
	}
	err := cfg.ValidateSyncProfiles()
	if err == nil {
		t.Fatal("expected validation error for invalid model filter regex")
	}
}

func TestValidateSyncProfiles_DuplicateProfileName(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "my-profile", Targets: []SyncProfileTarget{{Tool: "factory-droid"}}},
			{Name: "my-profile", Targets: []SyncProfileTarget{{Tool: "claude-code"}}},
		},
	}
	err := cfg.ValidateSyncProfiles()
	if err == nil {
		t.Fatal("expected validation error for duplicate profile name")
	}
}

func TestValidateSyncProfiles_NoAPIKeysAllowsAnyIndex(t *testing.T) {
	// When no API keys are configured, any non-negative index should be allowed.
	cfg := &Config{
		SDKConfig: SDKConfig{
			APIKeys: nil,
		},
		SyncProfiles: []SyncProfile{
			{
				Name: "test",
				Targets: []SyncProfileTarget{
					{Tool: "factory-droid", APIKeyIndex: 100},
				},
			},
		},
	}
	if err := cfg.ValidateSyncProfiles(); err != nil {
		t.Fatalf("expected no validation error with no API keys, got %v", err)
	}
}

func TestValidateSyncProfiles_EmptyTargetsAllowed(t *testing.T) {
	cfg := &Config{
		SyncProfiles: []SyncProfile{
			{Name: "placeholder", Targets: []SyncProfileTarget{}},
		},
	}
	if err := cfg.ValidateSyncProfiles(); err != nil {
		t.Fatalf("expected no validation error for empty targets, got %v", err)
	}
}

// --- LoadConfig integration tests ---

func TestLoadConfig_ParsesSyncProfiles(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.yaml")
	configYAML := []byte(`
sync-profiles:
  - name: "dev"
    targets:
      - tool: "factory-droid"
        model-filter: "^gpt-.*"
        api-key-index: 0
        active-model: "gpt-4o"
      - tool: "claude-code"
        active-model: "claude-sonnet-4-20250514"
  - name: "minimal"
    targets:
      - tool: "hermes"
  - name: "empty-targets"
    targets: []
`)
	if err := os.WriteFile(configPath, configYAML, 0o600); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if len(cfg.SyncProfiles) != 3 {
		t.Fatalf("expected 3 sync profiles, got %d", len(cfg.SyncProfiles))
	}

	// Profile 1: dev
	p0 := cfg.SyncProfiles[0]
	if p0.Name != "dev" {
		t.Fatalf("expected profile name %q, got %q", "dev", p0.Name)
	}
	if len(p0.Targets) != 2 {
		t.Fatalf("expected 2 targets, got %d", len(p0.Targets))
	}
	if p0.Targets[0].Tool != "factory-droid" {
		t.Fatalf("expected tool %q, got %q", "factory-droid", p0.Targets[0].Tool)
	}
	if p0.Targets[0].ModelFilter != "^gpt-.*" {
		t.Fatalf("expected model-filter %q, got %q", "^gpt-.*", p0.Targets[0].ModelFilter)
	}
	if p0.Targets[0].APIKeyIndex != 0 {
		t.Fatalf("expected api-key-index 0, got %d", p0.Targets[0].APIKeyIndex)
	}
	if p0.Targets[0].ActiveModel != "gpt-4o" {
		t.Fatalf("expected active-model %q, got %q", "gpt-4o", p0.Targets[0].ActiveModel)
	}

	// Profile 2: minimal
	p1 := cfg.SyncProfiles[1]
	if p1.Name != "minimal" {
		t.Fatalf("expected profile name %q, got %q", "minimal", p1.Name)
	}
	if len(p1.Targets) != 1 || p1.Targets[0].Tool != "hermes" {
		t.Fatalf("expected 1 target with tool %q", "hermes")
	}

	// Profile 3: empty-targets
	p2 := cfg.SyncProfiles[2]
	if p2.Name != "empty-targets" {
		t.Fatalf("expected profile name %q, got %q", "empty-targets", p2.Name)
	}
	if len(p2.Targets) != 0 {
		t.Fatalf("expected 0 targets, got %d", len(p2.Targets))
	}
}

func TestLoadConfig_NoSyncProfiles(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.yaml")
	configYAML := []byte(`port: 8317
`)
	if err := os.WriteFile(configPath, configYAML, 0o600); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.SyncProfiles != nil {
		t.Fatalf("expected nil SyncProfiles when not configured, got %v", cfg.SyncProfiles)
	}
}

func TestLoadConfig_SanitizesSyncProfiles(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.yaml")
	configYAML := []byte(`
sync-profiles:
  - name: ""
    targets:
      - tool: "factory-droid"
  - name: "  valid  "
    targets:
      - tool: "factory-droid"
      - tool: "factory-droid"
      - tool: "unknown-tool"
      - tool: "claude-code"
        model-filter: "[bad-regex"
`)
	if err := os.WriteFile(configPath, configYAML, 0o600); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}

	cfg, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if len(cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile after sanitization, got %d", len(cfg.SyncProfiles))
	}

	p := cfg.SyncProfiles[0]
	if p.Name != "valid" {
		t.Fatalf("expected trimmed name %q, got %q", "valid", p.Name)
	}
	if len(p.Targets) != 2 {
		t.Fatalf("expected 2 targets after dedup/removal, got %d", len(p.Targets))
	}
	if p.Targets[0].Tool != "factory-droid" {
		t.Fatalf("expected first target %q, got %q", "factory-droid", p.Targets[0].Tool)
	}
	if p.Targets[1].Tool != "claude-code" {
		t.Fatalf("expected second target %q, got %q", "claude-code", p.Targets[1].Tool)
	}
	if p.Targets[1].ModelFilter != "" {
		t.Fatalf("expected cleared model-filter for bad regex, got %q", p.Targets[1].ModelFilter)
	}
}
