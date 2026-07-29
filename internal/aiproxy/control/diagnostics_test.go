package control

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/controlstore"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/port"
)

type diagnosticProbe struct{}

func (diagnosticProbe) Probe(_ context.Context, target port.ProbeTarget, check string) (port.ProbeResult, error) {
	count := 2
	return port.ProbeResult{Label: "primary", Status: "pass", Category: "ok", Message: "catalog available", LatencyMS: 4, ModelCount: &count, Detail: map[string]any{"models": []string{"m1", "m2"}}}, nil
}

func TestDiagnosticsRequireBillableAcknowledgementAndPersistHistory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store, err := controlstore.Open(context.Background(), filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	registrar := New(Dependencies{Store: store, Probe: diagnosticProbe{}})
	router := gin.New()
	registrar.Register(router.Group("/aiproxy"))

	request := func(body map[string]any) *httptest.ResponseRecorder {
		payload, marshalErr := json.Marshal(body)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/aiproxy/diagnostics", bytes.NewReader(payload)))
		return recorder
	}
	target := map[string]any{"kind": "gemini-api-key", "auth_index": "auth-1"}
	if recorder := request(map[string]any{"target": target, "check": "connectivity"}); recorder.Code != http.StatusBadRequest {
		t.Fatalf("connectivity without acknowledgement status = %d, want 400", recorder.Code)
	}
	if recorder := request(map[string]any{"target": target, "check": "models"}); recorder.Code != http.StatusOK {
		t.Fatalf("models status = %d body=%s", recorder.Code, recorder.Body.String())
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/aiproxy/diagnostics?auth_index=auth-1", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("history status = %d", recorder.Code)
	}
	var history struct {
		Results []json.RawMessage `json:"results"`
	}
	if err = json.Unmarshal(recorder.Body.Bytes(), &history); err != nil {
		t.Fatal(err)
	}
	if len(history.Results) != 1 {
		t.Fatalf("history count = %d, want 1", len(history.Results))
	}
}

// recordingProbe captures the target it was handed, so the HTTP layer's field plumbing can
// be asserted without a real provider.
type recordingProbe struct{ last port.ProbeTarget }

func (p *recordingProbe) Probe(_ context.Context, target port.ProbeTarget, _ string) (port.ProbeResult, error) {
	p.last = target
	return port.ProbeResult{Label: "primary", Status: "pass", Category: "ok", Message: "ok"}, nil
}

func newDiagnosticsRouter(t *testing.T, probe port.ProviderProbe) func(map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store, err := controlstore.Open(context.Background(), filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	registrar := New(Dependencies{Store: store, Probe: probe})
	router := gin.New()
	registrar.Register(router.Group("/aiproxy"))

	return func(body map[string]any) *httptest.ResponseRecorder {
		payload, marshalErr := json.Marshal(body)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/aiproxy/diagnostics", bytes.NewReader(payload)))
		return recorder
	}
}

// The gate used to cover only "connectivity"; every check that spends provider tokens must
// now require the acknowledgement, and every free one must not.
func TestDiagnosticsBillableGateCoversEveryTokenSpendingCheck(t *testing.T) {
	request := newDiagnosticsRouter(t, diagnosticProbe{})
	target := map[string]any{"kind": "gemini-api-key", "auth_index": "auth-1"}

	for _, check := range port.BillableProbeChecks {
		body := map[string]any{"target": target, "check": check}
		if check == "payload" {
			body["payload"] = json.RawMessage(`{"model":"m1"}`)
		}
		if recorder := request(body); recorder.Code != http.StatusBadRequest {
			t.Fatalf("%s without acknowledgement = %d, want 400", check, recorder.Code)
		}
		body["acknowledge_billable"] = true
		if recorder := request(body); recorder.Code != http.StatusOK {
			t.Fatalf("%s with acknowledgement = %d body=%s", check, recorder.Code, recorder.Body.String())
		}
	}

	for _, check := range []string{"models", "catalog"} {
		if recorder := request(map[string]any{"target": target, "check": check}); recorder.Code != http.StatusOK {
			t.Fatalf("free check %s = %d body=%s", check, recorder.Code, recorder.Body.String())
		}
	}
}

func TestDiagnosticsRejectsUnknownCheck(t *testing.T) {
	request := newDiagnosticsRouter(t, diagnosticProbe{})
	recorder := request(map[string]any{
		"target": map[string]any{"kind": "gemini-api-key", "auth_index": "auth-1"},
		"check":  "nonexistent",
	})
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
}

func TestDiagnosticsForwardsOptionalTargetFields(t *testing.T) {
	probe := &recordingProbe{}
	request := newDiagnosticsRouter(t, probe)

	recorder := request(map[string]any{
		"target":               map[string]any{"kind": "openai-compatibility", "auth_index": "auth-9"},
		"check":                "streaming",
		"acknowledge_billable": true,
		"model":                "  gpt-4o  ",
		"stream":               true,
		"run_id":               " run-3 ",
	})
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", recorder.Code, recorder.Body.String())
	}
	if probe.last.Model != "gpt-4o" || probe.last.RunID != "run-3" || !probe.last.Stream {
		t.Fatalf("target = %#v", probe.last)
	}
}

func TestDiagnosticsAllKeysStandsInForAnAuthIndex(t *testing.T) {
	probe := &recordingProbe{}
	request := newDiagnosticsRouter(t, probe)
	target := map[string]any{"kind": "openai-compatibility"}

	if recorder := request(map[string]any{"target": target, "check": "models"}); recorder.Code != http.StatusBadRequest {
		t.Fatalf("missing auth index = %d, want 400", recorder.Code)
	}
	recorder := request(map[string]any{"target": target, "check": "models", "all_keys": true})
	if recorder.Code != http.StatusOK {
		t.Fatalf("all_keys = %d body=%s", recorder.Code, recorder.Body.String())
	}
	if !probe.last.AllKeys {
		t.Fatalf("AllKeys was not forwarded: %#v", probe.last)
	}
}

func TestDiagnosticsPayloadCheckValidatesItsBody(t *testing.T) {
	request := newDiagnosticsRouter(t, diagnosticProbe{})
	base := map[string]any{
		"target":               map[string]any{"kind": "openai-compatibility", "auth_index": "auth-1"},
		"check":                "payload",
		"acknowledge_billable": true,
	}

	if recorder := request(base); recorder.Code != http.StatusBadRequest {
		t.Fatalf("missing payload = %d, want 400", recorder.Code)
	}

	// A debug button must not become a route for expensive conversations.
	oversized, err := json.Marshal(map[string]any{"pad": strings.Repeat("x", maxProbePayloadBytes)})
	if err != nil {
		t.Fatal(err)
	}
	base["payload"] = json.RawMessage(oversized)
	if recorder := request(base); recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized payload = %d, want 413", recorder.Code)
	}

	base["payload"] = json.RawMessage(`{"model":"m1"}`)
	if recorder := request(base); recorder.Code != http.StatusOK {
		t.Fatalf("valid payload = %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestDiagnosticTimeoutsScaleWithTheCheck(t *testing.T) {
	if diagnosticTimeout("models") >= diagnosticTimeout("completion") {
		t.Fatal("a registry read must not get a longer ceiling than a generation")
	}
	// Streaming is bounded by chunk budget rather than wall clock, so it needs the most room.
	if diagnosticTimeout("streaming") <= diagnosticTimeout("completion") {
		t.Fatal("streaming needs the longest ceiling")
	}
}
