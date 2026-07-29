package providerprobe

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/port"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/util"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
)

var ErrUnsupported = errors.New("provider probe unsupported")
var ErrTargetNotFound = errors.New("provider probe target not found")

type Service struct {
	authManager *coreauth.Manager
	registry    *registry.ModelRegistry
}

func New(authManager *coreauth.Manager, models *registry.ModelRegistry) *Service {
	return &Service{authManager: authManager, registry: models}
}

// checkRunner executes one diagnostic against one resolved credential.
type checkRunner func(ctx context.Context, s *Service, auth *coreauth.Auth, target port.ProbeTarget) port.ProbeResult

var checkRunners = map[string]checkRunner{
	// Kept byte-identical in shape: the diagnostics page reads these two.
	"models":       runModels,
	"connectivity": runConnectivity,

	"catalog":    runCatalog,
	"completion": runCompletion,
	"streaming":  runStreaming,
	"tools":      runTools,
	"json_mode":  runJSONMode,
	"payload":    runPayload,
}

func (s *Service) Probe(ctx context.Context, target port.ProbeTarget, check string) (port.ProbeResult, error) {
	if s == nil || s.authManager == nil || s.registry == nil {
		return port.ProbeResult{}, ErrUnsupported
	}
	runner, ok := checkRunners[strings.TrimSpace(check)]
	if !ok {
		return port.ProbeResult{}, ErrUnsupported
	}

	auths := s.findAuths(target)
	if len(auths) == 0 {
		return port.ProbeResult{}, ErrTargetNotFound
	}

	if !target.AllKeys {
		result := runner(ctx, s, auths[0], target)
		attachRunID(&result, target.RunID)
		return result, nil
	}
	return s.runAcrossKeys(ctx, runner, auths, target), nil
}

// runAcrossKeys executes one check against every credential of the kind and rolls the
// per-credential outcomes into a single result. Detail carries the breakdown, so no schema
// change is needed to report which key failed.
func (s *Service) runAcrossKeys(ctx context.Context, runner checkRunner, auths []*coreauth.Auth, target port.ProbeTarget) port.ProbeResult {
	started := time.Now()
	perKey := make([]map[string]any, 0, len(auths))
	passed := 0
	worst := "pass"

	for _, auth := range auths {
		single := runner(ctx, s, auth, target)
		if single.Status == "pass" {
			passed++
		}
		worst = worseStatus(worst, single.Status)
		entry := map[string]any{
			"auth_index": auth.EnsureIndex(),
			"label":      single.Label,
			"status":     single.Status,
			"category":   single.Category,
			"message":    single.Message,
			"latency_ms": single.LatencyMS,
		}
		if single.HTTPStatus != nil {
			entry["http_status"] = *single.HTTPStatus
		}
		if single.Detail != nil {
			entry["detail"] = single.Detail
		}
		perKey = append(perKey, entry)
	}

	result := port.ProbeResult{
		Label:     strings.TrimSpace(target.Kind),
		Status:    worst,
		Category:  "aggregate",
		Message:   pluralCredentials(passed, len(auths)),
		LatencyMS: time.Since(started).Milliseconds(),
		Detail:    map[string]any{"per_key": perKey, "credential_count": len(auths)},
	}
	attachRunID(&result, target.RunID)
	return result
}

func attachRunID(result *port.ProbeResult, runID string) {
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return
	}
	if result.Detail == nil {
		result.Detail = map[string]any{}
	}
	result.Detail["run_id"] = runID
}

// worseStatus keeps the most severe outcome seen so far: fail beats warn beats pass.
func worseStatus(current, next string) string {
	rank := map[string]int{"pass": 0, "warn": 1, "fail": 2}
	if rank[next] > rank[current] {
		return next
	}
	return current
}

func pluralCredentials(passed, total int) string {
	if passed == total {
		return "All credentials passed"
	}
	return fmt.Sprintf("%d of %d credentials passed", passed, total)
}

// providerKeyForAuth mirrors the auth manager's unexported executor-key derivation so
// probes route to the same executor a live request would use.
//
// Without this, every named OpenAI-compatible provider fails: the auth records
// Provider="openai-compatibility" while its executor registers under
// "openai-compatible-<name>", and auth selection filters on the executor key.
func providerKeyForAuth(auth *coreauth.Auth) string {
	if auth == nil {
		return ""
	}
	if auth.Attributes != nil {
		providerKey := strings.TrimSpace(auth.Attributes["provider_key"])
		compatName := strings.TrimSpace(auth.Attributes["compat_name"])
		if compatName != "" {
			if providerKey == "" {
				providerKey = compatName
			}
			return util.OpenAICompatibleProviderKey(providerKey)
		}
	}
	if strings.EqualFold(strings.TrimSpace(auth.Provider), "openai-compatibility") {
		providerKey := strings.TrimSpace(auth.Label)
		if providerKey == "" {
			providerKey = "openai-compatibility"
		}
		return util.OpenAICompatibleProviderKey(providerKey)
	}
	return strings.ToLower(strings.TrimSpace(auth.Provider))
}

// providerForKind maps a console credential kind to the provider recorded on its auths.
//
// Kimi, Antigravity, and AiStudio are deliberately absent: they have no config key list,
// so their credentials arrive as auth files and are matched by the "auth-file" branch.
// Adding them here would create entries nothing can ever match.
func providerForKind(kind string) string {
	providers := map[string]string{
		"gemini-api-key": "gemini", "interactions-api-key": "interactions", "claude-api-key": "claude",
		"xai-api-key": "xai", "codex": "codex", "vertex-api-key": "vertex",
		"openai-compatibility": "openai-compatibility",
	}
	return providers[strings.ToLower(strings.TrimSpace(kind))]
}

// authMatchesKind decides membership by predicate rather than provider-string equality,
// so a compat credential carrying only a compat_name attribute still matches its kind.
func authMatchesKind(auth *coreauth.Auth, kind string) bool {
	if auth == nil {
		return false
	}
	switch kind {
	case "auth-file":
		return strings.TrimSpace(auth.FileName) != ""
	case "openai-compatibility":
		if strings.EqualFold(strings.TrimSpace(auth.Provider), "openai-compatibility") {
			return true
		}
		return auth.Attributes != nil && strings.TrimSpace(auth.Attributes["compat_name"]) != ""
	default:
		provider := providerForKind(kind)
		return provider != "" && strings.EqualFold(auth.Provider, provider)
	}
}

// findAuths resolves the credentials a target addresses: every credential of the kind when
// AllKeys is set, otherwise the single one matching AuthIndex.
func (s *Service) findAuths(target port.ProbeTarget) []*coreauth.Auth {
	kind := strings.ToLower(strings.TrimSpace(target.Kind))
	wantIndex := strings.TrimSpace(target.AuthIndex)
	if kind == "" || (wantIndex == "" && !target.AllKeys) {
		return nil
	}

	matches := make([]*coreauth.Auth, 0, 4)
	// Manager.List returns clones, so mutating EnsureIndex here is safe.
	for _, auth := range s.authManager.List() {
		if !authMatchesKind(auth, kind) {
			continue
		}
		if !target.AllKeys && auth.EnsureIndex() != wantIndex {
			continue
		}
		matches = append(matches, auth)
	}
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].EnsureIndex() < matches[j].EnsureIndex()
	})
	return matches
}

func labelFor(auth *coreauth.Auth) string {
	label := strings.TrimSpace(auth.Label)
	if label == "" {
		label = strings.TrimSpace(auth.Provider)
	}
	return label
}
