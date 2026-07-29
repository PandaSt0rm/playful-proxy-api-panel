package adapter

import (
	"context"

	management "github.com/router-for-me/CLIProxyAPI/v7/internal/api/handlers/management"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/syncstate"
)

type ConfigRepository struct {
	Handler *management.Handler
}

func (a ConfigRepository) Snapshot(ctx context.Context) (*config.Config, error) {
	return a.Handler.Snapshot(ctx)
}

func (a ConfigRepository) ReadYAML(ctx context.Context) ([]byte, string, error) {
	return a.Handler.ReadYAML(ctx)
}

func (a ConfigRepository) CompareAndSwapYAML(ctx context.Context, yaml []byte, expected string) (config.YAMLMutation, error) {
	return a.Handler.CompareAndSwapYAML(ctx, yaml, expected)
}

type SyncStateRepository struct {
	Handler *management.Handler
}

func (a SyncStateRepository) Snapshot() map[string]syncstate.HostReport {
	return a.Handler.SyncStateSnapshot()
}

type ModelCatalog struct{}

func (ModelCatalog) Count() int {
	return len(registry.GetGlobalRegistry().GetAvailableModels("openai"))
}
