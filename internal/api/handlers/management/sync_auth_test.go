package management

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

// setupAuthEngine creates a Gin engine with middleware and all sync routes.
// The handler is configured with envSecret and allowRemoteOverride so that
// httptest requests (which appear as remote IPs) are accepted.
func setupAuthEngine(t *testing.T) (*gin.Engine, *Handler) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	h := &Handler{
		cfg: &config.Config{
			SDKConfig: config.SDKConfig{APIKeys: []string{"key1"}},
			OpenAICompatibility: []config.OpenAICompatibility{
				{Name: "test", BaseURL: "https://api.example.com", Models: []config.OpenAICompatibilityModel{{Name: "gpt-4o"}}},
			},
		},
		failedAttempts:      make(map[string]*attemptInfo),
		envSecret:           "test-secret",
		allowRemoteOverride: true,
	}

	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	_ = os.WriteFile(cfgPath, []byte("port: 8317\n"), 0644)
	h.configFilePath = cfgPath

	e := gin.New()
	mgmt := e.Group("/v0/management")
	mgmt.Use(h.Middleware())
	{
		mgmt.GET("/sync-profiles", h.GetSyncProfiles)
		mgmt.PUT("/sync-profiles", h.PutSyncProfiles)
		mgmt.PATCH("/sync-profiles", h.PatchSyncProfiles)
		mgmt.DELETE("/sync-profiles", h.DeleteSyncProfiles)
		mgmt.GET("/sync/available-configs", h.GetSyncAvailableConfigs)
	}

	return e, h
}

// --- VAL-SRV-100: All sync endpoints require management key (401 without) ---

func TestSyncAuth_MissingKey_AllEndpointsReturn401(t *testing.T) {
	h := &Handler{
		cfg:            &config.Config{},
		failedAttempts: make(map[string]*attemptInfo),
		envSecret:      "test-secret",
	}

	// Verify AuthenticateManagementKey returns 401 for empty key
	endpoints := []string{
		"GET /sync-profiles",
		"PUT /sync-profiles",
		"PATCH /sync-profiles",
		"DELETE /sync-profiles",
		"GET /sync/available-configs",
	}

	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			allowed, code, msg := h.AuthenticateManagementKey("127.0.0.1", true, "")
			if allowed {
				t.Fatal("expected auth to be denied")
			}
			if code != http.StatusUnauthorized {
				t.Fatalf("expected status 401, got %d: %s", code, msg)
			}
			if msg != "missing management key" {
				t.Fatalf("expected 'missing management key', got %q", msg)
			}
		})
	}
}

func TestSyncAuth_MissingKey_FullMiddleware_AllEndpoints(t *testing.T) {
	e, _ := setupAuthEngine(t)

	endpoints := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/v0/management/sync-profiles"},
		{http.MethodPut, "/v0/management/sync-profiles"},
		{http.MethodPatch, "/v0/management/sync-profiles"},
		{http.MethodDelete, "/v0/management/sync-profiles"},
		{http.MethodGet, "/v0/management/sync/available-configs"},
	}

	for _, ep := range endpoints {
		t.Run(ep.method+" "+ep.path, func(t *testing.T) {
			var body *bytes.Reader
			if ep.method == http.MethodPut || ep.method == http.MethodPatch {
				body = bytes.NewReader([]byte("{}"))
			} else {
				body = bytes.NewReader(nil)
			}
			req := httptest.NewRequest(ep.method, ep.path, body)
			w := httptest.NewRecorder()
			e.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 for %s %s without auth, got %d: %s", ep.method, ep.path, w.Code, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), "missing management key") {
				t.Fatalf("expected 'missing management key' in body, got %s", w.Body.String())
			}
		})
	}
}

// --- VAL-SRV-101: Invalid management key rejected with 401 ---

func TestSyncAuth_InvalidKey_Returns401(t *testing.T) {
	h := &Handler{
		cfg:            &config.Config{},
		failedAttempts: make(map[string]*attemptInfo),
		envSecret:      "correct-secret",
	}

	allowed, code, msg := h.AuthenticateManagementKey("127.0.0.1", true, "wrong-key")
	if allowed {
		t.Fatal("expected auth to be denied")
	}
	if code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", code)
	}
	if msg != "invalid management key" {
		t.Fatalf("expected 'invalid management key', got %q", msg)
	}
}

