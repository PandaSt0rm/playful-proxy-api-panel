package oauthbridge

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	log "github.com/sirupsen/logrus"
)

func TestCallbackHTTPHandlerSupportsGETPOSTPreflightAndProviderErrors(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		target     string
		body       string
		wantStatus int
		wantError  string
	}{
		{name: "get code", method: http.MethodGet, target: "/callback?state=get-state&code=get-code", wantStatus: http.StatusOK},
		{name: "post code", method: http.MethodPost, target: "/callback", body: "state=post-state&code=post-code", wantStatus: http.StatusOK},
		{name: "provider error description", method: http.MethodGet, target: "/callback?state=error-state&error_description=access_denied", wantStatus: http.StatusOK, wantError: "access_denied"},
		{name: "preflight", method: http.MethodOptions, target: "/callback", wantStatus: http.StatusNoContent},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var received Callback
			handler := NewCallbackHTTPHandler(func(_ context.Context, callback Callback) CallbackResult {
				received = callback
				return CallbackResult{Status: http.StatusOK}
			})
			var body io.Reader
			if test.body != "" {
				body = strings.NewReader(test.body)
			}
			request := httptest.NewRequest(test.method, test.target, body)
			if test.body != "" {
				request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			}
			request.Header.Set("Origin", "https://accounts.example")
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if recorder.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d: %s", recorder.Code, test.wantStatus, recorder.Body.String())
			}
			if recorder.Header().Get("Access-Control-Allow-Private-Network") != "true" {
				t.Fatal("private-network CORS header missing")
			}
			if test.wantStatus == http.StatusOK && !strings.Contains(recorder.Body.String(), "Authentication successful") {
				t.Fatalf("success body = %q", recorder.Body.String())
			}
			if received.Error != test.wantError {
				t.Fatalf("callback error = %q, want %q", received.Error, test.wantError)
			}
		})
	}
}

func TestCallbackHTTPHandlerValidatesAndCapsInput(t *testing.T) {
	handler := NewCallbackHTTPHandler(func(_ context.Context, _ Callback) CallbackResult {
		return CallbackResult{Status: http.StatusOK}
	})
	tests := []struct {
		name   string
		method string
		target string
		body   string
		status int
	}{
		{name: "method", method: http.MethodPut, target: "/callback", status: http.StatusMethodNotAllowed},
		{name: "missing state", method: http.MethodGet, target: "/callback?code=value", status: http.StatusBadRequest},
		{name: "missing result", method: http.MethodGet, target: "/callback?state=value", status: http.StatusBadRequest},
		{name: "oversized body", method: http.MethodPost, target: "/callback", body: "state=value&code=" + strings.Repeat("x", maxCallbackRequestSize), status: http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.target, strings.NewReader(test.body))
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if recorder.Code != test.status {
				t.Fatalf("status = %d, want %d: %s", recorder.Code, test.status, recorder.Body.String())
			}
		})
	}
}

func TestBridgeBindsAfterAcquireDeliversCallbackAndReleasesAfterAcknowledgement(t *testing.T) {
	server := startTestBridge(t, 2*time.Second)
	assertPortState(t, server.port, true)
	callbackReceived := make(chan Callback, 1)
	lease := acquireTestLease(t, server, "callback-state", func(_ context.Context, callback Callback) CallbackResult {
		callbackReceived <- callback
		return CallbackResult{Status: http.StatusOK}
	})
	defer lease.Close()
	assertPortState(t, server.port, false)

	response, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/callback?state=callback-state&code=authorization-code", server.port))
	if err != nil {
		t.Fatalf("callback GET failed: %v", err)
	}
	body, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()

	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), "Authentication successful") {
		t.Fatalf("callback response = %d %q", response.StatusCode, body)
	}
	select {
	case callback := <-callbackReceived:
		if callback.State != "callback-state" || callback.Code != "authorization-code" {
			t.Fatalf("callback = %#v", callback)
		}
	case <-time.After(time.Second):
		t.Fatal("callback was not delivered")
	}
	if !lease.CallbackDelivered() {
		t.Fatal("lease did not record callback delivery")
	}
	waitForPortState(t, server.port, true)
}

