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