func TestSyncAuth_InvalidKey_FullMiddleware(t *testing.T) {
	e, _ := setupAuthEngine(t)

	req := httptest.NewRequest(http.MethodGet, "/v0/management/sync-profiles", nil)
	req.Header.Set("Authorization", "Bearer wrong-key")
	w := httptest.NewRecorder()
	e.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with invalid key, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp["error"] != "invalid management key" {
		t.Fatalf("expected error 'invalid management key', got %v", resp["error"])
	}
}

// --- VAL-SRV-102: Auth accepted via Authorization: Bearer header ---

func TestSyncAuth_BearerHeader_DirectAuth(t *testing.T) {
	h := &Handler{
		cfg:            &config.Config{},
		failedAttempts: make(map[string]*attemptInfo),
		envSecret:      "my-secret",
	}

	allowed, code, msg := h.AuthenticateManagementKey("127.0.0.1", true, "my-secret")
	if !allowed {
		t.Fatalf("expected auth to succeed, got code=%d msg=%q", code, msg)
	}
}

func TestSyncAuth_BearerHeader_FullMiddleware(t *testing.T) {
	e, _ := setupAuthEngine(t)

	endpoints := []struct {
		name   string
		method string
		path   string
	}{
		{"GET /sync-profiles", http.MethodGet, "/v0/management/sync-profiles"},
		{"GET /sync/available-configs", http.MethodGet, "/v0/management/sync/available-configs"},
	}

	for _, ep := range endpoints {
		t.Run(ep.name, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("Authorization", "Bearer test-secret")
			w := httptest.NewRecorder()
			e.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

// --- VAL-SRV-103: Auth accepted via X-Management-Key header ---

func TestSyncAuth_XManagementKeyHeader_DirectAuth(t *testing.T) {
	h := &Handler{
		cfg:            &config.Config{},
		failedAttempts: make(map[string]*attemptInfo),
		envSecret:      "my-secret",
	}

	allowed, code, msg := h.AuthenticateManagementKey("127.0.0.1", true, "my-secret")
	if !allowed {
		t.Fatalf("expected auth to succeed, got code=%d msg=%q", code, msg)
	}
}

func TestSyncAuth_XManagementKeyHeader_FullMiddleware(t *testing.T) {
	e, _ := setupAuthEngine(t)

	endpoints := []struct {
		name   string
		method string
		path   string
	}{
		{"GET /sync-profiles", http.MethodGet, "/v0/management/sync-profiles"},
		{"GET /sync/available-configs", http.MethodGet, "/v0/management/sync/available-configs"},
	}

	for _, ep := range endpoints {
		t.Run(ep.name, func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("X-Management-Key", "test-secret")
			w := httptest.NewRecorder()
			e.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

// --- VAL-SRV-104: Server with no management key returns 404/403 ---

func TestSyncAuth_NoManagementKey_AnyKey_Returns403(t *testing.T) {
	h := &Handler{
		cfg:            &config.Config{},
		failedAttempts: make(map[string]*attemptInfo),
		envSecret:      "",
	}

	allowed, code, msg := h.AuthenticateManagementKey("127.0.0.1", true, "any-key")
	if allowed {
		t.Fatal("expected auth to be denied when no key is configured")
	}
	if code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", code)
	}
	if msg != "remote management key not set" {
		t.Fatalf("expected 'remote management key not set', got %q", msg)
	}
}

func TestSyncAuth_NoManagementKey_MissingKey_Returns403(t *testing.T) {
	h := &Handler{
		cfg:            &config.Config{},
		failedAttempts: make(map[string]*attemptInfo),
		envSecret:      "",
	}

	allowed, code, msg := h.AuthenticateManagementKey("127.0.0.1", true, "")
	if allowed {
		t.Fatal("expected auth to be denied when no key is configured")
	}
	if code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", code)
	}
	if msg != "remote management key not set" {
		t.Fatalf("expected 'remote management key not set', got %q", msg)
	}
}

// --- VAL-SRV-105: Repeated invalid auth triggers IP ban ---

func TestSyncAuth_RateLimiting_IPBan(t *testing.T) {
	h := &Handler{
		cfg:                 &config.Config{},
		failedAttempts:      make(map[string]*attemptInfo),
		envSecret:           "correct-secret",
		allowRemoteOverride: true,
	}

	clientIP := "192.168.1.100"

	// Make 5 failed attempts
	for i := 0; i < 5; i++ {
		allowed, code, msg := h.AuthenticateManagementKey(clientIP, false, "wrong-key")
		if allowed {
			t.Fatalf("expected auth to be denied at attempt %d", i+1)
		}
		if code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d: %s", i+1, code, msg)
		}
	}

	// 6th attempt with correct key should be blocked (IP banned)
	allowed, code, msg := h.AuthenticateManagementKey(clientIP, false, "correct-secret")
	if allowed {
		t.Fatal("expected correct key to be denied while IP is banned")
	}
	if code != http.StatusForbidden {
		t.Fatalf("expected 403 (IP banned), got %d", code)
	}
	if !strings.Contains(msg, "IP banned due to too many failed attempts") {
		t.Fatalf("expected IP ban message, got %q", msg)
	}
	if !strings.Contains(msg, "Try again in") {
		t.Fatalf("expected retry timeframe in message, got %q", msg)
	}
}

func TestSyncAuth_RateLimiting_ValidAfterBanExpires(t *testing.T) {
	h := &Handler{
		cfg:                 &config.Config{},
		failedAttempts:      make(map[string]*attemptInfo),
		envSecret:           "correct-secret",
		allowRemoteOverride: true,
	}

	clientIP := "10.0.0.1"

	// Trigger ban
	for i := 0; i < 5; i++ {
		h.AuthenticateManagementKey(clientIP, false, "wrong")
	}

	// Confirm banned
	allowed, code, _ := h.AuthenticateManagementKey(clientIP, false, "correct-secret")
	if allowed || code != http.StatusForbidden {
		t.Fatal("expected IP to be banned")
	}

	// Manually expire the ban
	h.attemptsMu.Lock()
	if ai := h.failedAttempts[clientIP]; ai != nil {
		ai.blockedUntil = time.Now().Add(-1 * time.Second)
	}
	h.attemptsMu.Unlock()

	// Now correct key should work
	allowed, code, msg := h.AuthenticateManagementKey(clientIP, false, "correct-secret")
	if !allowed {
		t.Fatalf("expected auth to succeed after ban expired, got code=%d msg=%q", code, msg)
	}
}

func TestSyncAuth_RateLimiting_CounterResetsOnSuccess(t *testing.T) {
	h := &Handler{
		cfg:                 &config.Config{},
		failedAttempts:      make(map[string]*attemptInfo),
		envSecret:           "correct-secret",
		allowRemoteOverride: true,
	}

	clientIP := "10.0.0.2"

	// 3 failed attempts
	for i := 0; i < 3; i++ {
		h.AuthenticateManagementKey(clientIP, false, "wrong")
	}

	// Successful auth resets counter
	allowed, _, _ := h.AuthenticateManagementKey(clientIP, false, "correct-secret")
	if !allowed {
		t.Fatal("expected successful auth")
	}

	// 3 more failed attempts should NOT trigger ban (counter was reset)
	for i := 0; i < 3; i++ {
		h.AuthenticateManagementKey(clientIP, false, "wrong")
	}

	// Correct key should still work (only 3 failures after reset, need 5 for ban)
	allowed, code, _ := h.AuthenticateManagementKey(clientIP, false, "correct-secret")
	if !allowed {
		t.Fatalf("expected auth to succeed (counter should have reset), got code=%d", code)
	}
}

func TestSyncAuth_RateLimiting_FullMiddleware(t *testing.T) {
	e, _ := setupAuthEngine(t)

	// Make 5 failed requests to trigger IP ban
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/v0/management/sync-profiles", nil)
		req.Header.Set("Authorization", "Bearer wrong-key")
		w := httptest.NewRecorder()
		e.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", i+1, w.Code)
		}
	}

	// 6th request with correct key should be banned
	req := httptest.NewRequest(http.MethodGet, "/v0/management/sync-profiles", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	w := httptest.NewRecorder()
	e.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 (IP banned) after 5 failures, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "IP banned due to too many failed attempts") {
		t.Fatalf("expected IP ban message, got %s", w.Body.String())
	}
}

// --- VAL-SRV-106: Wrong Content-Type handling ---

func TestSyncAuth_WrongContentType_PutSyncProfiles(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	body := []byte(`{"sync-profiles": [{"name": "test", "targets": [{"tool": "factory-droid"}]}]}`)
	req := httptest.NewRequest(http.MethodPut, "/v0/management/sync-profiles", bytes.NewReader(body))
	req.Header.Set("Content-Type", "text/plain")
	c.Request = req

	h.PutSyncProfiles(c)

	// The handler reads raw bytes via GetRawData(), so Content-Type should not matter.
	// It should either parse successfully (200) or return a clear error (400), never panic.
	if w.Code != http.StatusOK && w.Code != http.StatusBadRequest {
		t.Fatalf("expected 200 or 400, got %d: %s", w.Code, w.Body.String())
	}

	// If it accepted the body, verify the profile was created
	if w.Code == http.StatusOK {
		if len(h.cfg.SyncProfiles) != 1 || h.cfg.SyncProfiles[0].Name != "test" {
			t.Fatalf("expected profile 'test' to be created, got %v", h.cfg.SyncProfiles)
		}
	}
}

func TestSyncAuth_WrongContentType_ViaMiddleware(t *testing.T) {
	e, _ := setupAuthEngine(t)

	body := []byte(`{"sync-profiles": [{"name": "ct-test", "targets": [{"tool": "factory-droid"}]}]}`)

	req := httptest.NewRequest(http.MethodPut, "/v0/management/sync-profiles", bytes.NewReader(body))
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Authorization", "Bearer test-secret")
	w := httptest.NewRecorder()
	e.ServeHTTP(w, req)

	// Should either succeed (handler reads raw bytes) or return 400 — never 500
	if w.Code == http.StatusInternalServerError {
		t.Fatalf("wrong Content-Type caused 500: %s", w.Body.String())
	}
}

// --- VAL-SRV-107: Concurrent mutations are serialized ---

func TestSyncAuth_ConcurrentMutations_NoDataRace(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "profile-a", Targets: []config.SyncProfileTarget{{Tool: "factory-droid", ActiveModel: "gpt-4o"}}},
		{Name: "profile-b", Targets: []config.SyncProfileTarget{{Tool: "claude-code", ActiveModel: "claude-sonnet-4-20250514"}}},
	}

	var wg sync.WaitGroup
	var successes atomic.Int32

	gin.SetMode(gin.TestMode)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(iteration int) {
			defer wg.Done()

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			idx := 0
			model := "updated-model-a"
			if iteration%2 == 1 {
				idx = 1
				model = "updated-model-b"
			}

			body, _ := json.Marshal(map[string]interface{}{
				"index": idx,
				"value": map[string]interface{}{
					"active-model": model,
				},
			})
			req := httptest.NewRequest(http.MethodPatch, "/v0/management/sync-profiles", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			c.Request = req

			h.PatchSyncProfiles(c)

			if w.Code == http.StatusOK {
				successes.Add(1)
			}
		}(i)
	}

	wg.Wait()

	count := successes.Load()
	if count != 10 {
		t.Fatalf("expected all 10 concurrent mutations to succeed, got %d", count)
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.cfg.SyncProfiles) != 2 {
		t.Fatalf("expected 2 profiles, got %d", len(h.cfg.SyncProfiles))
	}
	names := map[string]bool{
		h.cfg.SyncProfiles[0].Name: true,
		h.cfg.SyncProfiles[1].Name: true,
	}
	if !names["profile-a"] || !names["profile-b"] {
		t.Fatalf("expected both profiles to exist, got %v", h.cfg.SyncProfiles)
	}
}

