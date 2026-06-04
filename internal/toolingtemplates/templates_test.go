package toolingtemplates

import (
	"encoding/json"
	"testing"
)

func TestRenderFactoryDroidUsesSettingsSchema(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"go/deepseek-v4-pro", "go/minimax-m2.7"},
		TemplateIDs: []string{"factory-droid"},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if len(resp.Templates) != 1 {
		t.Fatalf("expected one template, got %d", len(resp.Templates))
	}

	var payload struct {
		CustomModels []map[string]interface{} `json:"customModels"`
	}
	if err := json.Unmarshal([]byte(resp.Templates[0].Content), &payload); err != nil {
		t.Fatalf("factory droid content is not valid JSON: %v", err)
	}
	if len(payload.CustomModels) != 2 {
		t.Fatalf("expected two custom models, got %d", len(payload.CustomModels))
	}

	first := payload.CustomModels[0]
	if first["model"] != "go/deepseek-v4-pro" {
		t.Fatalf("unexpected model: %v", first["model"])
	}
	if first["id"] != "custom:Deepseek-V4-Pro" {
		t.Fatalf("unexpected id: %v", first["id"])
	}
	if first["baseUrl"] != "http://localhost:8317/v1" {
		t.Fatalf("unexpected baseUrl: %v", first["baseUrl"])
	}
	if first["apiKey"] != "sk-test" {
		t.Fatalf("unexpected apiKey: %v", first["apiKey"])
	}
	if first["displayName"] != "Deepseek V4 Pro" {
		t.Fatalf("unexpected displayName: %v", first["displayName"])
	}
	if first["provider"] != "generic-chat-completion-api" {
		t.Fatalf("unexpected provider: %v", first["provider"])
	}
	if first["maxOutputTokens"] != float64(384000) {
		t.Fatalf("unexpected maxOutputTokens: %v", first["maxOutputTokens"])
	}
	if first["noImageSupport"] != false {
		t.Fatalf("unexpected noImageSupport: %v", first["noImageSupport"])
	}

	second := payload.CustomModels[1]
	if second["id"] != "custom:Minimax-M2.7" {
		t.Fatalf("unexpected second id: %v", second["id"])
	}
	if second["displayName"] != "Minimax M2.7" {
		t.Fatalf("unexpected second displayName: %v", second["displayName"])
	}
	if second["maxOutputTokens"] != float64(131072) {
		t.Fatalf("unexpected second maxOutputTokens: %v", second["maxOutputTokens"])
	}
}

func TestRenderBySyncToolIDReturnsCanonicalTemplate(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"gpt-4o"},
		SyncToolIDs: []string{"claude-code"},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if len(resp.Templates) != 1 {
		t.Fatalf("expected one template, got %d", len(resp.Templates))
	}
	if resp.Templates[0].ID != "claude-code-settings" {
		t.Fatalf("expected claude-code-settings, got %s", resp.Templates[0].ID)
	}
	if resp.Templates[0].SyncToolID != "claude-code" {
		t.Fatalf("expected sync tool id claude-code, got %s", resp.Templates[0].SyncToolID)
	}
}

func TestRenderRejectsInvalidMode(t *testing.T) {
	_, err := Render(RenderRequest{APIKeyMode: "raw"})
	if err == nil {
		t.Fatal("expected invalid mode error")
	}
}

