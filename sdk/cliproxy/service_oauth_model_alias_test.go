package cliproxy

import (
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	"github.com/router-for-me/CLIProxyAPI/v7/sdk/config"
)

func TestApplyOAuthModelAlias_Rename(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"codex": {
				{Name: "gpt-5", Alias: "g5"},
			},
		},
	}
	models := []*ModelInfo{
		{ID: "gpt-5", Name: "models/gpt-5"},
	}

	out := applyOAuthModelAlias(cfg, "codex", "oauth", models)
	if len(out) != 1 {
		t.Fatalf("expected 1 model, got %d", len(out))
	}
	if out[0].ID != "g5" {
		t.Fatalf("expected model id %q, got %q", "g5", out[0].ID)
	}
	if out[0].Name != "models/g5" {
		t.Fatalf("expected model name %q, got %q", "models/g5", out[0].Name)
	}
}

func TestApplyAutomaticThinkingAliases(t *testing.T) {
	models := []*ModelInfo{
		{
			ID:       "gpt-5.3-codex-spark",
			Name:     "models/gpt-5.3-codex-spark",
			Thinking: &registry.ThinkingSupport{Levels: []string{"low", "medium", "high", "xhigh"}},
		},
	}

	out := applyAutomaticThinkingAliases(models, nil)
	ids := make(map[string]*ModelInfo, len(out))
	for _, model := range out {
		ids[model.ID] = model
	}
	for _, id := range []string{
		"gpt-5.3-codex-spark",
		"gpt-5.3-codex-spark-low",
		"gpt-5.3-codex-spark-medium",
		"gpt-5.3-codex-spark-high",
		"gpt-5.3-codex-spark-xhigh",
	} {
		if ids[id] == nil {
			t.Fatalf("missing model alias %q in %#v", id, ids)
		}
	}
	if got := ids["gpt-5.3-codex-spark-high"].ThinkingAliasBase; got != "gpt-5.3-codex-spark" {
		t.Fatalf("ThinkingAliasBase = %q", got)
	}
}

func TestBuildOpenAICompatibilityConfigModels_ThinkingPayloads(t *testing.T) {
	compat := &config.OpenAICompatibility{
		Name: "zhipu",
		Models: []config.OpenAICompatibilityModel{
			{
				Name:  "glm-4.6",
				Alias: "glm-4.6",
				ThinkingPayloads: map[string]map[string]any{
					"NONE": {"thinking": map[string]any{"type": "disabled"}},
					"High": {"thinking": map[string]any{"type": "enabled"}},
					"":     {"dropped": true},
				},
			},
		},
	}

	models := buildOpenAICompatibilityConfigModels(compat)
	if len(models) != 1 {
		t.Fatalf("expected 1 model, got %d", len(models))
	}
	model := models[0]
	if model.Thinking == nil || len(model.Thinking.Levels) != 1 || model.Thinking.Levels[0] != "high" {
		t.Fatalf("payload level keys should declare thinking levels, got %#v", model.Thinking)
	}
	if len(model.ThinkingPayloads) != 2 {
		t.Fatalf("normalized payloads = %#v, want none+high", model.ThinkingPayloads)
	}

	// The synthesized level feeds the automatic alias generator.
	out := applyAutomaticThinkingAliases(models, nil)
	found := false
	for _, m := range out {
		if m.ID == "glm-4.6-high" {
			found = true
			if m.ThinkingAliasBase != "glm-4.6" {
				t.Fatalf("ThinkingAliasBase = %q", m.ThinkingAliasBase)
			}
		}
	}
	if !found {
		t.Fatalf("missing glm-4.6-high alias in %#v", out)
	}
}

func TestBuildOpenAICompatibilityConfigModels_ExplicitLevelsKeepPriority(t *testing.T) {
	compat := &config.OpenAICompatibility{
		Name: "zhipu",
		Models: []config.OpenAICompatibilityModel{
			{
				Name:     "glm-4.6",
				Alias:    "glm-4.6",
				Thinking: &registry.ThinkingSupport{Levels: []string{"low", "medium", "high"}},
				ThinkingPayloads: map[string]map[string]any{
					"high": {"thinking": map[string]any{"type": "enabled"}},
				},
			},
		},
	}

	models := buildOpenAICompatibilityConfigModels(compat)
	if len(models) != 1 {
		t.Fatalf("expected 1 model, got %d", len(models))
	}
	if got := models[0].Thinking.Levels; len(got) != 3 {
		t.Fatalf("explicit levels should win, got %v", got)
	}
}