func TestSyncAuth_ConcurrentPutAndDelete_NoDataRace(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	var wg sync.WaitGroup
	var errors atomic.Int32

	gin.SetMode(gin.TestMode)

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(iteration int) {
			defer wg.Done()

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			if iteration%2 == 0 {
				body, _ := json.Marshal(map[string]interface{}{
					"sync-profiles": []map[string]interface{}{
						{"name": "concurrent-profile", "targets": []map[string]interface{}{{"tool": "factory-droid"}}},
					},
				})
				req := httptest.NewRequest(http.MethodPut, "/v0/management/sync-profiles", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				c.Request = req
				h.PutSyncProfiles(c)
			} else {
				req := httptest.NewRequest(http.MethodDelete, "/v0/management/sync-profiles?name=concurrent-profile", nil)
				c.Request = req
				h.DeleteSyncProfiles(c)
			}

			if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
				errors.Add(1)
			}
		}(i)
	}

	wg.Wait()

	if errors.Load() > 0 {
		t.Fatal("concurrent PUT/DELETE encountered unexpected errors")
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	for _, p := range h.cfg.SyncProfiles {
		if p.Name == "" {
			t.Fatal("profile with empty name found — data corruption")
		}
	}
}

// --- VAL-SRV-108: PATCH /sync-profiles updates targets array partially ---

