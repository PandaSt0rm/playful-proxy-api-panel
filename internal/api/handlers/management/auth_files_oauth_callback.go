package management

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/oauthbridge"
	log "github.com/sirupsen/logrus"
)

const (
	anthropicCallbackPort = 54545
	codexCallbackPort     = 1455
)

type callbackForwarder struct {
	provider    string
	server      *http.Server
	done        chan struct{}
	bridgeLease *oauthbridge.Lease
}

func isWebUIRequest(c *gin.Context) bool {
	raw := strings.TrimSpace(c.Query("is_webui"))
	if raw == "" {
		return false
	}
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func startCallbackForwarder(port int, provider, state, authDir string) (*callbackForwarder, error) {
	handler := func(_ context.Context, callback oauthbridge.Callback) oauthbridge.CallbackResult {
		return persistForwardedOAuthCallback(provider, authDir, callback)
	}
	if socketPath := os.Getenv("AIPROXY_OAUTH_BRIDGE_SOCKET"); socketPath != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		lease, err := oauthbridge.Acquire(ctx, socketPath, oauthbridge.AcquireRequest{
			Provider: provider,
			State:    state,
			Port:     port,
		}, handler)
		if err != nil {
			return nil, err
		}
		forwarder := &callbackForwarder{provider: provider, bridgeLease: lease, done: make(chan struct{})}
		go func() {
			<-lease.Done()
			close(forwarder.done)
			if lease.Err() != nil && !lease.CallbackDelivered() && IsOAuthSessionPending(state, provider) {
				SetOAuthSessionError(state, "OAuth callback bridge stopped")
			}
		}()
		return forwarder, nil
	}

	callbackForwardersMu.Lock()
	prev := callbackForwarders[port]
	if prev != nil {
		delete(callbackForwarders, port)
	}
	callbackForwardersMu.Unlock()

	if prev != nil {
		stopForwarderInstance(port, prev)
	}

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		if errors.Is(err, syscall.EADDRINUSE) {
			return nil, fmt.Errorf("%w: %v", oauthbridge.ErrPortInUse, err)
		}
		return nil, fmt.Errorf("failed to listen on %s: %w", addr, err)
	}

	srv := &http.Server{
		Handler:           oauthbridge.NewCallbackHTTPHandler(handler),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      5 * time.Second,
	}
	done := make(chan struct{})

	go func() {
		if errServe := srv.Serve(ln); errServe != nil && !errors.Is(errServe, http.ErrServerClosed) {
			log.WithError(errServe).Warnf("callback forwarder for %s stopped unexpectedly", provider)
		}
		close(done)
	}()

	forwarder := &callbackForwarder{
		provider: provider,
		server:   srv,
		done:     done,
	}

	callbackForwardersMu.Lock()
	callbackForwarders[port] = forwarder
	callbackForwardersMu.Unlock()

	log.Infof("callback forwarder for %s listening on %s", provider, addr)
	return forwarder, nil
}

func newCallbackForwarderHandler(provider, authDir string) http.Handler {
	return oauthbridge.NewCallbackHTTPHandler(func(_ context.Context, callback oauthbridge.Callback) oauthbridge.CallbackResult {
		return persistForwardedOAuthCallback(provider, authDir, callback)
	})
}

func persistForwardedOAuthCallback(provider, authDir string, callback oauthbridge.Callback) oauthbridge.CallbackResult {
	canonicalProvider, err := NormalizeOAuthProvider(provider)
	if err != nil {
		canonicalProvider = strings.ToLower(strings.TrimSpace(provider))
	}
	if _, err = WriteOAuthCallbackFileForPendingSession(authDir, canonicalProvider, callback.State, callback.Code, callback.Error); err != nil {
		log.WithError(err).Warnf("failed to persist %s oauth callback", canonicalProvider)
		if errors.Is(err, errOAuthSessionNotPending) {
			return oauthbridge.CallbackResult{Status: http.StatusConflict, Error: "oauth flow is not pending"}
		}
		return oauthbridge.CallbackResult{Status: http.StatusInternalServerError, Error: "failed to persist oauth callback"}
	}
	return oauthbridge.CallbackResult{Status: http.StatusOK}
}

