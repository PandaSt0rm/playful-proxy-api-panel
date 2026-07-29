package control

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

type readinessConfig struct{ cfg *config.Config }

func (r readinessConfig) Snapshot(context.Context) (*config.Config, error) {
	return r.cfg.CloneForRuntime(), nil
}
func (r readinessConfig) ReadYAML(context.Context) ([]byte, string, error) {
	return []byte("port: 8317\n"), "hash", nil
}
func (r readinessConfig) CompareAndSwapYAML(context.Context, []byte, string) (config.YAMLMutation, error) {
	return config.YAMLMutation{}, nil
}

type readinessModels int

func (r readinessModels) Count() int { return int(r) }

func TestReadinessBlockedAndReady(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, test := range []struct {
		name, want string
		cfg        *config.Config
		models     readinessModels
	}{
		{name: "blocked", want: "blocked", cfg: &config.Config{}, models: 0},
		{name: "ready", want: "attention", cfg: &config.Config{SDKConfig: config.SDKConfig{APIKeys: []string{"proxy"}}, GeminiKey: []config.GeminiKey{{APIKey: "provider"}}, UsageStatisticsEnabled: true}, models: 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := New(Dependencies{Config: readinessConfig{test.cfg}, Models: test.models})
			engine := gin.New()
			group := engine.Group("/v0/management/aiproxy")
			r.Register(group)
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v0/management/aiproxy/readiness", nil))
			if recorder.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			var body struct {
				Status string `json:"status"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Status != test.want {
				t.Fatalf("status=%q want=%q", body.Status, test.want)
			}
		})
	}
}
