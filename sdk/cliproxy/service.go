// Package cliproxy provides the core service implementation for the CLI Proxy API.
// It includes service lifecycle management, authentication handling, file watching,
// and integration with various AI service providers through a unified interface.
package cliproxy

import (
	"context"
	"strings"

	"sync"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/api"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/home"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/homeplugins"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/pluginhost"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/thinking"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/watcher"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/wsrelay"
	sdkaccess "github.com/router-for-me/CLIProxyAPI/v7/sdk/access"
	sdkAuth "github.com/router-for-me/CLIProxyAPI/v7/sdk/auth"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	"github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executionregistry"
	"github.com/router-for-me/CLIProxyAPI/v7/sdk/config"
	sdkpluginstore "github.com/router-for-me/CLIProxyAPI/v7/sdk/pluginstore"
)

// Service wraps the proxy server lifecycle so external programs can embed the CLI proxy.
// It manages the complete lifecycle including authentication, file watching, HTTP server,
// and integration with various AI service providers.
type Service struct {
	// cfg holds the current application configuration.
	cfg *config.Config

	// cfgMu protects concurrent access to the configuration.
	cfgMu sync.RWMutex

	// configUpdateMu serializes config updates across watcher + home.
	configUpdateMu sync.Mutex

	// configRuntimeMu orders side-effecting runtime application after config commits.
	configRuntimeMu        sync.Mutex
	executorRegistrationMu sync.Mutex
	configSequence         uint64
	appliedRoutingState    *routingRuntimeState

	// configPath is the path to the configuration file.
	configPath string

	// tokenProvider handles loading token-based clients.
	tokenProvider TokenClientProvider

	// apiKeyProvider handles loading API key-based clients.
	apiKeyProvider APIKeyClientProvider

	// watcherFactory creates file watcher instances.
	watcherFactory WatcherFactory

	// hooks provides lifecycle callbacks.
	hooks Hooks

	// serverOptions contains additional server configuration options.
	serverOptions []api.ServerOption

	// server is the HTTP API server instance.
	server *api.Server

	// pprofServer manages the optional pprof HTTP debug server.
	pprofServer *pprofServer

	// serverErr channel for server startup/shutdown errors.
	serverErr chan error

	// watcher handles file system monitoring.
	watcher *WatcherWrapper

	// watcherCancel cancels the watcher context.
	watcherCancel context.CancelFunc

	// authUpdates channel for authentication updates.
	authUpdates chan watcher.AuthUpdate

	// authQueueStop cancels the auth update queue processing.
	authQueueStop context.CancelFunc

	// authManager handles legacy authentication operations.
	authManager *sdkAuth.Manager

	// accessManager handles request authentication providers.
	accessManager *sdkaccess.Manager

	// coreManager handles core authentication and execution.
	coreManager *coreauth.Manager

	// cooldownStateStore persists runtime cooldown state when enabled.
	cooldownStateStore coreauth.CooldownStateStore

	// pluginHost owns dynamic plugin lifecycle and runtime capability adapters.
	pluginHost *pluginhost.Host

	// shutdownOnce ensures shutdown is called only once.
	shutdownOnce sync.Once

	// wsGateway manages websocket Gemini providers.
	wsGateway *wsrelay.Manager

	homeLifecycleMu              sync.Mutex
	homeOwnershipMu              sync.Mutex
	homeConfigCommitMu           sync.Mutex
	homeConfigStageHook          func()
	homeConfigCommitHook         func()
	homeConfigRuntimeHook        func()
	applyPprofConfigContextFn    func(context.Context, *config.Config) bool
	updateServerClientsContextFn func(context.Context, *config.Config) bool
	homeSupervisor               *homeSubscriberSupervisor
	homeMu                       sync.Mutex
	homeGeneration               uint64
	homeClient                   *home.Client
	homeRegistry                 *executionregistry.Registry
	homeDispatchBundle           *coreauth.HomeDispatchBundle
	homeDrainBound               time.Duration
	homeCancel                   context.CancelFunc
	runCancel                    context.CancelFunc
	homeLogForwarder             homeLogForwarder
	homeLogForwarderClient       *home.Client
	homePluginSyncMu             sync.Mutex
	homePluginSyncKey            string
	homePluginSyncFetch          func(context.Context, sdkpluginstore.PluginSyncRequest) (sdkpluginstore.PluginSyncResponse, error)
	homePluginDeleteTask         func(context.Context, *config.Config, home.PluginTask) homeplugins.SyncReport
}

// AuthManager returns the runtime authentication manager used for exact-credential diagnostics.
func (s *Service) AuthManager() *coreauth.Manager {
	if s == nil {
		return nil
	}
	return s.coreManager
}

func applyAutomaticThinkingAliases(models []*ModelInfo, excluded []string) []*ModelInfo {
	if len(models) == 0 {
		return models
	}

	out := make([]*ModelInfo, 0, len(models)*2)
	seen := make(map[string]struct{}, len(models)*2)
	originalIDs := make(map[string]struct{}, len(models))
	for _, model := range models {
		if model == nil {
			continue
		}
		id := strings.ToLower(strings.TrimSpace(model.ID))
		if id != "" {
			originalIDs[id] = struct{}{}
		}
	}
	addModel := func(model *ModelInfo) bool {
		if model == nil {
			return false
		}
		id := strings.TrimSpace(model.ID)
		if id == "" {
			return false
		}
		key := strings.ToLower(id)
		if _, exists := seen[key]; exists {
			return false
		}
		seen[key] = struct{}{}
		out = append(out, model)
		return true
	}

	for _, model := range models {
		if !addModel(model) || model == nil || model.Thinking == nil || len(model.Thinking.Levels) == 0 {
			continue
		}
		baseID := strings.TrimSpace(model.ID)
		for _, level := range thinking.AliasLevels(model.Thinking) {
			aliasID := baseID + "-" + string(level)
			if modelExcluded(aliasID, excluded) {
				continue
			}
			aliasKey := strings.ToLower(aliasID)
			if _, exists := originalIDs[aliasKey]; exists {
				continue
			}
			if _, exists := seen[aliasKey]; exists {
				continue
			}
			clone := *model
			clone.ID = aliasID
			clone.DisplayName = strings.TrimSpace(model.DisplayName)
			if clone.DisplayName == "" {
				clone.DisplayName = baseID
			}
			clone.DisplayName += " " + strings.ToUpper(string(level))
			if clone.Name != "" {
				clone.Name = rewriteModelInfoName(clone.Name, baseID, aliasID)
			}
			clone.ThinkingAliasBase = baseID
			addModel(&clone)
		}
	}
	return out
}

func thinkingLevelSupported(support *registry.ThinkingSupport, level string) bool {
	if support == nil {
		return false
	}
	for _, candidate := range support.Levels {
		if strings.EqualFold(strings.TrimSpace(candidate), level) {
			return true
		}
	}
	return false
}

func modelExcluded(modelID string, excluded []string) bool {
	modelID = strings.ToLower(strings.TrimSpace(modelID))
	if modelID == "" || len(excluded) == 0 {
		return false
	}
	for _, pattern := range excluded {
		if matchWildcard(strings.ToLower(strings.TrimSpace(pattern)), modelID) {
			return true
		}
	}
	return false
}
