// Package main provides the upstream-compatible CLIProxyAPI entrypoint.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/bootstrap"
)

var (
	Version           = "dev"
	Commit            = "none"
	BuildDate         = "unknown"
	DefaultConfigPath = ""
)

func main() {
	err := bootstrap.Run(context.Background(), os.Args[1:], bootstrap.RunOptions{
		BuildInfo: bootstrap.BuildInfo{
			Version:   Version,
			Commit:    Commit,
			BuildDate: BuildDate,
		},
		DefaultConfigPath: DefaultConfigPath,
	})
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