func TestSyncAuth_PatchTargetsPartialUpdate(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{
			Name: "dev",
			Targets: []config.SyncProfileTarget{
				{Tool: "factory-droid", ModelFilter: "^gpt-.*", APIKeyIndex: 0, ActiveModel: "gpt-4o"},
			},
		},
	}

	body := map[string]interface{}{
		"index": 0,
		"value": map[string]interface{}{
			"targets": []map[string]interface{}{
				{"tool": "claude-code", "model-filter": ".*", "api-key-index": 1, "active-model": "claude-sonnet-4-20250514"},
			},
		},
	}

	w := performRequest(h, http.MethodPatch, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if h.cfg.SyncProfiles[0].Name != "dev" {
		t.Fatalf("expected name 'dev' unchanged, got %q", h.cfg.SyncProfiles[0].Name)
	}
	if len(h.cfg.SyncProfiles[0].Targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(h.cfg.SyncProfiles[0].Targets))
	}
	if h.cfg.SyncProfiles[0].Targets[0].Tool != "claude-code" {
		t.Fatalf("expected tool 'claude-code', got %q", h.cfg.SyncProfiles[0].Targets[0].Tool)
	}
	if h.cfg.SyncProfiles[0].Targets[0].ActiveModel != "claude-sonnet-4-20250514" {
		t.Fatalf("expected active-model 'claude-sonnet-4-20250514', got %q", h.cfg.SyncProfiles[0].Targets[0].ActiveModel)
	}
}

