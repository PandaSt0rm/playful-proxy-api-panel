package management

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

func setupUpstreamConcurrencyTest(t *testing.T, cfg *config.Config) *Handler {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(path, []byte("{}\n"), 0o600); err != nil {
		t.Fatalf("failed to write test config: %v", err)
	}
	return NewHandler(cfg, path, nil)
}

func performUpstreamConcurrencyRequest(
	t *testing.T,
	h *Handler,
	method string,
	path string,
	provider string,
	body any,
) *httptest.ResponseRecorder {
	t.Helper()

	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal body: %v", err)
		}
	}

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	reqBody := bytes.NewReader(bodyBytes)
	ctx.Request = httptest.NewRequest(method, path, reqBody)
	if body != nil {
		ctx.Request.Header.Set("Content-Type", "application/json")
	}
	if provider != "" {
		ctx.Params = gin.Params{{Key: "provider", Value: provider}}
	}

	switch {
	case method == http.MethodGet:
		h.GetUpstreamConcurrency(ctx)
	case method == http.MethodPut && provider == "":
		h.PutUpstreamConcurrency(ctx)
	case method == http.MethodPatch && provider == "":
		h.PatchUpstreamConcurrency(ctx)
	case (method == http.MethodPut || method == http.MethodPatch) && provider != "":
		h.PutUpstreamConcurrencyProvider(ctx)
	case method == http.MethodDelete:
		h.DeleteUpstreamConcurrencyProvider(ctx)
	default:
		t.Fatalf("unsupported test route: %s %s", method, path)
	}

	return rec
}

func TestGetUpstreamConcurrency_NormalizesResponse(t *testing.T) {
	h := setupUpstreamConcurrencyTest(t, &config.Config{
		UpstreamConcurrency: config.UpstreamConcurrencyConfig{
			Default:             -1,
			QueueTimeoutSeconds: -5,
			Providers: map[string]int{
				" Codex ": 2,
				"claude":  -3,
				"":        4,
			},
		},
	})

	rec := performUpstreamConcurrencyRequest(t, h, http.MethodGet, "/v0/management/upstream-concurrency", "", nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp struct {
		Value config.UpstreamConcurrencyConfig `json:"upstream-concurrency"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Value.Default != 0 {
		t.Fatalf("default = %d, want 0", resp.Value.Default)
	}
	if resp.Value.QueueTimeoutSeconds != 0 {
		t.Fatalf("queue-timeout-seconds = %d, want 0", resp.Value.QueueTimeoutSeconds)
	}
	if got := resp.Value.Providers["codex"]; got != 2 {
		t.Fatalf("providers[codex] = %d, want 2", got)
	}
	if got := resp.Value.Providers["claude"]; got != 0 {
		t.Fatalf("providers[claude] = %d, want 0", got)
	}
	if _, ok := resp.Value.Providers[""]; ok {
		t.Fatal("blank provider key should be omitted")
	}
}

func TestPutUpstreamConcurrency_ReplacesAndNormalizesConfig(t *testing.T) {
	h := setupUpstreamConcurrencyTest(t, &config.Config{
		UpstreamConcurrency: config.UpstreamConcurrencyConfig{
			Default:             8,
			QueueTimeoutSeconds: 30,
			Providers:           map[string]int{"gemini": 3},
		},
	})

	rec := performUpstreamConcurrencyRequest(
		t,
		h,
		http.MethodPut,
		"/v0/management/upstream-concurrency",
		"",
		map[string]any{
			"default":               -1,
			"queue-timeout-seconds": -2,
			"providers": map[string]int{
				" Codex ": 2,
				"claude":  -3,
			},
		},
	)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if h.cfg.UpstreamConcurrency.Default != 0 {
		t.Fatalf("default = %d, want 0", h.cfg.UpstreamConcurrency.Default)
	}
	if h.cfg.UpstreamConcurrency.QueueTimeoutSeconds != 0 {
		t.Fatalf("queue-timeout-seconds = %d, want 0", h.cfg.UpstreamConcurrency.QueueTimeoutSeconds)
	}
	if got := h.cfg.UpstreamConcurrency.Providers["codex"]; got != 2 {
		t.Fatalf("providers[codex] = %d, want 2", got)
	}
	if got := h.cfg.UpstreamConcurrency.Providers["claude"]; got != 0 {
		t.Fatalf("providers[claude] = %d, want 0", got)
	}
	if _, ok := h.cfg.UpstreamConcurrency.Providers["gemini"]; ok {
		t.Fatal("PUT should replace stale provider limits")
	}
}

func TestPatchUpstreamConcurrency_PreservesOmittedFields(t *testing.T) {
	h := setupUpstreamConcurrencyTest(t, &config.Config{
		UpstreamConcurrency: config.UpstreamConcurrencyConfig{
			Default:             8,
			QueueTimeoutSeconds: 30,
			Providers:           map[string]int{"codex": 2},
		},
	})

	rec := performUpstreamConcurrencyRequest(
		t,
		h,
		http.MethodPatch,
		"/v0/management/upstream-concurrency",
		"",
		map[string]any{"queueTimeoutSeconds": 5},
	)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if h.cfg.UpstreamConcurrency.Default != 8 {
		t.Fatalf("default = %d, want 8", h.cfg.UpstreamConcurrency.Default)
	}
	if h.cfg.UpstreamConcurrency.QueueTimeoutSeconds != 5 {
		t.Fatalf("queue-timeout-seconds = %d, want 5", h.cfg.UpstreamConcurrency.QueueTimeoutSeconds)
	}
	if got := h.cfg.UpstreamConcurrency.Providers["codex"]; got != 2 {
		t.Fatalf("providers[codex] = %d, want 2", got)
	}
}

func TestUpstreamConcurrencyProviderOverride_SetZeroAndDelete(t *testing.T) {
	h := setupUpstreamConcurrencyTest(t, &config.Config{
		UpstreamConcurrency: config.UpstreamConcurrencyConfig{Default: 8},
	})

	rec := performUpstreamConcurrencyRequest(
		t,
		h,
		http.MethodPut,
		"/v0/management/upstream-concurrency/providers/claude",
		"Claude",
		map[string]int{"limit": 0},
	)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if got, ok := h.cfg.UpstreamConcurrency.Providers["claude"]; !ok || got != 0 {
		t.Fatalf("providers[claude] = %d, %v; want explicit 0", got, ok)
	}

	rec = performUpstreamConcurrencyRequest(
		t,
		h,
		http.MethodDelete,
		"/v0/management/upstream-concurrency/providers/claude",
		"claude",
		nil,
	)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if h.cfg.UpstreamConcurrency.Providers != nil {
		t.Fatalf("providers = %#v, want nil after deleting final override", h.cfg.UpstreamConcurrency.Providers)
	}
}