func TestBridgeKeepsListenerUntilFinalStateEnds(t *testing.T) {
	server := startTestBridge(t, 2*time.Second)
	first := acquireTestLease(t, server, "first-state", successCallback)
	second := acquireTestLease(t, server, "second-state", successCallback)
	assertPortState(t, server.port, false)

	if err := first.Close(); err != nil {
		t.Fatalf("close first lease: %v", err)
	}
	assertPortState(t, server.port, false)
	if err := second.Close(); err != nil {
		t.Fatalf("close second lease: %v", err)
	}
	waitForPortState(t, server.port, true)
}

func TestBridgeRetainsStateAfterRetryableAcknowledgement(t *testing.T) {
	server := startTestBridge(t, 2*time.Second)
	attempts := 0
	lease := acquireTestLease(t, server, "retry-state", func(_ context.Context, _ Callback) CallbackResult {
		attempts++
		if attempts == 1 {
			return CallbackResult{Status: http.StatusBadRequest, Error: "correct the callback"}
		}
		return CallbackResult{Status: http.StatusOK}
	})
	defer lease.Close()

	first := callbackRequest(t, server.port, "retry-state", "first")
	if first != http.StatusBadRequest {
		t.Fatalf("first status = %d", first)
	}
	assertPortState(t, server.port, false)
	second := callbackRequest(t, server.port, "retry-state", "second")
	if second != http.StatusOK {
		t.Fatalf("second status = %d", second)
	}
	waitForPortState(t, server.port, true)
}

func TestBridgeRejectsConcurrentCallbackForSameLease(t *testing.T) {
	server := startTestBridge(t, 2*time.Second)
	entered := make(chan struct{})
	release := make(chan struct{})
	lease := acquireTestLease(t, server, "concurrent-state", func(_ context.Context, _ Callback) CallbackResult {
		close(entered)
		<-release
		return CallbackResult{Status: http.StatusOK}
	})
	defer lease.Close()

	firstStatus := make(chan int, 1)
	firstError := make(chan error, 1)
	go func() {
		response, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/callback?state=concurrent-state&code=first", server.port))
		if err != nil {
			firstError <- err
			return
		}
		_, _ = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()
		firstStatus <- response.StatusCode
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("first callback did not enter handler")
	}

	if status := callbackRequest(t, server.port, "concurrent-state", "second"); status != http.StatusConflict {
		t.Fatalf("concurrent callback status = %d", status)
	}
	close(release)
	select {
	case err := <-firstError:
		t.Fatalf("first callback failed: %v", err)
	case status := <-firstStatus:
		if status != http.StatusOK {
			t.Fatalf("first callback status = %d", status)
		}
	case <-time.After(time.Second):
		t.Fatal("first callback did not finish")
	}
}

func TestBridgeRejectsUnknownDuplicateAndInvalidStatesWithoutDisturbingLease(t *testing.T) {
	server := startTestBridge(t, 2*time.Second)
	lease := acquireTestLease(t, server, "valid-state", successCallback)
	defer lease.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := Acquire(ctx, server.socket, AcquireRequest{Provider: "codex", State: "valid-state", Port: server.port}, successCallback)
	if !errors.Is(err, ErrBridgeUnavailable) {
		t.Fatalf("duplicate acquire error = %v", err)
	}
	_, err = Acquire(ctx, server.socket, AcquireRequest{Provider: "unknown", State: "other-state", Port: server.port}, successCallback)
	if !errors.Is(err, ErrBridgeUnavailable) {
		t.Fatalf("unknown provider error = %v", err)
	}
	_, err = Acquire(ctx, server.socket, AcquireRequest{Provider: "codex", State: "../invalid", Port: server.port}, successCallback)
	if !errors.Is(err, ErrBridgeUnavailable) {
		t.Fatalf("invalid state error = %v", err)
	}
	if status := callbackRequest(t, server.port, "unknown-state", "code"); status != http.StatusConflict {
		t.Fatalf("unknown callback status = %d", status)
	}
	if status := callbackRequest(t, server.port, "valid-state", "code"); status != http.StatusOK {
		t.Fatalf("valid callback status = %d", status)
	}
}

