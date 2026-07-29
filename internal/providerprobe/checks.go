package providerprobe

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/port"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executor"
	"github.com/router-for-me/CLIProxyAPI/v7/sdk/translator"
)

// streamChunkBudget bounds a streaming probe by work rather than by wall clock, so no
// timeout is introduced after the upstream connection is established.
const streamChunkBudget = 64

// registeredModels returns the sorted model ids the registry holds for a credential.
func (s *Service) registeredModels(auth *coreauth.Auth) []string {
	models := s.registry.GetModelsForClient(auth.ID)
	ids := make([]string, 0, len(models))
	for _, model := range models {
		if model != nil && strings.TrimSpace(model.ID) != "" {
			ids = append(ids, model.ID)
		}
	}
	sort.Strings(ids)
	return ids
}

// resolveModel prefers the caller's model and falls back to the first registered one.
func (s *Service) resolveModel(auth *coreauth.Auth, requested string) string {
	if trimmed := strings.TrimSpace(requested); trimmed != "" {
		return trimmed
	}
	if ids := s.registeredModels(auth); len(ids) > 0 {
		return ids[0]
	}
	return ""
}

// runModels reports the registry's view of a credential. Its output shape is consumed by
// the existing diagnostics page and must not drift.
func runModels(_ context.Context, s *Service, auth *coreauth.Auth, _ port.ProbeTarget) port.ProbeResult {
	started := time.Now()
	ids := s.registeredModels(auth)
	count := len(ids)
	status, category, message := "pass", "ok", fmt.Sprintf("%d models are registered for this credential", count)
	if count == 0 {
		status, category, message = "warn", "empty_catalog", "No models are registered for this credential"
	}
	return port.ProbeResult{
		Label:      labelFor(auth),
		Status:     status,
		Category:   category,
		Message:    message,
		LatencyMS:  time.Since(started).Milliseconds(),
		ModelCount: &count,
		Detail:     map[string]any{"models": ids},
	}
}

// runConnectivity is the original one-token liveness check, unchanged in output shape.
func runConnectivity(ctx context.Context, s *Service, auth *coreauth.Auth, target port.ProbeTarget) port.ProbeResult {
	started := time.Now()
	model := s.resolveModel(auth, target.Model)
	if model == "" {
		return port.ProbeResult{
			Label:     labelFor(auth),
			Status:    "fail",
			Category:  "empty_catalog",
			Message:   "No model is available for a connectivity check",
			LatencyMS: time.Since(started).Milliseconds(),
		}
	}

	outcome, _, elapsed := s.executeProbe(ctx, auth, model, chatPayload(model, probeMaxTokens, nil))
	result := port.ProbeResult{
		Label:      labelFor(auth),
		Status:     outcome.Status,
		Category:   outcome.Category,
		Message:    "Provider connectivity succeeded",
		LatencyMS:  elapsed.Milliseconds(),
		HTTPStatus: outcome.HTTPStatus,
		Detail:     outcome.Detail,
	}
	if outcome.Status != "pass" {
		result.Message = "Provider connectivity failed"
	}
	result.Detail["model"] = model
	return result
}

// runCatalog compares what the registry holds against what the credential's provider
// actually advertises for it.
func runCatalog(_ context.Context, s *Service, auth *coreauth.Auth, _ port.ProbeTarget) port.ProbeResult {
	started := time.Now()
	registered := s.registeredModels(auth)
	byProvider := s.registry.GetAvailableModelsByProvider(providerKeyForAuth(auth))

	advertised := make([]string, 0, len(byProvider))
	for _, model := range byProvider {
		if model != nil && strings.TrimSpace(model.ID) != "" {
			advertised = append(advertised, model.ID)
		}
	}
	sort.Strings(advertised)

	known := make(map[string]struct{}, len(advertised))
	for _, id := range advertised {
		known[id] = struct{}{}
	}
	missing := make([]string, 0)
	for _, id := range registered {
		if _, ok := known[id]; !ok {
			missing = append(missing, id)
		}
	}

	count := len(registered)
	status, category := "pass", "ok"
	message := fmt.Sprintf("%d registered models are all advertised by this provider", count)
	switch {
	case count == 0:
		status, category, message = "warn", "empty_catalog", "No models are registered for this credential"
	case len(missing) > 0:
		status, category = "warn", "catalog_drift"
		message = fmt.Sprintf("%d registered models are not advertised by this provider", len(missing))
	}

	return port.ProbeResult{
		Label:      labelFor(auth),
		Status:     status,
		Category:   category,
		Message:    message,
		LatencyMS:  time.Since(started).Milliseconds(),
		ModelCount: &count,
		Detail: map[string]any{
			"registered": registered,
			"advertised": advertised,
			"missing":    missing,
		},
	}
}

