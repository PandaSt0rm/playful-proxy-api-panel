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

// setupSyncStateTest creates a handler whose default sync-state path lands in
// a temp directory (next to the temp config file).
func setupSyncStateTest(t *testing.T) (*Handler, string) {
	t.Helper()
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte("port: 8317\n"), 0644); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}
	cfg := &config.Config{}
	h := NewHandler(cfg, cfgPath, nil)
	return h, filepath.Join(dir, "sync-state.json")
}

// performSyncStateRequest dispatches to the sync-state handlers.
func performSyncStateRequest(h *Handler, method string, body interface{}) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			panic(err)
		}
	}
	req := httptest.NewRequest(method, "/v0/management/sync/state", bytes.NewReader(bodyBytes))
	if bodyBytes != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	c.Request = req

	switch method {
	case http.MethodGet:
		h.GetSyncState(c)
	case http.MethodPost:
		h.PostSyncState(c)
	}
	return w
}

func TestPostSyncState_RecordsReport(t *testing.T) {
	h, statePath := setupSyncStateTest(t)

	w := performSyncStateRequest(h, http.MethodPost, map[string]interface{}{
		"hostname": "devbox",
		"profile":  "default",
		"tools": []map[string]interface{}{
			{"tool": "factory-droid", "status": "synced", "config_hash": "abc123"},
			{"tool": "codex", "status": "error", "error": "permission denied"},
		},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("POST status = %d, body = %s", w.Code, w.Body.String())
	}

	// State persists to the default path next to config.yaml.
	if _, err := os.Stat(statePath); err != nil {
		t.Fatalf("expected state file at %s: %v", statePath, err)
	}

	// GET returns the merged state.
	w = performSyncStateRequest(h, http.MethodGet, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET status = %d", w.Code)
	}
	var resp struct {
		Hosts map[string]struct {
			Profile string `json:"profile"`
			Tools   map[string]struct {
				Status string `json:"status"`
				Error  string `json:"error"`
			} `json:"tools"`
		} `json:"hosts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode GET response: %v", err)
	}
	host, ok := resp.Hosts["devbox"]
	if !ok {
		t.Fatalf("missing host entry: %s", w.Body.String())
	}
	if host.Profile != "default" {
		t.Errorf("profile = %q", host.Profile)
	}
	if got := host.Tools["factory-droid"].Status; got != "synced" {
		t.Errorf("factory-droid status = %q", got)
	}
	if got := host.Tools["codex"].Error; got != "permission denied" {
		t.Errorf("codex error = %q", got)
	}
}

func TestPostSyncState_ValidatesInput(t *testing.T) {
	h, _ := setupSyncStateTest(t)

	cases := []struct {
		name string
		body map[string]interface{}
	}{
		{"missing hostname", map[string]interface{}{
			"tools": []map[string]interface{}{{"tool": "codex", "status": "synced"}},
		}},
		{"empty tools", map[string]interface{}{
			"hostname": "devbox",
			"tools":    []map[string]interface{}{},
		}},
		{"unknown tool", map[string]interface{}{
			"hostname": "devbox",
			"tools":    []map[string]interface{}{{"tool": "not-a-tool", "status": "synced"}},
		}},
		{"invalid status", map[string]interface{}{
			"hostname": "devbox",
			"tools":    []map[string]interface{}{{"tool": "codex", "status": "outdated"}},
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := performSyncStateRequest(h, http.MethodPost, tc.body)
			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400; body = %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestPostSyncState_SingleToolReportPreservesOthers(t *testing.T) {
	h, _ := setupSyncStateTest(t)

	w := performSyncStateRequest(h, http.MethodPost, map[string]interface{}{
		"hostname": "devbox",
		"profile":  "default",
		"tools": []map[string]interface{}{
			{"tool": "factory-droid", "status": "synced"},
			{"tool": "codex", "status": "synced"},
		},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("first POST = %d", w.Code)
	}

	w = performSyncStateRequest(h, http.MethodPost, map[string]interface{}{
		"hostname": "devbox",
		"tools": []map[string]interface{}{
			{"tool": "factory-droid", "status": "conflict", "error": "hash mismatch"},
		},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("second POST = %d", w.Code)
	}

	w = performSyncStateRequest(h, http.MethodGet, nil)
	var resp struct {
		Hosts map[string]struct {
			Profile string `json:"profile"`
			Tools   map[string]struct {
				Status string `json:"status"`
			} `json:"tools"`
		} `json:"hosts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	host := resp.Hosts["devbox"]
	if got := host.Tools["codex"].Status; got != "synced" {
		t.Errorf("codex status lost: %q", got)
	}
	if got := host.Tools["factory-droid"].Status; got != "conflict" {
		t.Errorf("factory-droid status = %q", got)
	}
	if host.Profile != "default" {
		t.Errorf("profile dropped on partial report: %q", host.Profile)
	}
}

func TestGetSyncState_EmptyByDefault(t *testing.T) {
	h, _ := setupSyncStateTest(t)

	w := performSyncStateRequest(h, http.MethodGet, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET status = %d", w.Code)
	}
	var resp struct {
		Hosts map[string]interface{} `json:"hosts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Hosts) != 0 {
		t.Errorf("expected empty hosts, got %v", resp.Hosts)
	}
}

func TestGetSyncStateStore_HonorsConfiguredPath(t *testing.T) {
	h, _ := setupSyncStateTest(t)
	custom := filepath.Join(t.TempDir(), "custom-state.json")

	h.mu.Lock()
	h.cfg.SyncStatePath = custom
	h.mu.Unlock()

	w := performSyncStateRequest(h, http.MethodPost, map[string]interface{}{
		"hostname": "devbox",
		"tools":    []map[string]interface{}{{"tool": "aider", "status": "synced"}},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("POST = %d", w.Code)
	}
	if _, err := os.Stat(custom); err != nil {
		t.Fatalf("expected state at configured path %s: %v", custom, err)
	}
}
