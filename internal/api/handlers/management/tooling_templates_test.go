package management

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

func TestRenderToolingTemplatesResolvesAPIKeyIndex(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &Handler{
		cfg: &config.Config{
			SDKConfig: config.SDKConfig{APIKeys: []string{"sk-real"}},
			Host:      "127.0.0.1",
			Port:      8317,
		},
	}
	router := gin.New()
	router.POST("/render", handler.RenderToolingTemplates)

	body := []byte(`{"api_key_mode":"embed","api_key_index":0,"models":["go/deepseek-v4-pro"],"template_ids":["factory-droid"]}`)
	req := httptest.NewRequest(http.MethodPost, "/render", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Templates []struct {
			Content string `json:"content"`
		} `json:"templates"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Templates) != 1 {
		t.Fatalf("expected one template, got %d", len(resp.Templates))
	}
	if !bytes.Contains([]byte(resp.Templates[0].Content), []byte(`"apiKey": "sk-real"`)) {
		t.Fatalf("template did not include resolved API key: %s", resp.Templates[0].Content)
	}
	if !bytes.Contains([]byte(resp.Templates[0].Content), []byte(`"baseUrl": "http://127.0.0.1:8317/v1"`)) {
		t.Fatalf("template did not use config-derived base URL: %s", resp.Templates[0].Content)
	}
}

func TestRenderToolingTemplatesRejectsMissingAPIKeyIndex(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &Handler{cfg: &config.Config{SDKConfig: config.SDKConfig{APIKeys: []string{"sk-real"}}}}
	router := gin.New()
	router.POST("/render", handler.RenderToolingTemplates)

	req := httptest.NewRequest(http.MethodPost, "/render", bytes.NewReader([]byte(`{"api_key_mode":"embed","api_key_index":2}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
