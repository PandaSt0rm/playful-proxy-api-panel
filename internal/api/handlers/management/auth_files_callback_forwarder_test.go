package management

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCallbackForwarderHandlesPrivateNetworkPreflight(t *testing.T) {
	withIsolatedOAuthSessions(t)

	handler := newCallbackForwarderHandler("xai", t.TempDir())
	req := httptest.NewRequest(http.MethodOptions, "/callback", nil)
	req.Header.Set("Origin", "https://accounts.x.ai")
	req.Header.Set("Access-Control-Request-Private-Network", "true")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d: %s", http.StatusNoContent, rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://accounts.x.ai" {
		t.Fatalf("Access-Control-Allow-Origin = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Private-Network"); got != "true" {
		t.Fatalf("Access-Control-Allow-Private-Network = %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, http.MethodGet) || !strings.Contains(got, http.MethodOptions) {
		t.Fatalf("Access-Control-Allow-Methods = %q", got)
	}
}

func TestCallbackForwarderPersistsCallbackWithoutRedirect(t *testing.T) {
	withIsolatedOAuthSessions(t)

	authDir := t.TempDir()
	state := "state-forwarder"
	code := "code-forwarder"
	RegisterOAuthSession(state, "xai")

	handler := newCallbackForwarderHandler("xai", authDir)
	req := httptest.NewRequest(http.MethodGet, "/callback?state="+url.QueryEscape(state)+"&code="+url.QueryEscape(code), nil)
	req.Header.Set("Origin", "https://accounts.x.ai")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if location := rec.Header().Get("Location"); location != "" {
		t.Fatalf("Location = %q, want no redirect", location)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://accounts.x.ai" {
		t.Fatalf("Access-Control-Allow-Origin = %q", got)
	}

	data, err := os.ReadFile(filepath.Join(authDir, ".oauth-xai-state-forwarder.oauth"))
	if err != nil {
		t.Fatalf("expected callback file to be written: %v", err)
	}
	var payload oauthCallbackFilePayload
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("failed to unmarshal callback payload: %v", err)
	}
	if payload.State != state {
		t.Fatalf("State = %q, want %q", payload.State, state)
	}
	if payload.Code != code {
		t.Fatalf("Code = %q, want %q", payload.Code, code)
	}
}
