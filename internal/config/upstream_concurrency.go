package config

import (
	"strings"
	"time"
)

// UpstreamConcurrencyConfig configures provider-level upstream concurrency gates.
type UpstreamConcurrencyConfig struct {
	// Default applies to providers without an explicit provider limit. Zero means unlimited.
	Default int `yaml:"default" json:"default"`
	// Providers maps provider keys such as "codex" to positive concurrency limits.
	Providers map[string]int `yaml:"providers,omitempty" json:"providers,omitempty"`
	// QueueTimeoutSeconds bounds how long a request may wait for a permit. When <= 0,
	// enabled gates use a conservative 30 second timeout.
	QueueTimeoutSeconds int `yaml:"queue-timeout-seconds" json:"queue-timeout-seconds"`
}

// Normalize clamps negative values and normalizes provider keys.
func (c *UpstreamConcurrencyConfig) Normalize() {
	if c == nil {
		return
	}
	if c.Default < 0 {
		c.Default = 0
	}
	if c.QueueTimeoutSeconds < 0 {
		c.QueueTimeoutSeconds = 0
	}
	if len(c.Providers) == 0 {
		return
	}
	normalized := make(map[string]int, len(c.Providers))
	for key, limit := range c.Providers {
		provider := strings.ToLower(strings.TrimSpace(key))
		if provider == "" {
			continue
		}
		if limit < 0 {
			limit = 0
		}
		normalized[provider] = limit
	}
	c.Providers = normalized
}

// LimitForProvider returns the effective concurrency limit for a provider.
func (c UpstreamConcurrencyConfig) LimitForProvider(provider string) int {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider != "" && len(c.Providers) > 0 {
		if limit, ok := c.Providers[provider]; ok {
			if limit < 0 {
				return 0
			}
			return limit
		}
		for key, limit := range c.Providers {
			if strings.ToLower(strings.TrimSpace(key)) != provider {
				continue
			}
			if limit < 0 {
				return 0
			}
			return limit
		}
	}
	if c.Default < 0 {
		return 0
	}
	return c.Default
}

// QueueTimeout returns the configured queue timeout for enabled concurrency gates.
func (c UpstreamConcurrencyConfig) QueueTimeout() time.Duration {
	if c.QueueTimeoutSeconds > 0 {
		return time.Duration(c.QueueTimeoutSeconds) * time.Second
	}
	return 30 * time.Second
}
