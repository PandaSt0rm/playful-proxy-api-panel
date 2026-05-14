package management

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

// setupSyncProfilesTest creates a handler with a temp config file for testing.
func setupSyncProfilesTest(t *testing.T) (*Handler, string) {
	t.Helper()
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	// Write a minimal config so SaveConfigPreserveComments has a file to read comments from.
	if err := os.WriteFile(cfgPath, []byte("port: 8317\n"), 0644); err != nil {
		t.Fatalf("failed to write config: %v", err)
	}
	cfg := &config.Config{
		SDKConfig: config.SDKConfig{
			APIKeys: []string{"key1", "key2"},
		},
	}
	h := NewHandler(cfg, cfgPath, nil)
	return h, cfgPath
}

// performRequest creates a test request against the handler with the given body.
func performRequest(h *Handler, method, path string, body interface{}) *httptest.ResponseRecorder {
	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			panic(fmt.Sprintf("failed to marshal body: %v", err))
		}
	}
	return performRequestRaw(h, method, path, bodyBytes)
}

func performRequestRaw(h *Handler, method, path string, rawBody []byte) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	var bodyReader *bytes.Reader
	if rawBody != nil {
		bodyReader = bytes.NewReader(rawBody)
	} else {
		bodyReader = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, bodyReader)
	if rawBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	c.Request = req

	switch method {
	case http.MethodGet:
		h.GetSyncProfiles(c)
	case http.MethodPut:
		h.PutSyncProfiles(c)
	case http.MethodPatch:
		h.PatchSyncProfiles(c)
	case http.MethodDelete:
		h.DeleteSyncProfiles(c)
	}

	return w
}

// --- GET tests ---

func TestGetSyncProfiles_Empty(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	w := performRequest(h, http.MethodGet, "/v0/management/sync-profiles", nil)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	profiles, ok := resp["sync-profiles"]
	if !ok {
		t.Fatal("expected 'sync-profiles' key in response")
	}
	arr, ok := profiles.([]interface{})
	if !ok {
		t.Fatalf("expected 'sync-profiles' to be an array, got %T", profiles)
	}
	if len(arr) != 0 {
		t.Fatalf("expected empty array, got %d items", len(arr))
	}
}

func TestGetSyncProfiles_ReturnsConfigured(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{
			Name: "dev",
			Targets: []config.SyncProfileTarget{
				{Tool: "factory-droid", ModelFilter: "^gpt-.*", APIKeyIndex: 0, ActiveModel: "gpt-4o"},
				{Tool: "claude-code", APIKeyIndex: 1, ActiveModel: "claude-sonnet-4-20250514"},
			},
		},
	}

	w := performRequest(h, http.MethodGet, "/v0/management/sync-profiles", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	var profiles []config.SyncProfile
	if err := json.Unmarshal(resp["sync-profiles"], &profiles); err != nil {
		t.Fatalf("failed to parse sync-profiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(profiles))
	}
	if profiles[0].Name != "dev" {
		t.Fatalf("expected profile name 'dev', got %q", profiles[0].Name)
	}
	if len(profiles[0].Targets) != 2 {
		t.Fatalf("expected 2 targets, got %d", len(profiles[0].Targets))
	}
	if profiles[0].Targets[0].Tool != "factory-droid" {
		t.Fatalf("expected target tool 'factory-droid', got %q", profiles[0].Targets[0].Tool)
	}
	if profiles[0].Targets[0].ModelFilter != "^gpt-.*" {
		t.Fatalf("expected model-filter '^gpt-.*', got %q", profiles[0].Targets[0].ModelFilter)
	}
	if profiles[0].Targets[0].APIKeyIndex != 0 {
		t.Fatalf("expected api-key-index 0, got %d", profiles[0].Targets[0].APIKeyIndex)
	}
	if profiles[0].Targets[0].ActiveModel != "gpt-4o" {
		t.Fatalf("expected active-model 'gpt-4o', got %q", profiles[0].Targets[0].ActiveModel)
	}
}

// --- PUT tests ---

func TestPutSyncProfiles_Create(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	body := map[string]interface{}{
		"sync-profiles": []map[string]interface{}{
			{
				"name": "staging",
				"targets": []map[string]interface{}{
					{"tool": "factory-droid", "model-filter": "^gpt-.*", "api-key-index": 0, "active-model": "gpt-4o"},
				},
			},
		},
	}

	w := performRequest(h, http.MethodPut, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Fatalf("expected status 'ok', got %v", resp["status"])
	}

	// Verify in-memory config
	if len(h.cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(h.cfg.SyncProfiles))
	}
	if h.cfg.SyncProfiles[0].Name != "staging" {
		t.Fatalf("expected profile name 'staging', got %q", h.cfg.SyncProfiles[0].Name)
	}
}