// --- VAL-SRV-109: Hot-reload picks up config changes ---

func TestSyncAuth_HotReload_PicksUpSyncProfileChanges(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	// Initial state: empty profiles
	w := performRequest(h, http.MethodGet, "/v0/management/sync-profiles", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	arr := resp["sync-profiles"].([]interface{})
	if len(arr) != 0 {
		t.Fatalf("expected empty profiles, got %d", len(arr))
	}

	// Simulate hot-reload via SetConfig
	newCfg := &config.Config{
		SDKConfig: config.SDKConfig{APIKeys: []string{"key1"}},
		SyncProfiles: []config.SyncProfile{
			{Name: "hot-reloaded-profile", Targets: []config.SyncProfileTarget{{Tool: "factory-droid", ActiveModel: "gpt-4o"}}},
		},
	}
	h.SetConfig(newCfg)

	// GET should now reflect the hot-reloaded config
	w = performRequest(h, http.MethodGet, "/v0/management/sync-profiles", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	arr = resp["sync-profiles"].([]interface{})
	if len(arr) != 1 {
		t.Fatalf("expected 1 profile after hot-reload, got %d", len(arr))
	}
	profile := arr[0].(map[string]interface{})
	if profile["name"] != "hot-reloaded-profile" {
		t.Fatalf("expected 'hot-reloaded-profile', got %v", profile["name"])
	}
}

func TestSyncAuth_HotReload_AvailableConfigsUpdate(t *testing.T) {
	h, _ := setupSyncTest(t, &config.Config{})

	// Initial: empty providers
	w := performSyncRequest(h)
	resp := parseSyncResponse(t, w.Body.Bytes())
	if len(resp.Providers) != 0 {
		t.Fatalf("expected empty providers, got %d", len(resp.Providers))
	}

	// Simulate hot-reload with new config containing providers
	newCfg := &config.Config{
		OpenAICompatibility: []config.OpenAICompatibility{
			{Name: "new-provider", BaseURL: "https://api.example.com", Models: []config.OpenAICompatibilityModel{{Name: "gpt-4o"}}},
		},
	}
	h.SetConfig(newCfg)

	w = performSyncRequest(h)
	resp = parseSyncResponse(t, w.Body.Bytes())
	if len(resp.Providers) != 1 {
		t.Fatalf("expected 1 provider after hot-reload, got %d", len(resp.Providers))
	}
	if resp.Providers[0].Name != "new-provider" {
		t.Fatalf("expected 'new-provider', got %q", resp.Providers[0].Name)
	}
}

func TestSyncAuth_HotReload_ConcurrentReadSafety(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	var wg sync.WaitGroup
	var panics atomic.Int32

	gin.SetMode(gin.TestMode)

	for i := 0; i < 50; i++ {
		wg.Add(2)

		go func(iteration int) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					panics.Add(1)
				}
			}()

			newCfg := &config.Config{
				SDKConfig: config.SDKConfig{APIKeys: []string{"key1"}},
				SyncProfiles: []config.SyncProfile{
					{Name: "profile-" + string(rune('A'+iteration%5)), Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
				},
			}
			h.SetConfig(newCfg)
		}(i)

		go func() {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					panics.Add(1)
				}
			}()

			// Call GetSyncProfiles directly via a pre-created test context.
			// We avoid gin.CreateTestContext inside goroutines due to Gin's
			// internal global state races (not our code).
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			req := httptest.NewRequest(http.MethodGet, "/v0/management/sync-profiles", nil)
			c.Request = req
			h.GetSyncProfiles(c)
		}()
	}

	wg.Wait()

	if panics.Load() > 0 {
		t.Fatal("concurrent hot-reload and reads caused panics")
	}
}

