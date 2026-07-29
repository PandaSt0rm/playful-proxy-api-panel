package oauthbridge

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	log "github.com/sirupsen/logrus"
)

const callbackAcknowledgementTimeout = 5 * time.Second

var errInvalidAcquireRequest = errors.New("invalid acquire request")

type ServerConfig struct {
	SocketPath    string
	BindIP        string
	ProviderPorts map[string]int
	LeaseTTL      time.Duration
}

type bridgeServer struct {
	config      ServerConfig
	mu          sync.Mutex
	providers   map[string]*providerListener
	states      map[string]*serverLease
	connections map[*serverLease]struct{}
}

type providerListener struct {
	provider string
	port     int
	listener net.Listener
	server   *http.Server
	states   map[string]*serverLease
}

type serverLease struct {
	bridge      *bridgeServer
	provider    string
	port        int
	state       string
	conn        net.Conn
	reader      *bufio.Reader
	writeMu     sync.Mutex
	transaction chan struct{}
	results     chan CallbackResult
	done        chan struct{}
	closeOnce   sync.Once
	awaiting    atomic.Bool
}

func Serve(ctx context.Context, config ServerConfig) error {
	if config.SocketPath == "" {
		config.SocketPath = DefaultSocketPath
	}
	if config.BindIP == "" {
		config.BindIP = "127.0.0.1"
	}
	if len(config.ProviderPorts) == 0 {
		return fmt.Errorf("provider ports are required")
	}
	if config.LeaseTTL <= 0 {
		return fmt.Errorf("lease TTL must be positive")
	}

	listener, err := listenUnixSocket(config.SocketPath)
	if err != nil {
		return err
	}
	defer func() {
		_ = listener.Close()
		_ = os.Remove(config.SocketPath)
	}()

	bridge := &bridgeServer{
		config:      config,
		providers:   make(map[string]*providerListener),
		states:      make(map[string]*serverLease),
		connections: make(map[*serverLease]struct{}),
	}
	defer bridge.closeAll()
	cancelled := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = listener.Close()
			bridge.closeAll()
		case <-cancelled:
		}
	}()
	defer close(cancelled)

	log.WithFields(log.Fields{"event": "oauth_bridge_started"}).Info("oauth callback bridge started")
	for {
		conn, errAccept := listener.Accept()
		if errAccept != nil {
			if ctx.Err() != nil || errors.Is(errAccept, net.ErrClosed) {
				return nil
			}
			return fmt.Errorf("accept oauth bridge connection: %w", errAccept)
		}
		go bridge.handleConnection(conn)
	}
}

