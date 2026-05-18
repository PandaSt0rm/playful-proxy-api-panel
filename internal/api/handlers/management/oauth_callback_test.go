package management

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

func TestPostOAuthCallbackAcceptsManualCodeWithState(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withIsolatedOAuthSessions(t)

	authDir := t.TempDir()
	state := "state-1"
	code := "zzYoDQwjatikCDdwEb0SPL3TciB0W0ST-E4fNNZLg5HuFn7uNTXHDwyYVNT_8E1Mf7ut0aYghD7FkSWGoXz5Yg"
	RegisterOAuthSession(state, "xai")

	h := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: authDir}, nil)
	rec := postOAuthCallbackForTest(t, h, oauthCallbackRequest{
		Provider:    "xai",
		RedirectURL: code,
		State:       state,
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	payloadPath := filepath.Join(authDir, ".oauth-xai-state-1.oauth")
	data, err := os.ReadFile(payloadPath)
	if err != nil {
		t.Fatalf("expected callback file to be written: %v", err)
	}

	var payload oauthCallbackFilePayload
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("failed to unmarshal callback payload: %v", err)
	}
	if payload.Code != code {
		t.Fatalf("Code = %q, want %q", payload.Code, code)
	}
	if payload.State != state {
		t.Fatalf("State = %q, want %q", payload.State, state)
	}
}

func TestPostOAuthCallbackRejectsAuthorizationURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withIsolatedOAuthSessions(t)

	state := "state-2"
	RegisterOAuthSession(state, "xai")
	h := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: t.TempDir()}, nil)

	rec := postOAuthCallbackForTest(t, h, oauthCallbackRequest{
		Provider:    "xai",
		RedirectURL: "https://accounts.x.ai/oauth2/consent?response_type=code&client_id=client-1&redirect_uri=http%3A%2F%2F127.0.0.1%3A56121%2Fcallback&scope=openid&state=state-2&code_challenge=challenge-1&code_challenge_method=S256",
	})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "authorization URL") {
		t.Fatalf("response body = %q, want authorization URL hint", rec.Body.String())
	}
}

func withIsolatedOAuthSessions(t *testing.T) {
	t.Helper()
	previous := oauthSessions
	oauthSessions = newOAuthSessionStore(oauthSessionTTL)
	t.Cleanup(func() {
		oauthSessions = previous
	})
}

func postOAuthCallbackForTest(t *testing.T, h *Handler, req oauthCallbackRequest) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal request: %v", err)
	}

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v0/management/oauth-callback", bytes.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	h.PostOAuthCallback(ctx)
	return rec
}