func TestApplyAutomaticThinkingAliases_FollowsDeclaredLevels(t *testing.T) {
	models := []*ModelInfo{
		{
			ID:       "claude-fable-5",
			Thinking: &registry.ThinkingSupport{Levels: []string{"low", "medium", "high", "xhigh", "max"}},
		},
		{
			ID:       "gemini-3-flash-preview",
			Thinking: &registry.ThinkingSupport{Levels: []string{"minimal", "low", "medium", "high"}},
		},
	}

	out := applyAutomaticThinkingAliases(models, nil)
	ids := make(map[string]*ModelInfo, len(out))
	for _, model := range out {
		ids[model.ID] = model
	}
	for _, id := range []string{
		"claude-fable-5-low",
		"claude-fable-5-medium",
		"claude-fable-5-high",
		"claude-fable-5-xhigh",
		"claude-fable-5-max",
		"gemini-3-flash-preview-minimal",
		"gemini-3-flash-preview-low",
		"gemini-3-flash-preview-medium",
		"gemini-3-flash-preview-high",
	} {
		if ids[id] == nil {
			t.Fatalf("missing model alias %q", id)
		}
	}
	for _, id := range []string{
		"claude-fable-5-minimal",
		"gemini-3-flash-preview-xhigh",
		"gemini-3-flash-preview-max",
	} {
		if ids[id] != nil {
			t.Fatalf("unexpected model alias %q for unsupported level", id)
		}
	}
}

func TestApplyAutomaticThinkingAliases_ExplicitAliasWins(t *testing.T) {
	models := []*ModelInfo{
		{ID: "base", Thinking: &registry.ThinkingSupport{Levels: []string{"high"}}},
		{ID: "base-high"},
	}

	out := applyAutomaticThinkingAliases(models, nil)
	count := 0
	for _, model := range out {
		if model.ID == "base-high" {
			count++
			if model.ThinkingAliasBase != "" {
				t.Fatalf("explicit alias should keep priority, got generated marker %q", model.ThinkingAliasBase)
			}
		}
	}
	if count != 1 {
		t.Fatalf("base-high count = %d, want 1", count)
	}
}

func TestApplyOAuthModelAlias_ForkAddsAlias(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"codex": {
				{Name: "gpt-5", Alias: "g5", Fork: true},
			},
		},
	}
	models := []*ModelInfo{
		{ID: "gpt-5", Name: "models/gpt-5"},
	}

	out := applyOAuthModelAlias(cfg, "codex", "oauth", models)
	if len(out) != 2 {
		t.Fatalf("expected 2 models, got %d", len(out))
	}
	if out[0].ID != "gpt-5" {
		t.Fatalf("expected first model id %q, got %q", "gpt-5", out[0].ID)
	}
	if out[1].ID != "g5" {
		t.Fatalf("expected second model id %q, got %q", "g5", out[1].ID)
	}
	if out[1].Name != "models/g5" {
		t.Fatalf("expected forked model name %q, got %q", "models/g5", out[1].Name)
	}
}