func listenUnixSocket(path string) (net.Listener, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create oauth bridge socket directory: %w", err)
	}
	if info, err := os.Lstat(path); err == nil {
		if info.Mode()&os.ModeSocket == 0 {
			return nil, fmt.Errorf("refusing to replace non-socket path %s", path)
		}
		if err = os.Remove(path); err != nil {
			return nil, fmt.Errorf("remove stale oauth bridge socket: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("inspect oauth bridge socket: %w", err)
	}
	listener, err := net.Listen("unix", path)
	if err != nil {
		return nil, fmt.Errorf("listen on oauth bridge socket: %w", err)
	}
	if err = os.Chmod(path, 0o600); err != nil {
		_ = listener.Close()
		_ = os.Remove(path)
		return nil, fmt.Errorf("secure oauth bridge socket: %w", err)
	}
	return listener, nil
}

func (b *bridgeServer) handleConnection(conn net.Conn) {
	reader := bufio.NewReaderSize(conn, maxFrameSize+1)
	var request AcquireRequest
	if err := readFrame(reader, &request); err != nil {
		b.writeAcquireError(conn, "invalid_request", "invalid acquire request")
		_ = conn.Close()
		return
	}
	request.State = strings.TrimSpace(request.State)
	if err := b.validateAcquire(request); err != nil {
		b.writeAcquireError(conn, "invalid_request", "invalid acquire request")
		_ = conn.Close()
		return
	}

	lease, err := b.acquire(conn, reader, request)
	if err != nil {
		code := "internal"
		message := "failed to acquire callback listener"
		switch {
		case errors.Is(err, ErrPortInUse):
			code = "port_in_use"
			message = "oauth callback port is already in use"
		case errors.Is(err, errInvalidAcquireRequest):
			code = "invalid_request"
			message = "invalid acquire request"
		}
		b.writeAcquireError(conn, code, message)
		_ = conn.Close()
		return
	}
	if err = lease.write(readyFrame{Version: ProtocolVersion, Type: "ready"}); err != nil {
		b.terminate(lease, "ready_write_failed")
		return
	}
	lease.readControl()
}

func (b *bridgeServer) validateAcquire(request AcquireRequest) error {
	if request.Version != ProtocolVersion || request.Type != "acquire" {
		return errors.New("invalid protocol")
	}
	port, ok := b.config.ProviderPorts[request.Provider]
	if !ok || request.Port != port {
		return errors.New("invalid provider port")
	}
	return validateState(request.State)
}

func validateState(state string) error {
	if state == "" || len(state) > 128 || strings.Contains(state, "/") || strings.Contains(state, "\\") || strings.Contains(state, "..") {
		return errors.New("invalid state")
	}
	for _, character := range state {
		switch {
		case character >= 'a' && character <= 'z':
		case character >= 'A' && character <= 'Z':
		case character >= '0' && character <= '9':
		case character == '-' || character == '_' || character == '.':
		default:
			return errors.New("invalid state")
		}
	}
	return nil
}

func (b *bridgeServer) acquire(conn net.Conn, reader *bufio.Reader, request AcquireRequest) (*serverLease, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, exists := b.states[request.State]; exists {
		return nil, errInvalidAcquireRequest
	}

	provider := b.providers[request.Provider]
	if provider == nil {
		address := net.JoinHostPort(b.config.BindIP, fmt.Sprintf("%d", request.Port))
		listener, err := net.Listen("tcp", address)
		if err != nil {
			if errors.Is(err, syscall.EADDRINUSE) {
				return nil, fmt.Errorf("%w: %v", ErrPortInUse, err)
			}
			return nil, fmt.Errorf("listen on callback port: %w", err)
		}
		provider = &providerListener{
			provider: request.Provider,
			port:     request.Port,
			listener: listener,
			states:   make(map[string]*serverLease),
		}
		provider.server = &http.Server{
			Handler: NewCallbackHTTPHandler(func(ctx context.Context, callback Callback) CallbackResult {
				return b.dispatch(ctx, provider.provider, callback)
			}),
			ReadHeaderTimeout: 5 * time.Second,
			WriteTimeout:      10 * time.Second,
		}
		b.providers[request.Provider] = provider
		go func() {
			if errServe := provider.server.Serve(listener); errServe != nil && !errors.Is(errServe, http.ErrServerClosed) && !errors.Is(errServe, net.ErrClosed) {
				log.WithFields(log.Fields{"event": "oauth_bridge_listener_stopped", "provider": provider.provider, "port": provider.port, "error_code": "serve_failed"}).Warn("oauth callback listener stopped")
			}
		}()
	}

	lease := &serverLease{
		bridge:      b,
		provider:    request.Provider,
		port:        request.Port,
		state:       request.State,
		conn:        conn,
		reader:      reader,
		transaction: make(chan struct{}, 1),
		results:     make(chan CallbackResult),
		done:        make(chan struct{}),
	}
	provider.states[request.State] = lease
	b.states[request.State] = lease
	b.connections[lease] = struct{}{}
	_ = conn.SetReadDeadline(time.Now().Add(b.config.LeaseTTL))
	b.logLeaseEventLocked(provider, "oauth_bridge_lease_acquired", "")
	return lease, nil
}

func (b *bridgeServer) dispatch(ctx context.Context, provider string, callback Callback) CallbackResult {
	b.mu.Lock()
	lease := b.states[callback.State]
	if lease == nil || lease.provider != provider {
		b.mu.Unlock()
		return CallbackResult{Status: http.StatusConflict, Error: "oauth flow is not pending"}
	}
	b.mu.Unlock()

	select {
	case lease.transaction <- struct{}{}:
		defer func() { <-lease.transaction }()
	default:
		return CallbackResult{Status: http.StatusConflict, Error: "oauth callback is already being processed"}
	}
	if !b.isActive(lease) {
		return CallbackResult{Status: http.StatusConflict, Error: "oauth flow is not pending"}
	}

	lease.awaiting.Store(true)
	defer lease.awaiting.Store(false)
	if err := lease.write(callbackFrame{Version: ProtocolVersion, Type: "callback", State: callback.State, Code: callback.Code, Error: callback.Error}); err != nil {
		b.terminate(lease, "callback_write_failed")
		return CallbackResult{Status: http.StatusInternalServerError, Error: "oauth callback bridge failed"}
	}

	timer := time.NewTimer(callbackAcknowledgementTimeout)
	defer timer.Stop()
	select {
	case result := <-lease.results:
		if result.Status == http.StatusOK || result.Status == http.StatusConflict {
			b.releaseState(lease, "oauth_bridge_callback_acknowledged")
		}
		return result
	case <-lease.done:
		return CallbackResult{Status: http.StatusInternalServerError, Error: "oauth callback bridge failed"}
	case <-timer.C:
		b.terminate(lease, "callback_ack_timeout")
		return CallbackResult{Status: http.StatusInternalServerError, Error: "oauth callback bridge timed out"}
	case <-ctx.Done():
		b.terminate(lease, "callback_request_cancelled")
		return CallbackResult{Status: http.StatusInternalServerError, Error: "oauth callback request cancelled"}
	}
}

func (lease *serverLease) readControl() {
	defer lease.bridge.terminate(lease, "control_connection_closed")
	for {
		var resultFrame frame
		if err := readFrame(lease.reader, &resultFrame); err != nil {
			return
		}
		if resultFrame.Version != ProtocolVersion || resultFrame.Type != "callback_result" || !lease.awaiting.Load() {
			return
		}
		result := CallbackResult{Status: resultFrame.Status, Error: resultFrame.Error}
		select {
		case lease.results <- result:
		case <-lease.done:
			return
		}
	}
}

func (lease *serverLease) write(value any) error {
	lease.writeMu.Lock()
	defer lease.writeMu.Unlock()
	return writeFrame(lease.conn, value)
}

func (b *bridgeServer) isActive(lease *serverLease) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.states[lease.state] == lease
}