func TestBridgeReleasesLeaseOnEOFDeadlineAndServerCancellation(t *testing.T) {
	t.Run("client EOF", func(t *testing.T) {
		server := startTestBridge(t, 2*time.Second)
		lease := acquireTestLease(t, server, "eof-state", successCallback)
		if err := lease.Close(); err != nil {
			t.Fatalf("close lease: %v", err)
		}
		waitForPortState(t, server.port, true)
	})
	t.Run("deadline", func(t *testing.T) {
		server := startTestBridge(t, 75*time.Millisecond)
		lease := acquireTestLease(t, server, "ttl-state", successCallback)
		select {
		case <-lease.Done():
		case <-time.After(time.Second):
			t.Fatal("lease deadline did not close connection")
		}
		if lease.Err() == nil {
			t.Fatal("deadline closure did not surface an error")
		}
		waitForPortState(t, server.port, true)
	})
	t.Run("server cancellation", func(t *testing.T) {
		server := startTestBridge(t, 2*time.Second)
		lease := acquireTestLease(t, server, "cancel-state", successCallback)
		server.cancel()
		select {
		case <-lease.Done():
		case <-time.After(time.Second):
			t.Fatal("server cancellation did not close lease")
		}
		if lease.Err() == nil {
			t.Fatal("server cancellation did not surface an error")
		}
		waitForPortState(t, server.port, true)
	})
}

func TestBridgeReportsPortCollisionWithoutClosingExistingListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	server := startTestBridgeAtPort(t, port, 2*time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err = Acquire(ctx, server.socket, AcquireRequest{Provider: "codex", State: "collision-state", Port: port}, successCallback)

	if !errors.Is(err, ErrPortInUse) {
		t.Fatalf("acquire error = %v, want ErrPortInUse", err)
	}
	connection, err := net.DialTimeout("tcp", listener.Addr().String(), time.Second)
	if err != nil {
		t.Fatalf("existing listener was disturbed: %v", err)
	}
	_ = connection.Close()
}

func TestBridgeRefusesToReplaceRegularSocketPath(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.sock")
	if err := os.WriteFile(path, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}

	err := Serve(context.Background(), ServerConfig{SocketPath: path, BindIP: "127.0.0.1", ProviderPorts: map[string]int{"codex": freePort(t)}, LeaseTTL: time.Second})

	if err == nil || !strings.Contains(err.Error(), "refusing to replace non-socket") {
		t.Fatalf("Serve error = %v", err)
	}
	data, readErr := os.ReadFile(path)
	if readErr != nil || string(data) != "keep" {
		t.Fatalf("regular file changed: data=%q err=%v", data, readErr)
	}
}

func TestBridgeLogsDoNotContainOAuthStateOrCode(t *testing.T) {
	originalOutput := log.StandardLogger().Out
	originalLevel := log.GetLevel()
	var output lockedBuffer
	log.SetOutput(&output)
	log.SetLevel(log.InfoLevel)
	t.Cleanup(func() {
		log.SetOutput(originalOutput)
		log.SetLevel(originalLevel)
	})

	server := startTestBridge(t, 2*time.Second)
	lease := acquireTestLease(t, server, "secret-state", successCallback)
	if status := callbackRequest(t, server.port, "secret-state", "secret-code"); status != http.StatusOK {
		t.Fatalf("callback status = %d", status)
	}
	_ = lease.Close()

	logs := output.String()
	if strings.Contains(logs, "secret-state") || strings.Contains(logs, "secret-code") {
		t.Fatalf("logs exposed OAuth material: %s", logs)
	}
}

type testBridge struct {
	socket string
	port   int
	cancel context.CancelFunc
}

func startTestBridge(t *testing.T, ttl time.Duration) testBridge {
	t.Helper()
	return startTestBridgeAtPort(t, freePort(t), ttl)
}