func TestPutSyncProfiles_EmptyArray(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "old", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	body := map[string]interface{}{
		"sync-profiles": []interface{}{},
	}

	w := performRequest(h, http.MethodPut, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	if len(h.cfg.SyncProfiles) != 0 {
		t.Fatalf("expected 0 profiles, got %d", len(h.cfg.SyncProfiles))
	}
}

func TestPutSyncProfiles_ValidationRejectsEmptyName(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	body := map[string]interface{}{
		"sync-profiles": []map[string]interface{}{
			{"name": "", "targets": []map[string]interface{}{{"tool": "factory-droid"}}},
		},
	}

	w := performRequest(h, http.MethodPut, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPutSyncProfiles_ValidationRejectsInvalidTool(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	body := map[string]interface{}{
		"sync-profiles": []map[string]interface{}{
			{"name": "test", "targets": []map[string]interface{}{{"tool": "invalid-tool-type"}}},
		},
	}

	w := performRequest(h, http.MethodPut, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPutSyncProfiles_ValidationRejectsDuplicateNames(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	body := map[string]interface{}{
		"sync-profiles": []map[string]interface{}{
			{"name": "same", "targets": []map[string]interface{}{{"tool": "factory-droid"}}},
			{"name": "same", "targets": []map[string]interface{}{{"tool": "claude-code"}}},
		},
	}

	w := performRequest(h, http.MethodPut, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPutSyncProfiles_EmptyTargetsAccepted(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	body := map[string]interface{}{
		"sync-profiles": []map[string]interface{}{
			{"name": "placeholder", "targets": []interface{}{}},
		},
	}

	w := performRequest(h, http.MethodPut, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPutSyncProfiles_MalformedJSON(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	w := performRequestRaw(h, http.MethodPut, "/v0/management/sync-profiles", []byte("{invalid json"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

// --- PATCH tests ---

func TestPatchSyncProfiles_ByIndex(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid", ActiveModel: "gpt-4o"}}},
	}

	body := map[string]interface{}{
		"index": 0,
		"value": map[string]interface{}{
			"active-model": "o3",
		},
	}

	w := performRequest(h, http.MethodPatch, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify only active-model changed on the first target
	if h.cfg.SyncProfiles[0].Targets[0].ActiveModel != "o3" {
		t.Fatalf("expected active-model 'o3', got %q", h.cfg.SyncProfiles[0].Targets[0].ActiveModel)
	}
	if h.cfg.SyncProfiles[0].Name != "dev" {
		t.Fatalf("expected name 'dev' unchanged, got %q", h.cfg.SyncProfiles[0].Name)
	}
	if h.cfg.SyncProfiles[0].Targets[0].Tool != "factory-droid" {
		t.Fatalf("expected tool 'factory-droid' unchanged, got %q", h.cfg.SyncProfiles[0].Targets[0].Tool)
	}
}

func TestPatchSyncProfiles_ByName(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid", ActiveModel: "gpt-4o"}}},
		{Name: "prod", Targets: []config.SyncProfileTarget{{Tool: "claude-code", ActiveModel: "claude-sonnet-4-20250514"}}},
	}

	body := map[string]interface{}{
		"match": "prod",
		"value": map[string]interface{}{
			"active-model": "claude-opus-4-20250514",
		},
	}

	w := performRequest(h, http.MethodPatch, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify only prod's target active-model changed
	if h.cfg.SyncProfiles[1].Targets[0].ActiveModel != "claude-opus-4-20250514" {
		t.Fatalf("expected active-model 'claude-opus-4-20250514', got %q", h.cfg.SyncProfiles[1].Targets[0].ActiveModel)
	}
	// Verify dev unchanged
	if h.cfg.SyncProfiles[0].Targets[0].ActiveModel != "gpt-4o" {
		t.Fatalf("expected dev active-model 'gpt-4o' unchanged, got %q", h.cfg.SyncProfiles[0].Targets[0].ActiveModel)
	}
}

func TestPatchSyncProfiles_IndexOutOfBounds(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	body := map[string]interface{}{
		"index": 999,
		"value": map[string]interface{}{
			"active-model": "x",
		},
	}

	w := performRequest(h, http.MethodPatch, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPatchSyncProfiles_NameNotFound(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	body := map[string]interface{}{
		"match": "nonexistent-profile",
		"value": map[string]interface{}{
			"active-model": "x",
		},
	}

	w := performRequest(h, http.MethodPatch, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPatchSyncProfiles_MissingIndexAndMatch(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	body := map[string]interface{}{
		"value": map[string]interface{}{
			"active-model": "x",
		},
	}

	w := performRequest(h, http.MethodPatch, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPatchSyncProfiles_MalformedJSON(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)

	w := performRequestRaw(h, http.MethodPatch, "/v0/management/sync-profiles", []byte("{broken"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPatchSyncProfiles_NullValue(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	body := map[string]interface{}{
		"index": 0,
	}

	w := performRequest(h, http.MethodPatch, "/v0/management/sync-profiles", body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPatchSyncProfiles_TargetsPartialUpdate(t *testing.T) {
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
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Name should be unchanged
	if h.cfg.SyncProfiles[0].Name != "dev" {
		t.Fatalf("expected name 'dev' unchanged, got %q", h.cfg.SyncProfiles[0].Name)
	}
	// Targets should be replaced
	if len(h.cfg.SyncProfiles[0].Targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(h.cfg.SyncProfiles[0].Targets))
	}
	if h.cfg.SyncProfiles[0].Targets[0].Tool != "claude-code" {
		t.Fatalf("expected tool 'claude-code', got %q", h.cfg.SyncProfiles[0].Targets[0].Tool)
	}
}

// --- DELETE tests ---

func TestDeleteSyncProfiles_ByName(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
		{Name: "prod", Targets: []config.SyncProfileTarget{{Tool: "claude-code"}}},
	}

	w := performRequestRaw(h, http.MethodDelete, "/v0/management/sync-profiles?name=dev", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	if len(h.cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile after delete, got %d", len(h.cfg.SyncProfiles))
	}
	if h.cfg.SyncProfiles[0].Name != "prod" {
		t.Fatalf("expected remaining profile 'prod', got %q", h.cfg.SyncProfiles[0].Name)
	}
}

func TestDeleteSyncProfiles_ByIndex(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
		{Name: "prod", Targets: []config.SyncProfileTarget{{Tool: "claude-code"}}},
	}

	w := performRequestRaw(h, http.MethodDelete, "/v0/management/sync-profiles?index=0", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	if len(h.cfg.SyncProfiles) != 1 {
		t.Fatalf("expected 1 profile after delete, got %d", len(h.cfg.SyncProfiles))
	}
	if h.cfg.SyncProfiles[0].Name != "prod" {
		t.Fatalf("expected remaining profile 'prod', got %q", h.cfg.SyncProfiles[0].Name)
	}
}

func TestDeleteSyncProfiles_MissingNameAndIndex(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	w := performRequestRaw(h, http.MethodDelete, "/v0/management/sync-profiles", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteSyncProfiles_NameNotFound(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	w := performRequestRaw(h, http.MethodDelete, "/v0/management/sync-profiles?name=nonexistent", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteSyncProfiles_IndexOutOfBounds(t *testing.T) {
	h, _ := setupSyncProfilesTest(t)
	h.cfg.SyncProfiles = []config.SyncProfile{
		{Name: "dev", Targets: []config.SyncProfileTarget{{Tool: "factory-droid"}}},
	}

	w := performRequestRaw(h, http.MethodDelete, "/v0/management/sync-profiles?index=999", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d: %s", w.Code, w.Body.String())
	}
}
