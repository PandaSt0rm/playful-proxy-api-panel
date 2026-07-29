package port

import (
	"context"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/syncstate"
)

type ConfigRepository interface {
	Snapshot(context.Context) (*config.Config, error)
	ReadYAML(context.Context) ([]byte, string, error)
	CompareAndSwapYAML(context.Context, []byte, string) (config.YAMLMutation, error)
}

type RuntimeApplier interface {
	ValidateConfig(context.Context, *config.Config) error
	ApplyConfig(context.Context, *config.Config) error
}

type ConfigMirror interface {
	PersistConfigBytes(context.Context, []byte, string) (string, error)
}

type SyncStateRepository interface {
	Snapshot() map[string]syncstate.HostReport
}

type ProbeTarget struct {
	Kind, AuthIndex string

	// Model overrides the model used by execution checks. Empty falls back to the first
	// model registered for the credential.
	Model string
	// Payload is a caller-supplied raw request body for the "payload" check.
	Payload []byte
	// Stream requests a streaming execution for the "payload" check.
	Stream bool
	// RunID correlates checks issued as one operator-initiated run. Echoed into
	// ProbeResult.Detail so the console can group them without a schema change.
	RunID string
	// AllKeys fans the check out across every credential of Kind instead of the single
	// credential named by AuthIndex.
	AllKeys bool
}

type ProbeResult struct {
	Label, Status, Category, Message string
	LatencyMS                        int64
	HTTPStatus, ModelCount           *int
	Detail                           map[string]any
}

type ProviderProbe interface {
	Probe(context.Context, ProbeTarget, string) (ProbeResult, error)
}

// ProbeChecks is the canonical set of diagnostic kinds. It lives here, beside the port, so
// the HTTP layer and the probe implementation validate against one list instead of two that
// can drift apart.
var ProbeChecks = []string{
	"models", "connectivity", "catalog", "completion", "streaming", "tools", "json_mode", "payload",
}

// BillableProbeChecks consume provider quota or tokens and require explicit acknowledgement.
var BillableProbeChecks = []string{
	"connectivity", "completion", "streaming", "tools", "json_mode", "payload",
}

func containsCheck(list []string, check string) bool {
	for _, item := range list {
		if item == check {
			return true
		}
	}
	return false
}

func IsProbeCheck(check string) bool { return containsCheck(ProbeChecks, check) }

func IsBillableProbeCheck(check string) bool { return containsCheck(BillableProbeChecks, check) }
