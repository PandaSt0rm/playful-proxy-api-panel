package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/oauthbridge"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	socketPath := os.Getenv("AIPROXY_OAUTH_BRIDGE_SOCKET")
	if socketPath == "" {
		socketPath = oauthbridge.DefaultSocketPath
	}
	bindIP := os.Getenv("AIPROXY_BIND_IP")
	if bindIP == "" {
		bindIP = "127.0.0.1"
	}

	if err := oauthbridge.Serve(ctx, oauthbridge.ServerConfig{
		SocketPath: socketPath,
		BindIP:     bindIP,
		ProviderPorts: map[string]int{
			"codex":       1455,
			"anthropic":   54545,
			"antigravity": 51121,
		},
		LeaseTTL: 6 * time.Minute,
	}); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "oauth callback bridge failed: %v\n", err)
		os.Exit(1)
	}
}
