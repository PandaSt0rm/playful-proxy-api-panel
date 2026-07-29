package management

import (
	"bufio"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/oauthbridge"
)

type bridgeTestFrame struct {
	Version  int    `json:"version"`
	Type     string `json:"type"`
	Provider string `json:"provider,omitempty"`
	State    string `json:"state,omitempty"`
	Port     int    `json:"port,omitempty"`
	Code     string `json:"code,omitempty"`
	Error    string `json:"error,omitempty"`
	Status   int    `json:"status,omitempty"`
}

func TestCodexWebUIStartWaitsForBridgeReadyAndAcknowledgesCallback(t *testing.T) {
	withIsolatedOAuthSessions(t)
	installFakeCodexOAuthService(t)

	acquired := make(chan bridgeTestFrame, 1)
	allowReady := make(chan struct{})
	acknowledged := make(chan bridgeTestFrame, 1)
	socket := startFakeOAuthBridge(t, func(conn net.Conn) {
		decoder := json.NewDecoder(bufio.NewReader(conn))
		encoder := json.NewEncoder(conn)
		var request bridgeTestFrame
		if err := decoder.Decode(&request); err != nil {
			t.Errorf("decode acquire: %v", err)
			return
		}
		acquired <- request
		<-allowReady
		_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "ready"})
		_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "callback", State: request.State, Error: "access_denied"})
		var result bridgeTestFrame
		if err := decoder.Decode(&result); err != nil {
			t.Errorf("decode callback result: %v", err)
			return
		}
		acknowledged <- result
	})
	t.Setenv("AIPROXY_OAUTH_BRIDGE_SOCKET", socket)

	handler := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: t.TempDir()}, nil)
	handler.oauthCallbackPollInterval = 5 * time.Millisecond
	router := gin.New()
	router.GET("/codex-auth-url", handler.RequestCodexToken)
	responseDone := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		request := httptest.NewRequest(http.MethodGet, "/codex-auth-url?is_webui=true", nil)
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		responseDone <- recorder
	}()

	var acquire bridgeTestFrame
	select {
	case acquire = <-acquired:
	case <-time.After(time.Second):
		t.Fatal("management handler did not acquire bridge")
	}
	if acquire.Version != 1 || acquire.Type != "acquire" || acquire.Provider != "codex" || acquire.Port != codexCallbackPort || acquire.State == "" {
		t.Fatalf("acquire frame = %#v", acquire)
	}
	select {
	case recorder := <-responseDone:
		t.Fatalf("start returned before ready: %d %s", recorder.Code, recorder.Body.String())
	case <-time.After(25 * time.Millisecond):
	}
	close(allowReady)

	var recorder *httptest.ResponseRecorder
	select {
	case recorder = <-responseDone:
	case <-time.After(time.Second):
		t.Fatal("management start did not return after ready")
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("start status = %d: %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Status string `json:"status"`
		URL    string `json:"url"`
		State  string `json:"state"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Status != "ok" || response.URL == "" || response.State != acquire.State {
		t.Fatalf("start response = %#v", response)
	}
	select {
	case result := <-acknowledged:
		if result.Type != "callback_result" || result.Status != http.StatusOK {
			t.Fatalf("callback result = %#v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("callback was not acknowledged")
	}
	waitForSessionStatus(t, acquire.State, "Bad Request")
}

func TestWebUIBridgeStartMapsErrorsAndRemovesRejectedSession(t *testing.T) {
	tests := []struct {
		name       string
		code       string
		wantStatus int
		wantBody   string
	}{
		{name: "port collision", code: "port_in_use", wantStatus: http.StatusConflict, wantBody: `{"error":"OAuth callback port 1455 is already in use on the host"}`},
		{name: "bridge failure", code: "internal", wantStatus: http.StatusServiceUnavailable, wantBody: `{"error":"OAuth callback bridge is unavailable"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			withIsolatedOAuthSessions(t)
			socket := startFakeOAuthBridge(t, func(conn net.Conn) {
				decoder := json.NewDecoder(bufio.NewReader(conn))
				encoder := json.NewEncoder(conn)
				var request bridgeTestFrame
				_ = decoder.Decode(&request)
				_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "error", Code: test.code, Error: "safe error"})
			})
			t.Setenv("AIPROXY_OAUTH_BRIDGE_SOCKET", socket)
			state := "rejected-state"
			RegisterOAuthSession(state, "codex")
			handler := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: t.TempDir()}, nil)
			recorder := httptest.NewRecorder()
			ginContext, _ := gin.CreateTestContext(recorder)
			request := httptest.NewRequest(http.MethodGet, "/?is_webui=true", nil)
			ginContext.Request = request

			forwarder, ok := handler.startWebUICallbackForwarder(ginContext, codexCallbackPort, "codex", state)

			if ok || forwarder != nil {
				t.Fatalf("start = (%v, %t), want failure", forwarder, ok)
			}
			if recorder.Code != test.wantStatus || strings.TrimSpace(recorder.Body.String()) != test.wantBody {
				t.Fatalf("response = %d %q", recorder.Code, recorder.Body.String())
			}
			if IsOAuthSessionPending(state, "codex") {
				t.Fatal("rejected OAuth session remains pending")
			}
		})
	}
}

