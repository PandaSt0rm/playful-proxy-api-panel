package providerprobe

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/port"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executor"
)

// probeExecutor is a scriptable ProviderExecutor. Tests build a real Manager around it so
// the probe exercises the actual credential-selection path, which is where the executor-key
// bug lived.
type probeExecutor struct {
	id string

	mu           sync.Mutex
	executeCalls []string
	streamCalls  []string

	executeResponse []byte
	executeErr      error
	streamChunks    []cliproxyexecutor.StreamChunk
	streamErr       error
}

func (e *probeExecutor) Identifier() string { return e.id }

func (e *probeExecutor) Execute(_ context.Context, auth *coreauth.Auth, req cliproxyexecutor.Request, _ cliproxyexecutor.Options) (cliproxyexecutor.Response, error) {
	e.mu.Lock()
	e.executeCalls = append(e.executeCalls, auth.ID+"|"+req.Model)
	e.mu.Unlock()
	if e.executeErr != nil {
		return cliproxyexecutor.Response{}, e.executeErr
	}
	payload := e.executeResponse
	if payload == nil {
		payload = []byte(`{"choices":[{"message":{"content":"OK"}}]}`)
	}
	return cliproxyexecutor.Response{Payload: payload}, nil
}

func (e *probeExecutor) ExecuteStream(_ context.Context, auth *coreauth.Auth, req cliproxyexecutor.Request, _ cliproxyexecutor.Options) (*cliproxyexecutor.StreamResult, error) {
	e.mu.Lock()
	e.streamCalls = append(e.streamCalls, auth.ID+"|"+req.Model)
	e.mu.Unlock()
	if e.streamErr != nil {
		return nil, e.streamErr
	}
	channel := make(chan cliproxyexecutor.StreamChunk, len(e.streamChunks)+1)
	for _, chunk := range e.streamChunks {
		channel <- chunk
	}
	close(channel)
	return &cliproxyexecutor.StreamResult{Headers: http.Header{"X-Probe": {"1"}}, Chunks: channel}, nil
}

func (e *probeExecutor) Refresh(_ context.Context, auth *coreauth.Auth) (*coreauth.Auth, error) {
	return auth, nil
}

func (e *probeExecutor) CountTokens(context.Context, *coreauth.Auth, cliproxyexecutor.Request, cliproxyexecutor.Options) (cliproxyexecutor.Response, error) {
	return cliproxyexecutor.Response{}, nil
}

func (e *probeExecutor) HttpRequest(context.Context, *coreauth.Auth, *http.Request) (*http.Response, error) {
	return nil, &coreauth.Error{HTTPStatus: http.StatusNotImplemented, Message: "not implemented"}
}

func (e *probeExecutor) calls() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]string(nil), e.executeCalls...)
}

type statusError struct{ code int }

func (e statusError) Error() string   { return "upstream rejected the request" }
func (e statusError) StatusCode() int { return e.code }

// newProbe wires a real Manager plus the global registry around one credential.
func newProbe(t *testing.T, auth *coreauth.Auth, executorKey string, models []string, executor *probeExecutor) (*Service, *probeExecutor) {
	t.Helper()
	if executor == nil {
		executor = &probeExecutor{id: executorKey}
	} else {
		executor.id = executorKey
	}

	manager := coreauth.NewManager(nil, nil, nil)
	manager.RegisterExecutor(executor)
	if _, err := manager.Register(context.Background(), auth); err != nil {
		t.Fatalf("register auth: %v", err)
	}

	reg := registry.GetGlobalRegistry()
	infos := make([]*registry.ModelInfo, 0, len(models))
	for _, model := range models {
		infos = append(infos, &registry.ModelInfo{ID: model})
	}
	reg.RegisterClient(auth.ID, executorKey, infos)
	t.Cleanup(func() { reg.UnregisterClient(auth.ID) })

	return New(manager, reg), executor
}

func compatAuth(name string) *coreauth.Auth {
	return &coreauth.Auth{
		ID:       "compat-" + name,
		Provider: "openai-compatibility",
		Label:    name,
		Status:   coreauth.StatusActive,
		Attributes: map[string]string{
			"api_key":      "test-key",
			"compat_name":  name,
			"provider_key": "openai-compatible-" + name,
		},
	}
}

