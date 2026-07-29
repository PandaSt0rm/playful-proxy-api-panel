package main

import (
	"context"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/adapter"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/control"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/controlstore"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/api"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/bootstrap"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/providerprobe"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/usage"
	log "github.com/sirupsen/logrus"
)

func productFactory(ctx context.Context, bindings bootstrap.RuntimeBindings) api.ManagementExtensionRegistrar {
	storePath := controlstore.ResolvePath("config.yaml")
	store, storeErr := controlstore.Open(ctx, storePath)
	if storeErr != nil {
		log.WithError(storeErr).WithField("path", storePath).Error("AIPROXY control store unavailable")
	}
	repository := adapter.ConfigRepository{Handler: bindings.Management}
	registrar := control.New(control.Dependencies{
		Config:     repository,
		Runtime:    bindings.Service,
		SyncState:  adapter.SyncStateRepository{Handler: bindings.Management},
		Models:     adapter.ModelCatalog{},
		Probe:      providerprobe.New(bindings.Service.AuthManager(), registry.GetGlobalRegistry()),
		Store:      store,
		Usage:      usage.GetEventStore(),
		StoreError: storeErr,
	})
	bindings.Management.SetConfigMutationObserver(adapter.MutationObserver{Recorder: registrar})
	return registrar
}
