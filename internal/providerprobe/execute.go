package providerprobe

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executor"
	"github.com/router-for-me/CLIProxyAPI/v7/sdk/translator"
)

// probeMaxTokens keeps every generative probe to a liveness check rather than a generation.
// Tool and JSON probes need a slightly larger budget to emit a call or a complete object.
const (
	probeMaxTokens = 1
	toolMaxTokens  = 32
)

// routeInfo is the translator and credential metadata the console renders as a hop chain.
// It is captured from the after-auth interceptor, which fires once the credential is
// chosen and before the executor translates the payload.
type routeInfo struct {
	SourceFormat   string
	TargetFormat   string
	Model          string
	RequestedModel string
	Stream         bool
}

func (r routeInfo) detail() map[string]any {
	return map[string]any{
		"source_format":   r.SourceFormat,
		"target_format":   r.TargetFormat,
		"model":           r.Model,
		"requested_model": r.RequestedModel,
		"stream":          r.Stream,
	}
}

// captureOptions builds execution options pinned to one credential, with the hooks that
// let a probe report *how* the request was routed rather than only whether it worked.
//
// The interceptor must be the probe's own closure: BaseAPIHandler only installs one when
// the plugin interceptor host is enabled, so relying on that path would silently capture
// nothing.
func captureOptions(payload []byte, auth *coreauth.Auth, stream bool, route *routeInfo) cliproxyexecutor.Options {
	return cliproxyexecutor.Options{
		Stream:          stream,
		SourceFormat:    translator.FormatOpenAI,
		ResponseFormat:  translator.FormatOpenAI,
		OriginalRequest: payload,
		Metadata: map[string]any{
			cliproxyexecutor.PinnedAuthMetadataKey: auth.ID,
		},
		RequestAfterAuthInterceptor: func(_ context.Context, req cliproxyexecutor.RequestAfterAuthInterceptRequest) cliproxyexecutor.RequestAfterAuthInterceptResponse {
			route.SourceFormat = req.SourceFormat.String()
			route.TargetFormat = req.ToFormat.String()
			route.Model = req.Model
			route.RequestedModel = req.RequestedModel
			route.Stream = req.Stream
			// Record and pass through: an empty response rewrites nothing.
			return cliproxyexecutor.RequestAfterAuthInterceptResponse{}
		},
	}
}

// applyError records a failed execution, preferring the most specific status source.
//
// Executors return their own status-carrying error types rather than *coreauth.Error, so
// checking only the latter reported every upstream 401 as an untyped "provider_error".
func applyError(result *probeOutcome, err error) {
	result.Status = "fail"
	result.Category = "provider_error"

	var statusErr interface{ StatusCode() int }
	if errors.As(err, &statusErr) {
		if code := statusErr.StatusCode(); code > 0 {
			result.HTTPStatus = &code
			result.Category = "http_" + strconv.Itoa(code)
		}
	}
	var authErr *coreauth.Error
	if errors.As(err, &authErr) {
		if code := strings.TrimSpace(authErr.Code); code != "" {
			result.Category = code
		}
		if authErr.HTTPStatus > 0 {
			status := authErr.HTTPStatus
			result.HTTPStatus = &status
		}
	}
	result.Message = redactText(err.Error())
}

// probeOutcome is the mutable working shape a check fills in before it becomes a
// port.ProbeResult.
type probeOutcome struct {
	Status     string
	Category   string
	Message    string
	HTTPStatus *int
	Detail     map[string]any
}

// executeProbe runs one non-streaming request through the real routing path and reports
// how it was routed. Upstream response headers are captured through the supported logging
// holder, which is populated even when the request fails.
func (s *Service) executeProbe(
	ctx context.Context,
	auth *coreauth.Auth,
	model string,
	payload []byte,
) (probeOutcome, routeInfo, time.Duration) {
	route := routeInfo{}
	outcome := probeOutcome{Status: "pass", Category: "ok"}

	ctx = logging.WithResponseHeadersHolder(ctx)
	started := time.Now()
	response, err := s.authManager.Execute(
		ctx,
		[]string{providerKeyForAuth(auth)},
		cliproxyexecutor.Request{Model: model, Payload: payload, Format: translator.FormatOpenAI},
		captureOptions(payload, auth, false, &route),
	)
	elapsed := time.Since(started)

	detail := map[string]any{"route": route.detail()}
	if headers := logging.GetResponseHeaders(ctx); len(headers) > 0 {
		detail["upstream_response_headers"] = redactHeaders(headers)
	}
	outcome.Detail = detail

	if err != nil {
		applyError(&outcome, err)
		return outcome, route, elapsed
	}
	if len(response.Payload) > 0 {
		detail["response_body"] = truncate(redactText(string(response.Payload)))
	}
	return outcome, route, elapsed
}

// chatPayload builds an OpenAI-format probe body. Source format is always OpenAI; the
// router translates it to whatever the target provider speaks, which is precisely the
// behaviour the routed lane exists to exercise.
func chatPayload(model string, maxTokens int, extra map[string]any) []byte {
	body := map[string]any{
		"model":      model,
		"messages":   []map[string]string{{"role": "user", "content": "Reply OK"}},
		"max_tokens": maxTokens,
	}
	for key, value := range extra {
		body[key] = value
	}
	payload, _ := json.Marshal(body)
	return payload
}