func TestProviderKeyForAuth(t *testing.T) {
	cases := []struct {
		name string
		auth *coreauth.Auth
		want string
	}{
		{"nil", nil, ""},
		{"named compat", compatAuth("openrouter"), "openai-compatible-openrouter"},
		{
			"compat without provider_key",
			&coreauth.Auth{Provider: "openai-compatibility", Attributes: map[string]string{"compat_name": "zai"}},
			"openai-compatible-zai",
		},
		{
			"bare compat falls back to its label",
			&coreauth.Auth{Provider: "openai-compatibility", Label: "custom"},
			"openai-compatible-custom",
		},
		{
			"unlabelled compat",
			&coreauth.Auth{Provider: "openai-compatibility"},
			"openai-compatibility",
		},
		{"native provider", &coreauth.Auth{Provider: "Gemini"}, "gemini"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := providerKeyForAuth(testCase.auth); got != testCase.want {
				t.Fatalf("providerKeyForAuth = %q, want %q", got, testCase.want)
			}
		})
	}
}

// TestConnectivityReachesNamedCompatProvider is the regression test for the executor-key
// bug: the auth records Provider="openai-compatibility" while the executor registers under
// "openai-compatible-<name>", so routing on auth.Provider never reached it.
func TestConnectivityReachesNamedCompatProvider(t *testing.T) {
	auth := compatAuth("openrouter")
	service, executor := newProbe(t, auth, "openai-compatible-openrouter", []string{"gpt-4o"}, nil)

	result, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind:      "openai-compatibility",
		AuthIndex: auth.EnsureIndex(),
	}, "connectivity")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.Status != "pass" {
		t.Fatalf("status = %q (%s), want pass", result.Status, result.Message)
	}
	if calls := executor.calls(); len(calls) != 1 {
		t.Fatalf("executor calls = %v, want exactly one", calls)
	}
}

func TestModelsCheckKeepsItsPublishedShape(t *testing.T) {
	auth := compatAuth("shape")
	service, _ := newProbe(t, auth, "openai-compatible-shape", []string{"b-model", "a-model"}, nil)

	result, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex(),
	}, "models")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.Status != "pass" || result.Category != "ok" {
		t.Fatalf("status/category = %q/%q", result.Status, result.Category)
	}
	if result.ModelCount == nil || *result.ModelCount != 2 {
		t.Fatalf("model count = %v, want 2", result.ModelCount)
	}
	// The diagnostics page reads detail.models and expects them sorted.
	models, ok := result.Detail["models"].([]string)
	if !ok || len(models) != 2 || models[0] != "a-model" {
		t.Fatalf("detail.models = %#v, want sorted ids", result.Detail["models"])
	}
}

func TestExecutionErrorUsesStatusCoder(t *testing.T) {
	auth := compatAuth("statuscode")
	service, _ := newProbe(t, auth, "openai-compatible-statuscode", []string{"gpt-4o"},
		&probeExecutor{executeErr: statusError{code: http.StatusUnauthorized}})

	result, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex(),
	}, "completion")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.Status != "fail" {
		t.Fatalf("status = %q, want fail", result.Status)
	}
	// Guards the old behaviour, which only unwrapped *coreauth.Error and reported nil.
	if result.HTTPStatus == nil || *result.HTTPStatus != http.StatusUnauthorized {
		t.Fatalf("http status = %v, want 401", result.HTTPStatus)
	}
	if result.Category != "http_401" {
		t.Fatalf("category = %q, want http_401", result.Category)
	}
}

func TestStreamingCountsChunksAndReportsTTFT(t *testing.T) {
	auth := compatAuth("stream")
	service, _ := newProbe(t, auth, "openai-compatible-stream", []string{"gpt-4o"}, &probeExecutor{
		streamChunks: []cliproxyexecutor.StreamChunk{
			{Payload: []byte(`data: {"a":1}`)},
			{Payload: []byte(`data: {"a":2}`)},
			{Payload: []byte("data: [DONE]")},
		},
	})

	result, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex(),
	}, "streaming")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.Status != "pass" {
		t.Fatalf("status = %q (%s), want pass", result.Status, result.Message)
	}
	stream, _ := result.Detail["stream"].(map[string]any)
	if stream["chunk_count"] != 3 {
		t.Fatalf("chunk_count = %v, want 3", stream["chunk_count"])
	}
	if stream["saw_done"] != true || stream["terminated_cleanly"] != true {
		t.Fatalf("stream detail = %#v", stream)
	}
	if _, ok := stream["ttft_ms"]; !ok {
		t.Fatalf("ttft_ms missing from %#v", stream)
	}
}