func TestRenderFactoryDroidOpenAIProvider(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"gpt-5.5", "kimi-k2.6"},
		TemplateIDs: []string{"factory-droid"},
		ModelProviders: map[string]string{
			"gpt-5.5":   ModelProviderOpenAI,
			"kimi-k2.6": ModelProviderGeneric,
		},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if len(resp.Templates) != 1 {
		t.Fatalf("expected one template, got %d", len(resp.Templates))
	}

	var payload struct {
		CustomModels []map[string]interface{} `json:"customModels"`
	}
	if err := json.Unmarshal([]byte(resp.Templates[0].Content), &payload); err != nil {
		t.Fatalf("content is not valid JSON: %v", err)
	}
	if len(payload.CustomModels) != 2 {
		t.Fatalf("expected two custom models, got %d", len(payload.CustomModels))
	}

	openaiModel := payload.CustomModels[0]
	if openaiModel["model"] != "gpt-5.5" {
		t.Fatalf("unexpected model: %v", openaiModel["model"])
	}
	if openaiModel["provider"] != "openai" {
		t.Fatalf("expected provider 'openai' for gpt-5.5, got %v", openaiModel["provider"])
	}

	genericModel := payload.CustomModels[1]
	if genericModel["model"] != "kimi-k2.6" {
		t.Fatalf("unexpected model: %v", genericModel["model"])
	}
	if genericModel["provider"] != "generic-chat-completion-api" {
		t.Fatalf("expected provider 'generic-chat-completion-api' for kimi-k2.6, got %v", genericModel["provider"])
	}
}

func TestRenderFactoryDroidAnthropicProvider(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"claude-sonnet-4-6"},
		TemplateIDs: []string{"factory-droid"},
		ModelProviders: map[string]string{
			"claude-sonnet-4-6": ModelProviderAnthropic,
		},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	var payload struct {
		CustomModels []map[string]interface{} `json:"customModels"`
	}
	if err := json.Unmarshal([]byte(resp.Templates[0].Content), &payload); err != nil {
		t.Fatalf("content is not valid JSON: %v", err)
	}
	if payload.CustomModels[0]["provider"] != "anthropic" {
		t.Fatalf("expected provider 'anthropic', got %v", payload.CustomModels[0]["provider"])
	}
}

func TestRenderFactoryDroidDefaultProviderWhenNoProviders(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"some-model"},
		TemplateIDs: []string{"factory-droid"},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	var payload struct {
		CustomModels []map[string]interface{} `json:"customModels"`
	}
	if err := json.Unmarshal([]byte(resp.Templates[0].Content), &payload); err != nil {
		t.Fatalf("content is not valid JSON: %v", err)
	}
	if payload.CustomModels[0]["provider"] != "generic-chat-completion-api" {
		t.Fatalf("expected default provider, got %v", payload.CustomModels[0]["provider"])
	}
}

func TestRenderCodexOpenAIUsesResponsesWireAPI(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"gpt-5.5"},
		TemplateIDs: []string{"codex"},
		ModelProviders: map[string]string{
			"gpt-5.5": ModelProviderOpenAI,
		},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	content := resp.Templates[0].Content
	if !containsWireAPI(content, "responses") {
		t.Fatalf("expected wire_api = \"responses\" for OpenAI model, got:\n%s", content)
	}
}

func TestRenderCodexGenericUsesChatWireAPI(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"kimi-k2.6"},
		TemplateIDs: []string{"codex"},
		ModelProviders: map[string]string{
			"kimi-k2.6": ModelProviderGeneric,
		},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	content := resp.Templates[0].Content
	if !containsWireAPI(content, "chat") {
		t.Fatalf("expected wire_api = \"chat\" for generic model, got:\n%s", content)
	}
}

func TestRenderForgeCodeOpenAIUsesResponsesWireAPI(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"gpt-5.5"},
		TemplateIDs: []string{"forgecode"},
		ModelProviders: map[string]string{
			"gpt-5.5": ModelProviderOpenAI,
		},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	content := resp.Templates[0].Content
	if !containsWireAPI(content, "responses") {
		t.Fatalf("expected wire_api = \"responses\" for OpenAI model, got:\n%s", content)
	}
}