func startTestBridgeAtPort(t *testing.T, port int, ttl time.Duration) testBridge {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	socket := filepath.Join(t.TempDir(), "bridge.sock")
	done := make(chan error, 1)
	go func() {
		done <- Serve(ctx, ServerConfig{SocketPath: socket, BindIP: "127.0.0.1", ProviderPorts: map[string]int{"codex": port}, LeaseTTL: ttl})
	}()
	deadline := time.Now().Add(time.Second)
	for {
		if info, err := os.Stat(socket); err == nil && info.Mode()&os.ModeSocket != 0 {
			break
		}
		if time.Now().After(deadline) {
			cancel()
			t.Fatal("bridge socket was not created")
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Cleanup(func() {
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Errorf("Serve returned error: %v", err)
			}
		case <-time.After(time.Second):
			t.Error("Serve did not stop")
		}
	})
	return testBridge{socket: socket, port: port, cancel: cancel}
}

func acquireTestLease(t *testing.T, server testBridge, state string, handler CallbackHandler) *Lease {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	lease, err := Acquire(ctx, server.socket, AcquireRequest{Provider: "codex", State: state, Port: server.port}, handler)
	if err != nil {
		t.Fatalf("Acquire failed: %v", err)
	}
	return lease
}

func successCallback(_ context.Context, _ Callback) CallbackResult {
	return CallbackResult{Status: http.StatusOK}
}

func callbackRequest(t *testing.T, port int, state, code string) int {
	t.Helper()
	values := url.Values{"state": {state}, "code": {code}}
	response, err := http.PostForm(fmt.Sprintf("http://127.0.0.1:%d/callback", port), values)
	if err != nil {
		t.Fatalf("callback POST failed: %v", err)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	return response.StatusCode
}

func freePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	_ = listener.Close()
	return port
}

func assertPortState(t *testing.T, port int, wantFree bool) {
	t.Helper()
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if wantFree {
		if err != nil {
			t.Fatalf("port %d is busy: %v", port, err)
		}
		_ = listener.Close()
		return
	}
	if err == nil {
		_ = listener.Close()
		t.Fatalf("port %d is free", port)
	}
}

func waitForPortState(t *testing.T, port int, wantFree bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		free := err == nil
		if listener != nil {
			_ = listener.Close()
		}
		if free == wantFree {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("port %d free=%t, want %t", port, free, wantFree)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestProtocolFramesUseExactWireShape(t *testing.T) {
	tests := []struct {
		name  string
		frame any
		want  string
	}{
		{
			name:  "acquire",
			frame: AcquireRequest{Version: 1, Type: "acquire", Provider: "codex", State: "opaque-state", Port: 1455},
			want:  `{"version":1,"type":"acquire","provider":"codex","state":"opaque-state","port":1455}` + "\n",
		},
		{name: "ready", frame: readyFrame{Version: 1, Type: "ready"}, want: `{"version":1,"type":"ready"}` + "\n"},
		{name: "error", frame: errorFrame{Version: 1, Type: "error", Code: "port_in_use", Error: "safe message"}, want: `{"version":1,"type":"error","code":"port_in_use","error":"safe message"}` + "\n"},
		{name: "callback", frame: callbackFrame{Version: 1, Type: "callback", State: "opaque-state", Code: "code", Error: ""}, want: `{"version":1,"type":"callback","state":"opaque-state","code":"code","error":""}` + "\n"},
		{name: "callback result", frame: callbackResultFrame{Version: 1, Type: "callback_result", Status: 200, Error: ""}, want: `{"version":1,"type":"callback_result","status":200,"error":""}` + "\n"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer

			if err := writeFrame(&output, test.frame); err != nil {
				t.Fatalf("writeFrame failed: %v", err)
			}

			if output.String() != test.want {
				t.Fatalf("frame = %q, want %q", output.String(), test.want)
			}
		})
	}
}

type lockedBuffer struct {
	mu     sync.Mutex
	buffer bytes.Buffer
}

func (b *lockedBuffer) Write(payload []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buffer.Write(payload)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buffer.String()
}
