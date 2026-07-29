package adapter

import (
	"context"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/control"
	management "github.com/router-for-me/CLIProxyAPI/v7/internal/api/handlers/management"
)

type MutationRecorder interface {
	RecordMutation(context.Context, control.Mutation) error
}

type MutationObserver struct {
	Recorder MutationRecorder
}

func (a MutationObserver) RecordConfigMutation(ctx context.Context, mutation management.ConfigMutation) error {
	return a.Recorder.RecordMutation(ctx, control.Mutation{
		Method:     mutation.Method,
		Path:       mutation.Path,
		ActorIP:    mutation.ActorIP,
		BeforeYAML: mutation.BeforeYAML,
		AfterYAML:  mutation.AfterYAML,
	})
}