func TestApplyOAuthModelAlias_ForkAddsFixedThinkingAlias(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"codex": {
				{Name: "gpt-5.3-codex-spark-high", Alias: "spark-fast", Fork: true},
			},
		},
	}
	models := []*ModelInfo{
		{
			ID:       "gpt-5.3-codex-spark",
			Name:     "models/gpt-5.3-codex-spark",
			Thinking: &registry.ThinkingSupport{Levels: []string{"low", "medium", "high", "xhigh"}},
		},
	}

	aliased := applyOAuthModelAlias(cfg, "codex", "oauth", models)
	ids := make(map[string]*ModelInfo, len(aliased))
	for _, model := range aliased {
		ids[model.ID] = model
	}
	if ids["spark-fast"] == nil {
		t.Fatalf("missing fixed thinking alias in %#v", ids)
	}
	if ids["spark-fast"].Thinking != nil {
		t.Fatalf("fixed thinking alias should not generate additional thinking aliases")
	}

	out := applyAutomaticThinkingAliases(aliased, nil)
	ids = make(map[string]*ModelInfo, len(out))
	for _, model := range out {
		ids[model.ID] = model
	}
	if ids["spark-fast"] == nil {
		t.Fatalf("missing fixed thinking alias after automatic aliases in %#v", ids)
	}
	if ids["spark-fast-low"] != nil {
		t.Fatalf("fixed thinking alias generated a misleading level alias")
	}
	if ids["gpt-5.3-codex-spark-high"] == nil {
		t.Fatalf("missing automatic base thinking alias in %#v", ids)
	}
}

func TestApplyOAuthModelAlias_FixedThinkingAliasRequiresSupportedBase(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"codex": {
				{Name: "plain-model-high", Alias: "plain-fast", Fork: true},
			},
		},
	}
	models := []*ModelInfo{
		{ID: "plain-model", Name: "models/plain-model"},
	}

	out := applyOAuthModelAlias(cfg, "codex", "oauth", models)
	for _, model := range out {
		if model.ID == "plain-fast" {
			t.Fatalf("non-thinking base model should not get fixed thinking alias")
		}
	}
}

func TestApplyOAuthModelAlias_ForkAddsMultipleAliases(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"codex": {
				{Name: "gpt-5", Alias: "g5", Fork: true},
				{Name: "gpt-5", Alias: "g5-2", Fork: true},
			},
		},
	}
	models := []*ModelInfo{
		{ID: "gpt-5", Name: "models/gpt-5"},
	}

	out := applyOAuthModelAlias(cfg, "codex", "oauth", models)
	if len(out) != 3 {
		t.Fatalf("expected 3 models, got %d", len(out))
	}
	if out[0].ID != "gpt-5" {
		t.Fatalf("expected first model id %q, got %q", "gpt-5", out[0].ID)
	}
	if out[1].ID != "g5" {
		t.Fatalf("expected second model id %q, got %q", "g5", out[1].ID)
	}
	if out[1].Name != "models/g5" {
		t.Fatalf("expected forked model name %q, got %q", "models/g5", out[1].Name)
	}
	if out[2].ID != "g5-2" {
		t.Fatalf("expected third model id %q, got %q", "g5-2", out[2].ID)
	}
	if out[2].Name != "models/g5-2" {
		t.Fatalf("expected forked model name %q, got %q", "models/g5-2", out[2].Name)
	}
}

func TestApplyOAuthModelAlias_PluginProvider(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"sample-provider": {
				{Name: "sample-model-latest", Alias: "sample-latest"},
			},
		},
	}
	models := []*ModelInfo{
		{ID: "sample-model-latest", Name: "models/sample-model-latest"},
	}

	out := applyOAuthModelAlias(cfg, "sample-provider", "oauth", models)
	if len(out) != 1 {
		t.Fatalf("expected 1 model, got %d", len(out))
	}
	if out[0].ID != "sample-latest" {
		t.Fatalf("expected plugin alias id %q, got %q", "sample-latest", out[0].ID)
	}
	if out[0].Name != "models/sample-latest" {
		t.Fatalf("expected plugin alias name %q, got %q", "models/sample-latest", out[0].Name)
	}
}

func TestApplyOAuthModelAlias_PluginProviderSkipsAPIKey(t *testing.T) {
	cfg := &config.Config{
		OAuthModelAlias: map[string][]config.OAuthModelAlias{
			"sample-provider": {
				{Name: "sample-model-latest", Alias: "sample-latest"},
			},
		},
	}
	models := []*ModelInfo{
		{ID: "sample-model-latest", Name: "models/sample-model-latest"},
	}

	out := applyOAuthModelAlias(cfg, "sample-provider", "api_key", models)
	if len(out) != 1 || out[0].ID != "sample-model-latest" {
		t.Fatalf("expected API key plugin model to remain unchanged, got %#v", out)
	}
}