func TestBridgeDisconnectSetsPendingSessionErrorBeforeCallbackDelivery(t *testing.T) {
	withIsolatedOAuthSessions(t)
	socket := startFakeOAuthBridge(t, func(conn net.Conn) {
		decoder := json.NewDecoder(bufio.NewReader(conn))
		encoder := json.NewEncoder(conn)
		var request bridgeTestFrame
		_ = decoder.Decode(&request)
		_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "ready"})
	})
	t.Setenv("AIPROXY_OAUTH_BRIDGE_SOCKET", socket)
	state := "disconnect-state"
	RegisterOAuthSession(state, "codex")
	handler := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: t.TempDir()}, nil)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodGet, "/?is_webui=true", nil)

	forwarder, ok := handler.startWebUICallbackForwarder(context, codexCallbackPort, "codex", state)
	if !ok || forwarder == nil {
		t.Fatal("bridge acquisition failed")
	}

	waitForSessionStatus(t, state, "OAuth callback bridge stopped")
}

func TestBridgeDisconnectAfterCallbackDeliveryLeavesSessionPending(t *testing.T) {
	withIsolatedOAuthSessions(t)
	state := "delivered-state"
	authDir := t.TempDir()
	socket := startFakeOAuthBridge(t, func(conn net.Conn) {
		decoder := json.NewDecoder(bufio.NewReader(conn))
		encoder := json.NewEncoder(conn)
		var request bridgeTestFrame
		_ = decoder.Decode(&request)
		_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "ready"})
		_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "callback", State: request.State, Code: "delivered-code"})
		var result bridgeTestFrame
		_ = decoder.Decode(&result)
	})
	t.Setenv("AIPROXY_OAUTH_BRIDGE_SOCKET", socket)
	RegisterOAuthSession(state, "codex")
	handler := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: authDir}, nil)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodGet, "/?is_webui=true", nil)

	forwarder, ok := handler.startWebUICallbackForwarder(context, codexCallbackPort, "codex", state)
	if !ok || forwarder == nil {
		t.Fatal("bridge acquisition failed")
	}
	select {
	case <-forwarder.bridgeLease.Done():
	case <-time.After(time.Second):
		t.Fatal("bridge did not disconnect")
	}
	if !forwarder.bridgeLease.CallbackDelivered() {
		t.Fatal("callback was not marked delivered")
	}
	if !IsOAuthSessionPending(state, "codex") {
		_, status, _ := GetOAuthSession(state)
		t.Fatalf("delivered session ended after disconnect: %q", status)
	}
	if _, err := os.Stat(filepath.Join(authDir, ".oauth-codex-"+state+".oauth")); err != nil {
		t.Fatalf("callback file missing: %v", err)
	}
	CancelOAuthSession(state)
}