// generativeCheck is the shared body of every probe that sends one chat request and reads
// the answer back.
func generativeCheck(
	ctx context.Context,
	s *Service,
	auth *coreauth.Auth,
	target port.ProbeTarget,
	maxTokens int,
	extra map[string]any,
	passMessage, failMessage string,
) port.ProbeResult {
	started := time.Now()
	model := s.resolveModel(auth, target.Model)
	if model == "" {
		return port.ProbeResult{
			Label:     labelFor(auth),
			Status:    "fail",
			Category:  "empty_catalog",
			Message:   "No model is available for this check",
			LatencyMS: time.Since(started).Milliseconds(),
		}
	}

	outcome, _, elapsed := s.executeProbe(ctx, auth, model, chatPayload(model, maxTokens, extra))
	message := passMessage
	if outcome.Status != "pass" {
		message = failMessage
	}
	outcome.Detail["model"] = model
	return port.ProbeResult{
		Label:      labelFor(auth),
		Status:     outcome.Status,
		Category:   outcome.Category,
		Message:    message,
		LatencyMS:  elapsed.Milliseconds(),
		HTTPStatus: outcome.HTTPStatus,
		Detail:     outcome.Detail,
	}
}

func runCompletion(ctx context.Context, s *Service, auth *coreauth.Auth, target port.ProbeTarget) port.ProbeResult {
	return generativeCheck(ctx, s, auth, target, probeMaxTokens, nil,
		"Completion succeeded through the router",
		"Completion failed through the router")
}

func runTools(ctx context.Context, s *Service, auth *coreauth.Auth, target port.ProbeTarget) port.ProbeResult {
	extra := map[string]any{
		"tool_choice": "auto",
		"tools": []map[string]any{{
			"type": "function",
			"function": map[string]any{
				"name":        "ping",
				"description": "Returns pong. Used only to verify tool calling works.",
				"parameters":  map[string]any{"type": "object", "properties": map[string]any{}},
			},
		}},
	}
	return generativeCheck(ctx, s, auth, target, toolMaxTokens, extra,
		"Tool schema was accepted by the provider",
		"Tool calling failed through the router")
}

func runJSONMode(ctx context.Context, s *Service, auth *coreauth.Auth, target port.ProbeTarget) port.ProbeResult {
	extra := map[string]any{"response_format": map[string]any{"type": "json_object"}}
	return generativeCheck(ctx, s, auth, target, toolMaxTokens, extra,
		"Structured output was accepted by the provider",
		"Structured output failed through the router")
}

// runPayload executes a caller-supplied body, so an operator can reproduce a real failing
// request through the router instead of approximating it.
func runPayload(ctx context.Context, s *Service, auth *coreauth.Auth, target port.ProbeTarget) port.ProbeResult {
	started := time.Now()
	if len(bytes.TrimSpace(target.Payload)) == 0 {
		return port.ProbeResult{
			Label:     labelFor(auth),
			Status:    "fail",
			Category:  "invalid_payload",
			Message:   "No payload was supplied",
			LatencyMS: time.Since(started).Milliseconds(),
		}
	}

	var parsed map[string]any
	if err := json.Unmarshal(target.Payload, &parsed); err != nil {
		return port.ProbeResult{
			Label:     labelFor(auth),
			Status:    "fail",
			Category:  "invalid_payload",
			Message:   "Payload is not valid JSON",
			LatencyMS: time.Since(started).Milliseconds(),
		}
	}

	model := strings.TrimSpace(target.Model)
	if model == "" {
		if value, ok := parsed["model"].(string); ok {
			model = strings.TrimSpace(value)
		}
	}
	if model == "" {
		model = s.resolveModel(auth, "")
	}

	if target.Stream {
		return s.streamProbe(ctx, auth, model, target.Payload, started,
			"Payload streamed successfully through the router",
			"Payload streaming failed through the router")
	}

	outcome, _, elapsed := s.executeProbe(ctx, auth, model, target.Payload)
	message := "Payload executed successfully through the router"
	if outcome.Status != "pass" {
		message = "Payload execution failed through the router"
	}
	outcome.Detail["model"] = model
	return port.ProbeResult{
		Label:      labelFor(auth),
		Status:     outcome.Status,
		Category:   outcome.Category,
		Message:    message,
		LatencyMS:  elapsed.Milliseconds(),
		HTTPStatus: outcome.HTTPStatus,
		Detail:     outcome.Detail,
	}
}