func TestRenderForgeCodeGenericUsesOpenAIWireAPI(t *testing.T) {
	req := RenderRequest{
		BaseURL:     "http://localhost:8317",
		APIKey:      "sk-test",
		APIKeyMode:  ModeEmbed,
		Models:      []string{"kimi-k2.6"},
		TemplateIDs: []string{"forgecode"},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	content := resp.Templates[0].Content
	if !containsWireAPI(content, "openai") {
		t.Fatalf("expected wire_api = \"openai\" for generic model, got:\n%s", content)
	}
}

func TestResolveProviderForModelPrefixStrip(t *testing.T) {
	req := RenderRequest{
		ModelProviders: map[string]string{
			"deepseek-v4-pro": ModelProviderGeneric,
		},
	}
	if p := resolveProviderForModel(req, "go/deepseek-v4-pro"); p != ModelProviderGeneric {
		t.Fatalf("expected generic after prefix strip, got %q", p)
	}
}

func TestRenderManualConfigOpenAIMarkdownIncludesEndpointsAndModels(t *testing.T) {
	req := RenderRequest{
		BaseURL:    "http://localhost:8317",
		APIKey:     "sk-test",
		APIKeyMode: ModeEmbed,
		Models:     []string{"gpt-5.5", "kimi-k2.6"},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	markdown := manualBlockMarkdown(t, resp, "openai")
	for _, want := range []string{
		"# OpenAI-Compatible Endpoint",
		"`http://localhost:8317/v1/chat/completions`",
		"`http://localhost:8317/v1/models`",
		"Authorization: Bearer sk-test",
		"- `gpt-5.5`",
		"- `kimi-k2.6`",
	} {
		if !containsString(markdown, want) {
			t.Fatalf("openai markdown missing %q, got:\n%s", want, markdown)
		}
	}
}

func TestRenderManualConfigAnthropicMarkdownIncludesEndpointsAndModels(t *testing.T) {
	req := RenderRequest{
		BaseURL:    "http://localhost:8317",
		APIKey:     "sk-test",
		APIKeyMode: ModeEmbed,
		Models:     []string{"claude-haiku-4-5"},
	}

	resp, err := Render(req)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	markdown := manualBlockMarkdown(t, resp, "anthropic")
	for _, want := range []string{
		"# Anthropic-Compatible Endpoint",
		"`http://localhost:8317/v1/messages`",
		"x-api-key: sk-test",
		"anthropic-version: 2023-06-01",
		"- `claude-haiku-4-5`",
	} {
		if !containsString(markdown, want) {
			t.Fatalf("anthropic markdown missing %q, got:\n%s", want, markdown)
		}
	}
}

func TestRenderManualConfigPlaceholderModeUsesPlaceholders(t *testing.T) {
	resp, err := Render(RenderRequest{APIKeyMode: ModePlaceholder})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	markdown := manualBlockMarkdown(t, resp, "openai")
	for _, want := range []string{
		"`<your-proxy-base-url>/v1`",
		"Authorization: Bearer ${PROXY_API_KEY}",
		"- `<your-model-id>`",
	} {
		if !containsString(markdown, want) {
			t.Fatalf("placeholder markdown missing %q, got:\n%s", want, markdown)
		}
	}
}

func TestRenderManualConfigEmbedModeWithoutModelsNotesNoneSelected(t *testing.T) {
	resp, err := Render(RenderRequest{APIKeyMode: ModeEmbed, APIKey: "sk-test", BaseURL: "http://localhost:8317"})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	markdown := manualBlockMarkdown(t, resp, "openai")
	if !containsString(markdown, "_No models selected._") {
		t.Fatalf("expected no-models note, got:\n%s", markdown)
	}
}

func manualBlockMarkdown(t *testing.T, resp *RenderResponse, id string) string {
	t.Helper()
	for _, block := range resp.ManualConfig {
		if block.ID == id {
			if block.Markdown == "" {
				t.Fatalf("manual config block %q has empty markdown", id)
			}
			return block.Markdown
		}
	}
	t.Fatalf("manual config block %q not found", id)
	return ""
}

func containsWireAPI(content, value string) bool {
	return len(value) > 0 && containsString(content, `wire_api = "`+value+`"`)
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStringInner(s, substr))
}

func containsStringInner(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