// A bootstrap failure arrives as a chunk error with a nil function error, so a naive
// `if err != nil` check would report a dead stream as a pass.
func TestStreamingBootstrapErrorIsAFailure(t *testing.T) {
	auth := compatAuth("streamfail")
	service, _ := newProbe(t, auth, "openai-compatible-streamfail", []string{"gpt-4o"}, &probeExecutor{
		streamChunks: []cliproxyexecutor.StreamChunk{{Err: statusError{code: http.StatusTooManyRequests}}},
	})

	result, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex(),
	}, "streaming")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.Status != "fail" {
		t.Fatalf("status = %q, want fail", result.Status)
	}
	if result.HTTPStatus == nil || *result.HTTPStatus != http.StatusTooManyRequests {
		t.Fatalf("http status = %v, want 429", result.HTTPStatus)
	}
}

func TestStreamingWithNoChunksIsAFailure(t *testing.T) {
	auth := compatAuth("streamempty")
	service, _ := newProbe(t, auth, "openai-compatible-streamempty", []string{"gpt-4o"},
		&probeExecutor{streamChunks: nil})

	result, _ := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex(),
	}, "streaming")
	if result.Status != "fail" || result.Category != "empty_stream" {
		t.Fatalf("status/category = %q/%q, want fail/empty_stream", result.Status, result.Category)
	}
}

func TestPayloadCheckValidatesItsInput(t *testing.T) {
	auth := compatAuth("payload")
	service, executor := newProbe(t, auth, "openai-compatible-payload", []string{"gpt-4o"}, nil)
	target := port.ProbeTarget{Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex()}

	empty, _ := service.Probe(context.Background(), target, "payload")
	if empty.Status != "fail" || empty.Category != "invalid_payload" {
		t.Fatalf("empty payload = %q/%q", empty.Status, empty.Category)
	}

	target.Payload = []byte("{not json")
	malformed, _ := service.Probe(context.Background(), target, "payload")
	if malformed.Status != "fail" || malformed.Category != "invalid_payload" {
		t.Fatalf("malformed payload = %q/%q", malformed.Status, malformed.Category)
	}
	if calls := executor.calls(); len(calls) != 0 {
		t.Fatalf("executor was called with an invalid payload: %v", calls)
	}

	target.Payload = []byte(`{"model":"gpt-4o","messages":[]}`)
	valid, _ := service.Probe(context.Background(), target, "payload")
	if valid.Status != "pass" {
		t.Fatalf("valid payload = %q (%s)", valid.Status, valid.Message)
	}
}

func TestUnknownCheckIsUnsupported(t *testing.T) {
	auth := compatAuth("unknown")
	service, _ := newProbe(t, auth, "openai-compatible-unknown", []string{"gpt-4o"}, nil)

	if _, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex(),
	}, "nonexistent"); err != ErrUnsupported {
		t.Fatalf("err = %v, want ErrUnsupported", err)
	}
}

func TestMissingTargetIsNotFound(t *testing.T) {
	auth := compatAuth("missing")
	service, _ := newProbe(t, auth, "openai-compatible-missing", []string{"gpt-4o"}, nil)

	if _, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: "no-such-index",
	}, "models"); err != ErrTargetNotFound {
		t.Fatalf("err = %v, want ErrTargetNotFound", err)
	}
	// A target with neither an index nor AllKeys addresses nothing.
	if _, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility",
	}, "models"); err != ErrTargetNotFound {
		t.Fatalf("err = %v, want ErrTargetNotFound", err)
	}
}

func TestRunIDIsEchoedForClientSideGrouping(t *testing.T) {
	auth := compatAuth("runid")
	service, _ := newProbe(t, auth, "openai-compatible-runid", []string{"gpt-4o"}, nil)

	result, _ := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AuthIndex: auth.EnsureIndex(), RunID: " run-7 ",
	}, "models")
	if result.Detail["run_id"] != "run-7" {
		t.Fatalf("run_id = %v, want run-7", result.Detail["run_id"])
	}
}