func runStreaming(ctx context.Context, s *Service, auth *coreauth.Auth, target port.ProbeTarget) port.ProbeResult {
	started := time.Now()
	model := s.resolveModel(auth, target.Model)
	if model == "" {
		return port.ProbeResult{
			Label:     labelFor(auth),
			Status:    "fail",
			Category:  "empty_catalog",
			Message:   "No model is available for a streaming check",
			LatencyMS: time.Since(started).Milliseconds(),
		}
	}
	payload := chatPayload(model, toolMaxTokens, map[string]any{"stream": true})
	return s.streamProbe(ctx, auth, model, payload, started,
		"Streaming succeeded through the router",
		"Streaming failed through the router")
}

// streamProbe measures time to the first chunk that reaches the caller.
//
// This is channel-first-chunk, which sits after translation rather than at the transport.
// The transport-accurate figure is only published to the usage bus with no per-request
// correlation, so it cannot be attributed to one probe; the field is named and documented
// as end-to-end rather than claiming transport TTFT.
func (s *Service) streamProbe(
	ctx context.Context,
	auth *coreauth.Auth,
	model string,
	payload []byte,
	started time.Time,
	passMessage, failMessage string,
) port.ProbeResult {
	route := routeInfo{}
	ctx = logging.WithResponseHeadersHolder(ctx)

	stream, err := s.authManager.ExecuteStream(
		ctx,
		[]string{providerKeyForAuth(auth)},
		cliproxyexecutor.Request{Model: model, Payload: payload, Format: translator.FormatOpenAI},
		captureOptions(payload, auth, true, &route),
	)

	outcome := probeOutcome{Status: "pass", Category: "ok"}
	detail := map[string]any{"route": route.detail(), "model": model}

	if err != nil {
		applyError(&outcome, err)
		detail["stream"] = map[string]any{"chunk_count": 0, "terminated_cleanly": false}
		return streamResult(auth, outcome, detail, started, passMessage, failMessage)
	}

	var (
		chunkCount int
		counted    int
		bytesSeen  int
		firstAt    time.Time
		streamErr  error
		sawDone    bool
	)
	// Drained to completion even once the budget is spent: abandoning the channel can block
	// the executor's producer.
	for chunk := range stream.Chunks {
		if chunk.Err != nil {
			streamErr = chunk.Err
			continue
		}
		if firstAt.IsZero() {
			firstAt = time.Now()
		}
		chunkCount++
		if counted < streamChunkBudget {
			counted++
			bytesSeen += len(chunk.Payload)
			if bytes.Contains(chunk.Payload, []byte("[DONE]")) {
				sawDone = true
			}
		}
	}

	streamDetail := map[string]any{
		"chunk_count":        chunkCount,
		"bytes":              bytesSeen,
		"terminated_cleanly": streamErr == nil && chunkCount > 0,
		"saw_done":           sawDone,
		"truncated":          chunkCount > streamChunkBudget,
	}
	if !firstAt.IsZero() {
		streamDetail["ttft_ms"] = firstAt.Sub(started).Milliseconds()
	}
	detail["stream"] = streamDetail
	if headers := logging.GetResponseHeaders(ctx); len(headers) > 0 {
		detail["upstream_response_headers"] = redactHeaders(headers)
	}

	// A bootstrap failure arrives as a chunk error with a nil function error, so checking
	// only `err` above would report a dead stream as a pass.
	if streamErr != nil {
		applyError(&outcome, streamErr)
	} else if chunkCount == 0 {
		outcome.Status, outcome.Category = "fail", "empty_stream"
		outcome.Message = "The provider opened a stream but sent no chunks"
	}
	return streamResult(auth, outcome, detail, started, passMessage, failMessage)
}

func streamResult(
	auth *coreauth.Auth,
	outcome probeOutcome,
	detail map[string]any,
	started time.Time,
	passMessage, failMessage string,
) port.ProbeResult {
	message := passMessage
	if outcome.Status != "pass" {
		message = failMessage
	}
	return port.ProbeResult{
		Label:      labelFor(auth),
		Status:     outcome.Status,
		Category:   outcome.Category,
		Message:    message,
		LatencyMS:  time.Since(started).Milliseconds(),
		HTTPStatus: outcome.HTTPStatus,
		Detail:     detail,
	}
}