func stopCallbackForwarderInstance(port int, forwarder *callbackForwarder) {
	if forwarder == nil {
		return
	}
	callbackForwardersMu.Lock()
	if current := callbackForwarders[port]; current == forwarder {
		delete(callbackForwarders, port)
	}
	callbackForwardersMu.Unlock()

	stopForwarderInstance(port, forwarder)
}

func stopForwarderInstance(port int, forwarder *callbackForwarder) {
	if forwarder == nil {
		return
	}
	if forwarder.bridgeLease != nil {
		if err := forwarder.bridgeLease.Close(); err != nil {
			log.WithError(err).Warnf("failed to close callback bridge lease on port %d", port)
		}
		log.Infof("callback forwarder on port %d stopped", port)
		return
	}
	if forwarder.server == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := forwarder.server.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.WithError(err).Warnf("failed to shut down callback forwarder on port %d", port)
	}

	select {
	case <-forwarder.done:
	case <-time.After(2 * time.Second):
	}

	log.Infof("callback forwarder on port %d stopped", port)
}

func (h *Handler) startWebUICallbackForwarder(c *gin.Context, port int, provider, state string) (*callbackForwarder, bool) {
	if !isWebUIRequest(c) {
		return nil, true
	}
	forwarder, err := startCallbackForwarder(port, provider, state, h.cfg.AuthDir)
	if err == nil {
		return forwarder, true
	}

	CancelOAuthSession(state)
	log.WithError(err).Errorf("failed to start %s callback forwarder", provider)
	if errors.Is(err, oauthbridge.ErrPortInUse) {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("OAuth callback port %d is already in use on the host", port)})
		return nil, false
	}
	c.JSON(http.StatusServiceUnavailable, gin.H{"error": "OAuth callback bridge is unavailable"})
	return nil, false
}

func (h *Handler) managementCallbackURL(path string) (string, error) {
	if h == nil || h.cfg == nil || h.cfg.Port <= 0 {
		return "", fmt.Errorf("server port is not configured")
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	scheme := "http"
	if h.cfg.TLS.Enable {
		scheme = "https"
	}
	return fmt.Sprintf("%s://127.0.0.1:%d%s", scheme, h.cfg.Port, path), nil
}

func pluginAuthProviderFromPath(path string) (string, bool) {
	path = strings.TrimSpace(path)
	const prefix = "/v0/management/"
	const suffix = "-auth-url"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	provider := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" {
		return "", false
	}
	for _, r := range provider {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= '0' && r <= '9':
		case r == '-':
		default:
			return "", false
		}
	}
	return provider, true
}

func (h *Handler) ServePluginAuthURL(c *gin.Context) bool {
	if h == nil || c == nil || c.Request == nil || c.Request.URL == nil {
		return false
	}
	h.mu.Lock()
	host := h.pluginHost
	h.mu.Unlock()
	if host == nil {
		return false
	}
	provider, ok := pluginAuthProviderFromPath(c.Request.URL.Path)
	if !ok || !host.HasAuthProvider(provider) {
		return false
	}

	ctx := PopulateAuthContext(context.Background(), c)
	baseURL, errBaseURL := h.managementCallbackURL("/v0/management/oauth-callback")
	if errBaseURL != nil {
		log.WithError(errBaseURL).Error("failed to compute plugin auth callback URL")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate authorization url"})
		return true
	}
	resp, handled, errStart := host.StartLogin(ctx, provider, baseURL)
	if !handled {
		return false
	}
	if errStart != nil {
		log.WithError(errStart).Error("failed to start plugin auth login")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate authorization url"})
		return true
	}
	state := strings.TrimSpace(resp.State)
	if state == "" {
		log.WithField("provider", provider).Error("plugin auth provider returned empty state")
		c.JSON(http.StatusBadGateway, gin.H{"error": "invalid oauth state"})
		return true
	}
	if errState := ValidateOAuthState(state); errState != nil {
		log.WithError(errState).WithField("provider", provider).Error("plugin auth provider returned invalid state")
		c.JSON(http.StatusBadGateway, gin.H{"error": "invalid oauth state"})
		return true
	}
	if errRegister := RegisterPluginOAuthSession(state, provider, resp.Metadata); errRegister != nil {
		log.WithError(errRegister).WithField("provider", provider).Error("failed to register plugin oauth session")
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to generate authorization url"})
		return true
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "url": resp.URL, "state": state})
	return true
}