func TestAuthMatchesKind(t *testing.T) {
	cases := []struct {
		name string
		auth *coreauth.Auth
		kind string
		want bool
	}{
		{"nil auth", nil, "gemini-api-key", false},
		{"auth file", &coreauth.Auth{FileName: "kimi.json"}, "auth-file", true},
		{"config key is not an auth file", &coreauth.Auth{Provider: "gemini"}, "auth-file", false},
		{"native kind", &coreauth.Auth{Provider: "gemini"}, "gemini-api-key", true},
		{"native kind mismatch", &coreauth.Auth{Provider: "claude"}, "gemini-api-key", false},
		{"compat by provider", &coreauth.Auth{Provider: "openai-compatibility"}, "openai-compatibility", true},
		{
			"compat by attribute only",
			&coreauth.Auth{Provider: "openai-compatible-zai", Attributes: map[string]string{"compat_name": "zai"}},
			"openai-compatibility", true,
		},
		{"compat mismatch", &coreauth.Auth{Provider: "gemini"}, "openai-compatibility", false},
		{"unknown kind", &coreauth.Auth{Provider: "gemini"}, "made-up", false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := authMatchesKind(testCase.auth, testCase.kind); got != testCase.want {
				t.Fatalf("authMatchesKind = %v, want %v", got, testCase.want)
			}
		})
	}
}

// providerForKind must not gain entries for auth-file-backed providers: they would be dead,
// because those credentials never carry a matching Provider from a config key list.
func TestProviderForKindOmitsAuthFileProviders(t *testing.T) {
	for _, kind := range []string{"kimi", "antigravity", "aistudio"} {
		if provider := providerForKind(kind); provider != "" {
			t.Fatalf("providerForKind(%q) = %q, want empty", kind, provider)
		}
	}
}

// The dispatch table and the port's published list must agree, or the HTTP layer will
// accept a check nothing implements.
func TestDispatchTableMatchesPublishedChecks(t *testing.T) {
	for _, check := range port.ProbeChecks {
		if _, ok := checkRunners[check]; !ok {
			t.Fatalf("port.ProbeChecks lists %q with no runner", check)
		}
	}
	for check := range checkRunners {
		if !port.IsProbeCheck(check) {
			t.Fatalf("runner %q is missing from port.ProbeChecks", check)
		}
	}
	for _, check := range port.BillableProbeChecks {
		if !port.IsProbeCheck(check) {
			t.Fatalf("billable check %q is not a known check", check)
		}
	}
	// Registry reads cost nothing; marking them billable would gate them needlessly.
	for _, free := range []string{"models", "catalog"} {
		if port.IsBillableProbeCheck(free) {
			t.Fatalf("%q must not be billable", free)
		}
	}
}

func TestAllKeysFansOutAndRollsUp(t *testing.T) {
	first := compatAuth("fanout-a")
	manager := coreauth.NewManager(nil, nil, nil)
	executor := &probeExecutor{id: "openai-compatible-fanout-a"}
	manager.RegisterExecutor(executor)
	if _, err := manager.Register(context.Background(), first); err != nil {
		t.Fatalf("register: %v", err)
	}
	second := compatAuth("fanout-a")
	second.ID = "compat-fanout-a-2"
	if _, err := manager.Register(context.Background(), second); err != nil {
		t.Fatalf("register: %v", err)
	}

	reg := registry.GetGlobalRegistry()
	for _, auth := range []*coreauth.Auth{first, second} {
		reg.RegisterClient(auth.ID, "openai-compatible-fanout-a", []*registry.ModelInfo{{ID: "gpt-4o"}})
		t.Cleanup(func() { reg.UnregisterClient(auth.ID) })
	}
	service := New(manager, reg)

	result, err := service.Probe(context.Background(), port.ProbeTarget{
		Kind: "openai-compatibility", AllKeys: true,
	}, "models")
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if result.Category != "aggregate" {
		t.Fatalf("category = %q, want aggregate", result.Category)
	}
	perKey, ok := result.Detail["per_key"].([]map[string]any)
	if !ok || len(perKey) != 2 {
		t.Fatalf("per_key = %#v, want two entries", result.Detail["per_key"])
	}
	if result.Detail["credential_count"] != 2 {
		t.Fatalf("credential_count = %v, want 2", result.Detail["credential_count"])
	}
	if !strings.Contains(result.Message, "credentials passed") {
		t.Fatalf("message = %q", result.Message)
	}
}

func TestWorseStatusKeepsTheMostSevere(t *testing.T) {
	if worseStatus("pass", "warn") != "warn" {
		t.Fatal("warn must beat pass")
	}
	if worseStatus("warn", "fail") != "fail" {
		t.Fatal("fail must beat warn")
	}
	if worseStatus("fail", "pass") != "fail" {
		t.Fatal("pass must not downgrade fail")
	}
}
