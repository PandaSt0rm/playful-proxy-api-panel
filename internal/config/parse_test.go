package config

import "testing"

func TestParseConfigBytesDefaultsAlignWithLoadConfigOptional(t *testing.T) {
	cfg, err := ParseConfigBytes([]byte("host: 127.0.0.1\n"))
	if err != nil {
		t.Fatalf("ParseConfigBytes() error = %v", err)
	}

	if cfg.ErrorLogsMaxFiles != 0 {
		t.Fatalf("ErrorLogsMaxFiles = %d, want 0", cfg.ErrorLogsMaxFiles)
	}
}

func TestParseConfigBytesNormalizesUpstreamConcurrency(t *testing.T) {
	cfg, err := ParseConfigBytes([]byte(`
upstream-concurrency:
  default: -1
  queue-timeout-seconds: -5
  providers:
    " Codex ": 2
    "": 9
    Claude: -3
`))
	if err != nil {
		t.Fatalf("ParseConfigBytes() error = %v", err)
	}

	if cfg.UpstreamConcurrency.Default != 0 {
		t.Fatalf("Default = %d, want 0", cfg.UpstreamConcurrency.Default)
	}
	if cfg.UpstreamConcurrency.QueueTimeoutSeconds != 0 {
		t.Fatalf("QueueTimeoutSeconds = %d, want 0", cfg.UpstreamConcurrency.QueueTimeoutSeconds)
	}
	if got := cfg.UpstreamConcurrency.Providers["codex"]; got != 2 {
		t.Fatalf("Providers[codex] = %d, want 2", got)
	}
	if got := cfg.UpstreamConcurrency.Providers["claude"]; got != 0 {
		t.Fatalf("Providers[claude] = %d, want 0", got)
	}
	if _, ok := cfg.UpstreamConcurrency.Providers[""]; ok {
		t.Fatalf("Providers contains empty key")
	}
}
