package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

type managementRouteContract struct {
	method string
	path   string
}

func TestManagementRouteContracts(t *testing.T) {
	t.Setenv("MANAGEMENT_PASSWORD", "contract-secret")
	server := newTestServer(t)

	want := []managementRouteContract{
		{method: http.MethodDelete, path: "/v0/management/api-keys"},
		{method: http.MethodDelete, path: "/v0/management/auth-files"},
		{method: http.MethodDelete, path: "/v0/management/auth-files/disabled"},
		{method: http.MethodDelete, path: "/v0/management/claude-api-key"},
		{method: http.MethodDelete, path: "/v0/management/codex-api-key"},
		{method: http.MethodDelete, path: "/v0/management/gemini-api-key"},
		{method: http.MethodDelete, path: "/v0/management/interactions-api-key"},
		{method: http.MethodDelete, path: "/v0/management/logs"},
		{method: http.MethodDelete, path: "/v0/management/oauth-excluded-models"},
		{method: http.MethodDelete, path: "/v0/management/oauth-model-alias"},
		{method: http.MethodDelete, path: "/v0/management/oauth-session"},
		{method: http.MethodDelete, path: "/v0/management/openai-compatibility"},
		{method: http.MethodDelete, path: "/v0/management/plugins/:id"},
		{method: http.MethodDelete, path: "/v0/management/proxy-url"},
		{method: http.MethodDelete, path: "/v0/management/sync-profiles"},
		{method: http.MethodDelete, path: "/v0/management/upstream-concurrency/providers/:provider"},
		{method: http.MethodDelete, path: "/v0/management/usage/api-key-aliases"},
		{method: http.MethodDelete, path: "/v0/management/usage/api-key-aliases/:hash"},
		{method: http.MethodDelete, path: "/v0/management/vertex-api-key"},
		{method: http.MethodDelete, path: "/v0/management/xai-api-key"},
		{method: http.MethodGet, path: "/v0/management/anthropic-auth-url"},
		{method: http.MethodGet, path: "/v0/management/antigravity-auth-url"},
		{method: http.MethodGet, path: "/v0/management/api-key-usage"},
		{method: http.MethodGet, path: "/v0/management/api-keys"},
		{method: http.MethodGet, path: "/v0/management/auth-files"},
		{method: http.MethodGet, path: "/v0/management/auth-files/download"},
		{method: http.MethodGet, path: "/v0/management/auth-files/export"},
		{method: http.MethodGet, path: "/v0/management/auth-files/models"},
		{method: http.MethodGet, path: "/v0/management/claude-api-key"},
		{method: http.MethodGet, path: "/v0/management/codex-api-key"},
		{method: http.MethodGet, path: "/v0/management/codex-auth-url"},
		{method: http.MethodGet, path: "/v0/management/config"},
		{method: http.MethodGet, path: "/v0/management/config.yaml"},
		{method: http.MethodGet, path: "/v0/management/debug"},
		{method: http.MethodGet, path: "/v0/management/error-logs-max-files"},
		{method: http.MethodGet, path: "/v0/management/force-model-prefix"},
		{method: http.MethodGet, path: "/v0/management/gemini-api-key"},
		{method: http.MethodGet, path: "/v0/management/get-auth-status"},
		{method: http.MethodGet, path: "/v0/management/interactions-api-key"},
		{method: http.MethodGet, path: "/v0/management/kimi-auth-url"},
		{method: http.MethodGet, path: "/v0/management/latest-version"},
		{method: http.MethodGet, path: "/v0/management/logging-to-file"},
		{method: http.MethodGet, path: "/v0/management/logs"},
		{method: http.MethodGet, path: "/v0/management/logs-max-total-size-mb"},
		{method: http.MethodGet, path: "/v0/management/logs/storage"},
		{method: http.MethodGet, path: "/v0/management/max-retry-interval"},
		{method: http.MethodGet, path: "/v0/management/model-definitions/:channel"},
		{method: http.MethodGet, path: "/v0/management/oauth-callback"},
		{method: http.MethodGet, path: "/v0/management/oauth-excluded-models"},
		{method: http.MethodGet, path: "/v0/management/oauth-model-alias"},
		{method: http.MethodGet, path: "/v0/management/openai-compatibility"},
		{method: http.MethodGet, path: "/v0/management/plugin-store"},
		{method: http.MethodGet, path: "/v0/management/plugins"},
		{method: http.MethodGet, path: "/v0/management/plugins/:id/config"},
		{method: http.MethodGet, path: "/v0/management/proxy-url"},
		{method: http.MethodGet, path: "/v0/management/quota-exceeded/switch-preview-model"},
		{method: http.MethodGet, path: "/v0/management/quota-exceeded/switch-project"},
		{method: http.MethodGet, path: "/v0/management/request-error-logs"},
		{method: http.MethodGet, path: "/v0/management/request-error-logs/:name"},
		{method: http.MethodGet, path: "/v0/management/request-log"},
		{method: http.MethodGet, path: "/v0/management/request-log-by-id/:id"},
		{method: http.MethodGet, path: "/v0/management/request-retry"},
		{method: http.MethodGet, path: "/v0/management/routing/strategy"},
		{method: http.MethodGet, path: "/v0/management/sync-profiles"},
		{method: http.MethodGet, path: "/v0/management/sync/available-configs"},
		{method: http.MethodGet, path: "/v0/management/sync/state"},
		{method: http.MethodGet, path: "/v0/management/tooling-templates"},
		{method: http.MethodGet, path: "/v0/management/upstream-concurrency"},
		{method: http.MethodGet, path: "/v0/management/usage"},
		{method: http.MethodGet, path: "/v0/management/usage-queue"},
		{method: http.MethodGet, path: "/v0/management/usage-statistics-enabled"},
		{method: http.MethodGet, path: "/v0/management/usage/api-key-aliases"},
		{method: http.MethodGet, path: "/v0/management/usage/events"},
		{method: http.MethodGet, path: "/v0/management/usage/export"},
		{method: http.MethodGet, path: "/v0/management/usage/model-prices"},
		{method: http.MethodGet, path: "/v0/management/usage/status"},
		{method: http.MethodGet, path: "/v0/management/usage/summary"},
		{method: http.MethodGet, path: "/v0/management/vertex-api-key"},
		{method: http.MethodGet, path: "/v0/management/ws-auth"},
		{method: http.MethodGet, path: "/v0/management/xai-api-key"},
		{method: http.MethodGet, path: "/v0/management/xai-auth-url"},
		{method: http.MethodPatch, path: "/v0/management/api-keys"},
		{method: http.MethodPatch, path: "/v0/management/auth-files/fields"},
		{method: http.MethodPatch, path: "/v0/management/auth-files/status"},
		{method: http.MethodPatch, path: "/v0/management/claude-api-key"},
		{method: http.MethodPatch, path: "/v0/management/codex-api-key"},
		{method: http.MethodPatch, path: "/v0/management/debug"},
		{method: http.MethodPatch, path: "/v0/management/error-logs-max-files"},
		{method: http.MethodPatch, path: "/v0/management/force-model-prefix"},
		{method: http.MethodPatch, path: "/v0/management/gemini-api-key"},
		{method: http.MethodPatch, path: "/v0/management/interactions-api-key"},
		{method: http.MethodPatch, path: "/v0/management/logging-to-file"},
		{method: http.MethodPatch, path: "/v0/management/logs-max-total-size-mb"},
		{method: http.MethodPatch, path: "/v0/management/max-retry-interval"},
		{method: http.MethodPatch, path: "/v0/management/oauth-excluded-models"},
		{method: http.MethodPatch, path: "/v0/management/oauth-model-alias"},
		{method: http.MethodPatch, path: "/v0/management/openai-compatibility"},
		{method: http.MethodPatch, path: "/v0/management/plugins/:id/config"},
		{method: http.MethodPatch, path: "/v0/management/plugins/:id/enabled"},
		{method: http.MethodPatch, path: "/v0/management/proxy-url"},
		{method: http.MethodPatch, path: "/v0/management/quota-exceeded/switch-preview-model"},
		{method: http.MethodPatch, path: "/v0/management/quota-exceeded/switch-project"},
		{method: http.MethodPatch, path: "/v0/management/request-log"},
		{method: http.MethodPatch, path: "/v0/management/request-retry"},
		{method: http.MethodPatch, path: "/v0/management/routing/strategy"},
		{method: http.MethodPatch, path: "/v0/management/sync-profiles"},
		{method: http.MethodPatch, path: "/v0/management/upstream-concurrency"},
		{method: http.MethodPatch, path: "/v0/management/upstream-concurrency/providers/:provider"},
		{method: http.MethodPatch, path: "/v0/management/usage-statistics-enabled"},
		{method: http.MethodPatch, path: "/v0/management/vertex-api-key"},
		{method: http.MethodPatch, path: "/v0/management/ws-auth"},
		{method: http.MethodPatch, path: "/v0/management/xai-api-key"},
		{method: http.MethodPost, path: "/v0/management/api-call"},
		{method: http.MethodPost, path: "/v0/management/auth-files"},
		{method: http.MethodPost, path: "/v0/management/oauth-callback"},
		{method: http.MethodPost, path: "/v0/management/plugin-store/:id/install"},
		{method: http.MethodPost, path: "/v0/management/reset-quota"},
		{method: http.MethodPost, path: "/v0/management/sync/state"},
		{method: http.MethodPost, path: "/v0/management/tooling-templates/render"},
		{method: http.MethodPost, path: "/v0/management/usage/import"},
		{method: http.MethodPost, path: "/v0/management/usage/model-prices/sync"},
		{method: http.MethodPost, path: "/v0/management/usage/prune"},
		{method: http.MethodPost, path: "/v0/management/vertex/import"},
		{method: http.MethodPut, path: "/v0/management/api-keys"},
		{method: http.MethodPut, path: "/v0/management/claude-api-key"},
		{method: http.MethodPut, path: "/v0/management/codex-api-key"},
		{method: http.MethodPut, path: "/v0/management/config.yaml"},
		{method: http.MethodPut, path: "/v0/management/debug"},
		{method: http.MethodPut, path: "/v0/management/error-logs-max-files"},
		{method: http.MethodPut, path: "/v0/management/force-model-prefix"},
		{method: http.MethodPut, path: "/v0/management/gemini-api-key"},
		{method: http.MethodPut, path: "/v0/management/interactions-api-key"},
		{method: http.MethodPut, path: "/v0/management/logging-to-file"},
		{method: http.MethodPut, path: "/v0/management/logs-max-total-size-mb"},
		{method: http.MethodPut, path: "/v0/management/max-retry-interval"},
		{method: http.MethodPut, path: "/v0/management/oauth-excluded-models"},
		{method: http.MethodPut, path: "/v0/management/oauth-model-alias"},
		{method: http.MethodPut, path: "/v0/management/openai-compatibility"},
		{method: http.MethodPut, path: "/v0/management/plugins/:id/config"},
		{method: http.MethodPut, path: "/v0/management/proxy-url"},
		{method: http.MethodPut, path: "/v0/management/quota-exceeded/switch-preview-model"},
		{method: http.MethodPut, path: "/v0/management/quota-exceeded/switch-project"},
		{method: http.MethodPut, path: "/v0/management/request-log"},
		{method: http.MethodPut, path: "/v0/management/request-retry"},
		{method: http.MethodPut, path: "/v0/management/routing/strategy"},
		{method: http.MethodPut, path: "/v0/management/sync-profiles"},
		{method: http.MethodPut, path: "/v0/management/upstream-concurrency"},
		{method: http.MethodPut, path: "/v0/management/upstream-concurrency/providers/:provider"},
		{method: http.MethodPut, path: "/v0/management/usage-statistics-enabled"},
		{method: http.MethodPut, path: "/v0/management/usage/api-key-aliases"},
		{method: http.MethodPut, path: "/v0/management/usage/model-prices"},
		{method: http.MethodPut, path: "/v0/management/vertex-api-key"},
		{method: http.MethodPut, path: "/v0/management/ws-auth"},
		{method: http.MethodPut, path: "/v0/management/xai-api-key"},
	}
	registered := make(map[managementRouteContract]struct{}, len(server.engine.Routes()))
	for _, route := range server.engine.Routes() {
		registered[managementRouteContract{method: route.Method, path: route.Path}] = struct{}{}
	}
	for _, contract := range want {
		if _, ok := registered[contract]; !ok {
			t.Errorf("missing management route %s %s", contract.method, contract.path)
		}
		if contract.path == "/v0/management/oauth-callback" {
			continue
		}
		req := httptest.NewRequest(contract.method, contract.path, nil)
		recorder := httptest.NewRecorder()
		server.engine.ServeHTTP(recorder, req)
		if recorder.Code != http.StatusUnauthorized && recorder.Code != http.StatusForbidden {
			t.Errorf("%s %s without credentials returned %d, want authentication rejection", contract.method, contract.path, recorder.Code)
		}
	}
}
