package thinking_test

import (
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/thinking"
)

func TestDefaultThinkingForModel_RegistryDriven(t *testing.T) {
	tests := []struct {
		name   string
		model  string
		levels []string
	}{
		// Models present in the registry's static data; the old hardcoded
		// catalog stopped at claude-opus-4-7 and would have returned nil here.
		{name: "registry exact", model: "claude-fable-5", levels: []string{"low", "medium", "high", "xhigh", "max"}},
		{name: "registry exact opus", model: "claude-opus-4-8", levels: []string{"low", "medium", "high", "xhigh", "max"}},
		{name: "registry dated variant", model: "claude-opus-4-8-20260115", levels: []string{"low", "medium", "high", "xhigh", "max"}},
		{name: "registry case-insensitive", model: "GPT-5.5", levels: []string{"low", "medium", "high", "xhigh"}},
		{name: "registry codex spark", model: "gpt-5.3-codex-spark", levels: []string{"low", "medium", "high", "xhigh"}},

		// Models absent from the registry, covered by the legacy fallback.
		{name: "legacy gpt-5.2", model: "gpt-5.2", levels: []string{"low", "medium", "high", "xhigh"}},
		{name: "legacy gpt-5.3-codex", model: "gpt-5.3-codex", levels: []string{"low", "medium", "high", "xhigh"}},
		{name: "legacy o-series dated", model: "o1-2024-12-17", levels: []string{"low", "medium", "high"}},
		{name: "legacy o3 mini", model: "o3-mini", levels: []string{"low", "medium", "high"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := thinking.DefaultThinkingForModel(tt.model)
			if got == nil {
				t.Fatalf("DefaultThinkingForModel(%q) = nil, want levels %v", tt.model, tt.levels)
			}
			if len(got.Levels) != len(tt.levels) {
				t.Fatalf("DefaultThinkingForModel(%q).Levels = %v, want %v", tt.model, got.Levels, tt.levels)
			}
			for i, level := range tt.levels {
				if got.Levels[i] != level {
					t.Fatalf("DefaultThinkingForModel(%q).Levels = %v, want %v", tt.model, got.Levels, tt.levels)
				}
			}
		})
	}
}

func TestDefaultThinkingForModel_LevelsOnly(t *testing.T) {
	// The registry declares budget ranges for Claude models, but the
	// OpenAI-compatibility defaults must stay level-only so downstream
	// validation treats the model as level-capable rather than hybrid.
	got := thinking.DefaultThinkingForModel("claude-opus-4-8")
	if got == nil {
		t.Fatal("DefaultThinkingForModel(claude-opus-4-8) = nil")
	}
	if got.Min != 0 || got.Max != 0 {
		t.Fatalf("expected levels-only support, got min=%d max=%d", got.Min, got.Max)
	}
}

func TestDefaultThinkingForModel_Unknown(t *testing.T) {
	for _, model := range []string{"", "llama-3-70b", "o10", "gpt-4o"} {
		if got := thinking.DefaultThinkingForModel(model); got != nil {
			t.Fatalf("DefaultThinkingForModel(%q) = %v, want nil", model, got)
		}
	}
}