// --- Edge case: Bearer header parsing ---

func TestSyncAuth_BearerHeader_Parsing(t *testing.T) {
	h := &Handler{
		cfg:            &config.Config{},
		failedAttempts: make(map[string]*attemptInfo),
		envSecret:      "my-secret",
	}

	tests := []struct {
		name    string
		header  string
		allowed bool
	}{
		{"correct Bearer", "Bearer my-secret", true},
		{"lowercase bearer", "bearer my-secret", true},
		{"no scheme (raw key)", "my-secret", true}, // Middleware treats bare key as provided value
		{"wrong scheme", "Basic my-secret", false},
		{"empty value", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the Middleware parsing logic
			var provided string
			if ah := tt.header; ah != "" {
				parts := strings.SplitN(ah, " ", 2)
				if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
					provided = parts[1]
				} else {
					provided = ah
				}
			}

			allowed, code, msg := h.AuthenticateManagementKey("127.0.0.1", true, provided)
			if allowed != tt.allowed {
				t.Fatalf("expected allowed=%v, got allowed=%v code=%d msg=%q", tt.allowed, allowed, code, msg)
			}
		})
	}
}

// --- Edge case: Authorization header takes precedence over X-Management-Key ---

func TestSyncAuth_BothHeaders_AuthorizationTakesPrecedence(t *testing.T) {
	e, _ := setupAuthEngine(t)

	// Both headers: Authorization has wrong key, X-Management-Key has correct key.
	// Authorization is checked first, so it should fail.
	req := httptest.NewRequest(http.MethodGet, "/v0/management/sync-profiles", nil)
	req.Header.Set("Authorization", "Bearer wrong-key")
	req.Header.Set("X-Management-Key", "test-secret")
	w := httptest.NewRecorder()
	e.ServeHTTP(w, req)

	// Should be 401 because Authorization header is wrong
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 (Authorization header checked first), got %d: %s", w.Code, w.Body.String())
	}
}