func (b *bridgeServer) releaseState(lease *serverLease, event string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.states[lease.state] != lease {
		return
	}
	delete(b.states, lease.state)
	provider := b.providers[lease.provider]
	if provider == nil {
		return
	}
	delete(provider.states, lease.state)
	b.logLeaseEventLocked(provider, event, "")
	if len(provider.states) == 0 {
		_ = provider.listener.Close()
		delete(b.providers, lease.provider)
	}
}

func (b *bridgeServer) terminate(lease *serverLease, errorCode string) {
	lease.closeOnce.Do(func() {
		b.releaseState(lease, "oauth_bridge_lease_released")
		b.mu.Lock()
		delete(b.connections, lease)
		b.mu.Unlock()
		_ = lease.conn.Close()
		close(lease.done)
		if errorCode != "" {
			log.WithFields(log.Fields{"event": "oauth_bridge_connection_closed", "provider": lease.provider, "port": lease.port, "error_code": errorCode}).Info("oauth callback bridge connection closed")
		}
	})
}

func (b *bridgeServer) closeAll() {
	b.mu.Lock()
	leases := make([]*serverLease, 0, len(b.connections))
	for lease := range b.connections {
		leases = append(leases, lease)
	}
	b.mu.Unlock()
	for _, lease := range leases {
		b.terminate(lease, "server_stopped")
	}
}

func (b *bridgeServer) writeAcquireError(conn net.Conn, code, message string) {
	_ = writeFrame(conn, errorFrame{Version: ProtocolVersion, Type: "error", Code: code, Error: message})
	log.WithFields(log.Fields{"event": "oauth_bridge_acquire_failed", "error_code": code}).Warn("oauth callback bridge acquisition failed")
}

func (b *bridgeServer) logLeaseEventLocked(provider *providerListener, event, errorCode string) {
	fields := log.Fields{"event": event, "provider": provider.provider, "port": provider.port, "active_count": len(provider.states)}
	if errorCode != "" {
		fields["error_code"] = errorCode
	}
	log.WithFields(fields).Info("oauth callback bridge lease changed")
}
