package management

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

type upstreamConcurrencyPayload struct {
	Default                  *int           `json:"default"`
	Providers                map[string]int `json:"providers"`
	QueueTimeoutSeconds      *int           `json:"queue-timeout-seconds"`
	QueueTimeoutSecondsCamel *int           `json:"queueTimeoutSeconds"`
}

type upstreamConcurrencyRequest struct {
	Value                    *upstreamConcurrencyPayload `json:"value"`
	Default                  *int                        `json:"default"`
	Providers                map[string]int              `json:"providers"`
	QueueTimeoutSeconds      *int                        `json:"queue-timeout-seconds"`
	QueueTimeoutSecondsCamel *int                        `json:"queueTimeoutSeconds"`
}

func normalizeUpstreamConcurrencyValue(value config.UpstreamConcurrencyConfig) config.UpstreamConcurrencyConfig {
	value.Normalize()
	if len(value.Providers) == 0 {
		value.Providers = nil
	}
	return value
}

func upstreamConcurrencyResponse(value config.UpstreamConcurrencyConfig) gin.H {
	return gin.H{"upstream-concurrency": normalizeUpstreamConcurrencyValue(value)}
}

func (r upstreamConcurrencyRequest) payload() upstreamConcurrencyPayload {
	if r.Value != nil {
		return *r.Value
	}
	return upstreamConcurrencyPayload{
		Default:                  r.Default,
		Providers:                r.Providers,
		QueueTimeoutSeconds:      r.QueueTimeoutSeconds,
		QueueTimeoutSecondsCamel: r.QueueTimeoutSecondsCamel,
	}
}

func queueTimeoutSecondsFromPayload(payload upstreamConcurrencyPayload) int {
	if payload.QueueTimeoutSeconds != nil {
		return *payload.QueueTimeoutSeconds
	}
	if payload.QueueTimeoutSecondsCamel != nil {
		return *payload.QueueTimeoutSecondsCamel
	}
	return 0
}

func cloneProviderLimits(raw map[string]int) map[string]int {
	if len(raw) == 0 {
		return nil
	}
	cloned := make(map[string]int, len(raw))
	for provider, limit := range raw {
		cloned[provider] = limit
	}
	cfg := config.UpstreamConcurrencyConfig{Providers: cloned}
	cfg.Normalize()
	if len(cfg.Providers) == 0 {
		return nil
	}
	return cfg.Providers
}

func readUpstreamConcurrencyRaw(c *gin.Context) (map[string]json.RawMessage, bool) {
	data, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
		return nil, false
	}
	var raw map[string]json.RawMessage
	if err = json.Unmarshal(data, &raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return nil, false
	}
	if valueRaw, ok := raw["value"]; ok {
		if strings.EqualFold(strings.TrimSpace(string(valueRaw)), "null") {
			return map[string]json.RawMessage{}, true
		}
		var nested map[string]json.RawMessage
		if err = json.Unmarshal(valueRaw, &nested); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid value"})
			return nil, false
		}
		return nested, true
	}
	return raw, true
}

func readOptionalInt(raw map[string]json.RawMessage, keys ...string) (*int, bool, bool) {
	for _, key := range keys {
		valueRaw, ok := raw[key]
		if !ok {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(string(valueRaw)), "null") {
			zero := 0
			return &zero, true, true
		}
		var value int
		if err := json.Unmarshal(valueRaw, &value); err != nil {
			return nil, true, false
		}
		return &value, true, true
	}
	return nil, false, true
}

func readOptionalProviderLimits(raw map[string]json.RawMessage) (map[string]int, bool, bool) {
	valueRaw, ok := raw["providers"]
	if !ok {
		return nil, false, true
	}
	if strings.EqualFold(strings.TrimSpace(string(valueRaw)), "null") {
		return nil, true, true
	}
	var providers map[string]int
	if err := json.Unmarshal(valueRaw, &providers); err != nil {
		return nil, true, false
	}
	return providers, true, true
}

func (h *Handler) GetUpstreamConcurrency(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusOK, upstreamConcurrencyResponse(config.UpstreamConcurrencyConfig{}))
		return
	}
	c.JSON(http.StatusOK, upstreamConcurrencyResponse(h.cfg.UpstreamConcurrency))
}

func (h *Handler) PutUpstreamConcurrency(c *gin.Context) {
	var body upstreamConcurrencyRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	payload := body.payload()
	next := config.UpstreamConcurrencyConfig{
		Providers:           cloneProviderLimits(payload.Providers),
		QueueTimeoutSeconds: queueTimeoutSecondsFromPayload(payload),
	}
	if payload.Default != nil {
		next.Default = *payload.Default
	}
	next = normalizeUpstreamConcurrencyValue(next)

	h.mu.Lock()
	defer h.mu.Unlock()
	h.cfg.UpstreamConcurrency = next
	h.persistLocked(c)
}

func (h *Handler) PatchUpstreamConcurrency(c *gin.Context) {
	raw, ok := readUpstreamConcurrencyRaw(c)
	if !ok {
		return
	}

	defaultLimit, hasDefault, ok := readOptionalInt(raw, "default")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid default"})
		return
	}
	queueTimeoutSeconds, hasQueueTimeoutSeconds, ok := readOptionalInt(raw, "queue-timeout-seconds", "queueTimeoutSeconds")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid queue-timeout-seconds"})
		return
	}
	providers, hasProviders, ok := readOptionalProviderLimits(raw)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid providers"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	next := h.cfg.UpstreamConcurrency
	if hasDefault && defaultLimit != nil {
		next.Default = *defaultLimit
	}
	if hasQueueTimeoutSeconds && queueTimeoutSeconds != nil {
		next.QueueTimeoutSeconds = *queueTimeoutSeconds
	}
	if hasProviders {
		next.Providers = cloneProviderLimits(providers)
	}
	h.cfg.UpstreamConcurrency = normalizeUpstreamConcurrencyValue(next)
	h.persistLocked(c)
}

func (h *Handler) PutUpstreamConcurrencyProvider(c *gin.Context) {
	provider := strings.ToLower(strings.TrimSpace(c.Param("provider")))
	if provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing provider"})
		return
	}
	var body struct {
		Limit *int `json:"limit"`
		Value *int `json:"value"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	limit := body.Limit
	if limit == nil {
		limit = body.Value
	}
	if limit == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing limit"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	next := h.cfg.UpstreamConcurrency
	if next.Providers == nil {
		next.Providers = make(map[string]int)
	}
	next.Providers[provider] = *limit
	h.cfg.UpstreamConcurrency = normalizeUpstreamConcurrencyValue(next)
	h.persistLocked(c)
}

func (h *Handler) DeleteUpstreamConcurrencyProvider(c *gin.Context) {
	provider := strings.ToLower(strings.TrimSpace(c.Param("provider")))
	if provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing provider"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	next := h.cfg.UpstreamConcurrency
	if len(next.Providers) > 0 {
		delete(next.Providers, provider)
	}
	h.cfg.UpstreamConcurrency = normalizeUpstreamConcurrencyValue(next)
	h.persistLocked(c)
}