func TestBridgeDisconnectAfterDeliveryDoesNotInterruptTokenExchange(t *testing.T) {
	withIsolatedOAuthSessions(t)
	installFakeCodexOAuthService(t)
	authDir := t.TempDir()
	socket := startFakeOAuthBridge(t, func(conn net.Conn) {
		decoder := json.NewDecoder(bufio.NewReader(conn))
		encoder := json.NewEncoder(conn)
		var request bridgeTestFrame
		if err := decoder.Decode(&request); err != nil {
			t.Errorf("decode acquire: %v", err)
			return
		}
		_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "ready"})
		_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "callback", State: request.State, Code: "delivered-code"})
		var result bridgeTestFrame
		if err := decoder.Decode(&result); err != nil {
			t.Errorf("decode callback result: %v", err)
			return
		}
		if result.Status != http.StatusOK {
			t.Errorf("callback result status = %d", result.Status)
		}
	})
	t.Setenv("AIPROXY_OAUTH_BRIDGE_SOCKET", socket)
	handler := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: authDir}, nil)
	handler.oauthCallbackPollInterval = 5 * time.Millisecond
	router := gin.New()
	router.GET("/codex-auth-url", handler.RequestCodexToken)

	state := requestCodexWebUIState(t, router)
	deadline := time.Now().Add(2 * time.Second)
	for {
		_, status, _, _, completed, ok := GetOAuthSessionDetails(state)
		if ok && completed {
			if status != "" {
				t.Fatalf("completed session status = %q", status)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("token exchange did not complete; status = %q", status)
		}
		time.Sleep(5 * time.Millisecond)
	}
	entries, err := os.ReadDir(authDir)
	if err != nil {
		t.Fatal(err)
	}
	foundToken := false
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".json") {
			foundToken = true
			break
		}
	}
	if !foundToken {
		t.Fatal("token exchange completed without persisting a token file")
	}
}

func TestCodexWorkerTimeoutAndCancellationReleaseBridgeLease(t *testing.T) {
	tests := []struct {
		name   string
		cancel bool
	}{
		{name: "timeout"},
		{name: "cancellation", cancel: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			withIsolatedOAuthSessions(t)
			installFakeCodexOAuthService(t)
			released := make(chan struct{})
			socket := startFakeOAuthBridge(t, func(conn net.Conn) {
				decoder := json.NewDecoder(bufio.NewReader(conn))
				encoder := json.NewEncoder(conn)
				var request bridgeTestFrame
				_ = decoder.Decode(&request)
				_ = encoder.Encode(bridgeTestFrame{Version: 1, Type: "ready"})
				var extra bridgeTestFrame
				if err := decoder.Decode(&extra); err != nil {
					close(released)
				}
			})
			t.Setenv("AIPROXY_OAUTH_BRIDGE_SOCKET", socket)
			handler := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: t.TempDir()}, nil)
			handler.oauthCallbackWaitTimeout = 50 * time.Millisecond
			handler.oauthCallbackPollInterval = 5 * time.Millisecond
			router := gin.New()
			router.GET("/codex-auth-url", handler.RequestCodexToken)

			state := requestCodexWebUIState(t, router)
			if test.cancel {
				if !CancelOAuthSession(state) {
					t.Fatal("failed to cancel session")
				}
			}
			select {
			case <-released:
			case <-time.After(time.Second):
				t.Fatal("worker did not release bridge lease")
			}
			if !test.cancel {
				waitForSessionStatus(t, state, "Timeout waiting for OAuth callback")
			}
		})
	}
}

func TestNativeCallbackPortCollisionReturnsStableSentinel(t *testing.T) {
	t.Setenv("AIPROXY_OAUTH_BRIDGE_SOCKET", "")
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port

	forwarder, err := startCallbackForwarder(port, "codex", "native-collision-state", t.TempDir())

	if forwarder != nil {
		stopCallbackForwarderInstance(port, forwarder)
		t.Fatal("native forwarder unexpectedly started")
	}
	if !errors.Is(err, oauthbridge.ErrPortInUse) {
		t.Fatalf("start error = %v, want ErrPortInUse", err)
	}
}

func startFakeOAuthBridge(t *testing.T, serve func(net.Conn)) string {
	t.Helper()
	socket := filepath.Join(t.TempDir(), "bridge.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		conn, errAccept := listener.Accept()
		if errAccept != nil {
			return
		}
		serve(conn)
		_ = conn.Close()
	}()
	t.Cleanup(func() {
		_ = listener.Close()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Error("fake bridge did not stop")
		}
	})
	return socket
}

func installFakeCodexOAuthService(t *testing.T) {
	t.Helper()
	original := newCodexOAuthService
	newCodexOAuthService = func(*config.Config) codexOAuthService { return &fakeCodexOAuthService{} }
	t.Cleanup(func() { newCodexOAuthService = original })
}

func requestCodexWebUIState(t *testing.T, router http.Handler) string {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/codex-auth-url?is_webui=true", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("start status = %d: %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || response.State == "" {
		t.Fatalf("start response = %s, error = %v", recorder.Body.String(), err)
	}
	return response.State
}

func waitForSessionStatus(t *testing.T, state, want string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		_, status, ok := GetOAuthSession(state)
		if ok && status == want {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("session %q status = %q, want %q", state, status, want)
		}
		time.Sleep(5 * time.Millisecond)
	}
}
