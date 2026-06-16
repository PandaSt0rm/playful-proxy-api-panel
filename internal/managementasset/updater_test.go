package managementasset

import (
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

func TestResolveReleaseURLPreservesPinnedGitHubReleaseAPIURL(t *testing.T) {
	input := "https://api.github.com/repos/router-for-me/Cli-Proxy-API-Management-Center/releases/313351637"

	if got := resolveReleaseURL(input); got != input {
		t.Fatalf("resolveReleaseURL() = %q, want %q", got, input)
	}
}

func TestResolveReleaseURLPreservesPinnedGitHubReleaseTagAPIURL(t *testing.T) {
	input := "https://api.github.com/repos/daishuge/playful-proxy-api-panel/releases/tags/v6.10.0-ppap.11"

	if got := resolveReleaseURL(input); got != input {
		t.Fatalf("resolveReleaseURL() = %q, want %q", got, input)
	}
}

func TestResolveReleaseURLNormalizesRepositoryURLsToLatestRelease(t *testing.T) {
	cases := map[string]string{
		"https://github.com/daishuge/playful-proxy-api-panel":                    "https://api.github.com/repos/daishuge/playful-proxy-api-panel/releases/latest",
		"https://api.github.com/repos/daishuge/playful-proxy-api-panel":          "https://api.github.com/repos/daishuge/playful-proxy-api-panel/releases/latest",
		"https://api.github.com/repos/daishuge/playful-proxy-api-panel/releases": "https://api.github.com/repos/daishuge/playful-proxy-api-panel/releases/latest",
	}

	for input, want := range cases {
		if got := resolveReleaseURL(input); got != want {
			t.Fatalf("resolveReleaseURL(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestAutoUpdateSkipReason(t *testing.T) {
	tests := []struct {
		name       string
		cfg        *config.Config
		wantReason string
		wantSkip   bool
	}{
		{
			name:       "nil config",
			cfg:        nil,
			wantReason: "config not yet available",
			wantSkip:   true,
		},
		{
			name: "cluster mode",
			cfg: &config.Config{
				Home: config.HomeConfig{Enabled: true},
			},
			wantReason: "cluster mode enabled",
			wantSkip:   true,
		},
		{
			name: "control panel disabled",
			cfg: &config.Config{
				RemoteManagement: config.RemoteManagement{DisableControlPanel: true},
			},
			wantReason: "control panel disabled",
			wantSkip:   true,
		},
		{
			name: "auto update disabled",
			cfg: &config.Config{
				RemoteManagement: config.RemoteManagement{DisableAutoUpdatePanel: true},
			},
			wantReason: "disable-auto-update-panel is enabled",
			wantSkip:   true,
		},
		{
			name:       "enabled",
			cfg:        &config.Config{},
			wantReason: "",
			wantSkip:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotReason, gotSkip := autoUpdateSkipReason(tt.cfg)
			if gotReason != tt.wantReason || gotSkip != tt.wantSkip {
				t.Fatalf("autoUpdateSkipReason() = (%q, %t), want (%q, %t)", gotReason, gotSkip, tt.wantReason, tt.wantSkip)
			}
		})
	}
}
