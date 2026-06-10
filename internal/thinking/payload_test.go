package thinking_test

import (
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/thinking"
	_ "github.com/router-for-me/CLIProxyAPI/v7/internal/thinking/provider/openai"
	"github.com/tidwall/gjson"
)

func TestMergeThinkingPayload(t *testing.T) {
	body := []byte(`{"model":"glm-4.6","reasoning_effort":"high","temperature":0.2,"thinking":{"keep":"me"}}`)
	out := thinking.MergeThinkingPayload(body, map[string]any{
		"thinking":    map[string]any{"type": "enabled"},
		"temperature": nil,
	})

	if gjson.GetBytes(out, "reasoning_effort").Exists() {
		t.Fatalf("reasoning_effort should be removed, body=%s", out)
	}
	if gjson.GetBytes(out, "temperature").Exists() {
		t.Fatalf("null payload value should delete the field, body=%s", out)
	}
	if got := gjson.GetBytes(out, "thinking.type").String(); got != "enabled" {
		t.Fatalf("thinking.type = %q, want enabled, body=%s", got, out)
	}
	if got := gjson.GetBytes(out, "thinking.keep").String(); got != "me" {
		t.Fatalf("nested merge should preserve sibling fields, body=%s", out)
	}
	if got := gjson.GetBytes(out, "model").String(); got != "glm-4.6" {
		t.Fatalf("unrelated fields must survive, body=%s", out)
	}
}

func TestMergeThinkingPayload_PatchCanSetReasoningEffort(t *testing.T) {
	out := thinking.MergeThinkingPayload([]byte(`{"reasoning_effort":"high"}`), map[string]any{
		"reasoning_effort": "max",
	})
	if got := gjson.GetBytes(out, "reasoning_effort").String(); got != "max" {
		t.Fatalf("patch should be able to reintroduce reasoning_effort, got %q", got)
	}
}

func TestMergeThinkingPayload_EscapesPathKeys(t *testing.T) {
	out := thinking.MergeThinkingPayload([]byte(`{}`), map[string]any{
		"weird.key": true,
	})
	if !gjson.GetBytes(out, `weird\.key`).Bool() {
		t.Fatalf("dotted key should be set literally, body=%s", out)
	}
}

func TestNormalizeThinkingPayloads(t *testing.T) {
	payloads := map[string]map[string]any{
		"High":    {"thinking": map[string]any{"type": "enabled"}},
		"NONE":    {"thinking": map[string]any{"type": "disabled"}},
		"bogus":   {"ignored": true},
		"medium":  {},
		"minimal": {"enable_thinking": true},
	}
	out := thinking.NormalizeThinkingPayloads(payloads)
	if len(out) != 3 {
		t.Fatalf("normalized payloads = %#v, want 3 entries", out)
	}
	for _, label := range []string{"high", "none", "minimal"} {
		if _, ok := out[label]; !ok {
			t.Fatalf("missing normalized label %q in %#v", label, out)
		}
	}

	if got := thinking.PayloadLevelKeys(out); len(got) != 2 || got[0] != "minimal" || got[1] != "high" {
		t.Fatalf("PayloadLevelKeys = %v, want [minimal high]", got)
	}

	if thinking.NormalizeThinkingPayloads(nil) != nil {
		t.Fatal("nil payloads should normalize to nil")
	}
}

func TestApplyThinking_PayloadOverrideForCompatModel(t *testing.T) {
	reg := registry.GetGlobalRegistry()
	payloads := map[string]map[string]any{
		"high": {"thinking": map[string]any{"type": "enabled"}},
		"none": {"thinking": map[string]any{"type": "disabled"}},
	}
	reg.RegisterClient("thinking-payload-test", "zhipu", []*registry.ModelInfo{
		{
			ID:               "glm-4.6",
			Thinking:         &registry.ThinkingSupport{Levels: []string{"low", "high"}},
			ThinkingPayloads: payloads,
		},
	})
	t.Cleanup(func() { reg.UnregisterClient("thinking-payload-test") })

	body := []byte(`{"model":"glm-4.6","reasoning_effort":"low"}`)
	out, err := thinking.ApplyThinking(body, "glm-4.6(high)", "openai", "openai", "zhipu")
	if err != nil {
		t.Fatalf("ApplyThinking() error = %v", err)
	}
	if got := gjson.GetBytes(out, "thinking.type").String(); got != "enabled" {
		t.Fatalf("thinking.type = %q, want enabled, body=%s", got, out)
	}
	if gjson.GetBytes(out, "reasoning_effort").Exists() {
		t.Fatalf("reasoning_effort should be stripped, body=%s", out)
	}

	// none label routes through the ModeNone path and still hits the payload.
	out, err = thinking.ApplyThinking([]byte(`{"model":"glm-4.6"}`), "glm-4.6(none)", "openai", "openai", "zhipu")
	if err != nil {
		t.Fatalf("ApplyThinking(none) error = %v", err)
	}
	if got := gjson.GetBytes(out, "thinking.type").String(); got != "disabled" {
		t.Fatalf("thinking.type = %q, want disabled, body=%s", got, out)
	}

	// Levels without a payload entry fall back to standard reasoning_effort.
	out, err = thinking.ApplyThinking([]byte(`{"model":"glm-4.6"}`), "glm-4.6(low)", "openai", "openai", "zhipu")
	if err != nil {
		t.Fatalf("ApplyThinking(low) error = %v", err)
	}
	if got := gjson.GetBytes(out, "reasoning_effort").String(); got != "low" {
		t.Fatalf("reasoning_effort = %q, want low, body=%s", got, out)
	}
	if gjson.GetBytes(out, "thinking").Exists() {
		t.Fatalf("payload should not apply for unmapped level, body=%s", out)
	}
}

func TestApplyThinking_PayloadOverrideViaHyphenAlias(t *testing.T) {
	reg := registry.GetGlobalRegistry()
	support := &registry.ThinkingSupport{Levels: []string{"high"}}
	payloads := map[string]map[string]any{
		"high": {"enable_thinking": true, "thinking_budget": 24576},
	}
	reg.RegisterClient("thinking-payload-alias-test", "qwen", []*registry.ModelInfo{
		{ID: "qwen3-max", Thinking: support, ThinkingPayloads: payloads},
		{ID: "qwen3-max-high", Thinking: support, ThinkingPayloads: payloads, ThinkingAliasBase: "qwen3-max"},
	})
	t.Cleanup(func() { reg.UnregisterClient("thinking-payload-alias-test") })

	out, err := thinking.ApplyThinking([]byte(`{"model":"qwen3-max"}`), "qwen3-max-high", "openai", "openai", "qwen")
	if err != nil {
		t.Fatalf("ApplyThinking() error = %v", err)
	}
	if !gjson.GetBytes(out, "enable_thinking").Bool() {
		t.Fatalf("enable_thinking should be set, body=%s", out)
	}
	if got := gjson.GetBytes(out, "thinking_budget").Int(); got != 24576 {
		t.Fatalf("thinking_budget = %d, want 24576, body=%s", got, out)
	}
}
