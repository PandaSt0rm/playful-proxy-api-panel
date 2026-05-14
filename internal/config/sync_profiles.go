package config

import (
	"fmt"
	"regexp"
	"strings"
)

// ValidSyncToolIDs lists all recognized CLI tool IDs for sync profile targets.
// These correspond to CLI tools that ppap-sync can write configuration to.
var ValidSyncToolIDs = map[string]bool{
	"factory-droid": true,
	"forgecode":     true,
	"hermes":        true,
	"opencode":      true,
	"claude-code":   true,
	"codex":         true,
	"continue":      true,
	"aider":         true,
	"cursor":        true,
}

// SyncProfileTarget defines a single sync target within a profile, specifying
// which CLI tool to configure, an optional model filter regex, which API key
// to use, and an optional active model selection.
type SyncProfileTarget struct {
	// Tool is the CLI tool identifier (e.g., "factory-droid", "claude-code").
	// Must be one of the recognized IDs in ValidSyncToolIDs.
	Tool string `yaml:"tool" json:"tool"`

	// ModelFilter is an optional regex pattern. When set, only models matching
	// this pattern are included in the sync for this target.
	ModelFilter string `yaml:"model-filter,omitempty" json:"model-filter,omitempty"`

	// APIKeyIndex selects which API key from the server's configured api-keys
	// list to use for this target. Index is 0-based. Must be within bounds.
	APIKeyIndex int `yaml:"api-key-index,omitempty" json:"api-key-index,omitempty"`

	// ActiveModel is an optional model ID to set as the active/default model
	// for tools that support a single active model selection.
	ActiveModel string `yaml:"active-model,omitempty" json:"active-model,omitempty"`
}

// SyncProfile defines a named sync profile containing one or more targets.
// Each target specifies a CLI tool to configure and its settings.
type SyncProfile struct {
	// Name is the profile identifier. Required and must be unique within the config.
	Name string `yaml:"name" json:"name"`

	// Targets lists the CLI tool targets for this profile.
	// Each tool may appear at most once within a single profile.
	Targets []SyncProfileTarget `yaml:"targets" json:"targets"`
}

// SanitizeSyncProfiles normalizes and validates sync profile configuration.
// It trims whitespace, removes profiles without names, filters out targets
// with unrecognized tool IDs, deduplicates tool targets within each profile,
// and validates model filter regex patterns. Profiles with no remaining valid
// targets after sanitization are kept (empty targets arrays are allowed).
func (cfg *Config) SanitizeSyncProfiles() {
	if cfg == nil || len(cfg.SyncProfiles) == 0 {
		return
	}

	seenNames := make(map[string]struct{}, len(cfg.SyncProfiles))
	out := make([]SyncProfile, 0, len(cfg.SyncProfiles))

	for i := range cfg.SyncProfiles {
		profile := cfg.SyncProfiles[i]
		profile.Name = strings.TrimSpace(profile.Name)
		if profile.Name == "" {
			continue
		}

		// Deduplicate profiles by name (case-insensitive), keeping the first occurrence.
		nameKey := strings.ToLower(profile.Name)
		if _, exists := seenNames[nameKey]; exists {
			continue
		}
		seenNames[nameKey] = struct{}{}

		profile.Targets = sanitizeSyncProfileTargets(profile.Targets)
		out = append(out, profile)
	}

	cfg.SyncProfiles = out
}

// sanitizeSyncProfileTargets cleans and validates a slice of sync profile targets.
func sanitizeSyncProfileTargets(targets []SyncProfileTarget) []SyncProfileTarget {
	if len(targets) == 0 {
		return targets
	}

	seenTools := make(map[string]struct{}, len(targets))
	out := make([]SyncProfileTarget, 0, len(targets))

	for _, target := range targets {
		target.Tool = strings.ToLower(strings.TrimSpace(target.Tool))
		if target.Tool == "" {
			continue
		}

		// Reject unrecognized tool IDs.
		if !ValidSyncToolIDs[target.Tool] {
			continue
		}

		// Deduplicate by tool within the profile.
		if _, exists := seenTools[target.Tool]; exists {
			continue
		}
		seenTools[target.Tool] = struct{}{}

		target.ModelFilter = strings.TrimSpace(target.ModelFilter)

		// Validate model filter regex if provided.
		if target.ModelFilter != "" {
			if _, err := regexp.Compile(target.ModelFilter); err != nil {
				// Invalid regex: clear the filter rather than dropping the target.
				target.ModelFilter = ""
			}
		}

		target.ActiveModel = strings.TrimSpace(target.ActiveModel)

		// Ensure api-key-index is non-negative.
		if target.APIKeyIndex < 0 {
			target.APIKeyIndex = 0
		}

		out = append(out, target)
	}

	return out
}

// ValidateSyncProfiles validates sync profiles against the current config state.
// Unlike SanitizeSyncProfiles which silently removes invalid data, this method
// returns descriptive errors for each validation failure. This is intended for
// use by API handlers that need to reject invalid input with specific error messages.
func (cfg *Config) ValidateSyncProfiles() error {
	if cfg == nil {
		return nil
	}

	for i := range cfg.SyncProfiles {
		profile := &cfg.SyncProfiles[i]
		if strings.TrimSpace(profile.Name) == "" {
			return errProfileNameRequired(i)
		}

		for j := range profile.Targets {
			target := &profile.Targets[j]
			if target.Tool == "" {
				return errTargetToolRequired(i, j)
			}
			if !ValidSyncToolIDs[strings.ToLower(strings.TrimSpace(target.Tool))] {
				return errTargetToolInvalid(i, j, target.Tool)
			}
			// Validate model filter regex if provided.
			if target.ModelFilter != "" {
				if _, err := regexp.Compile(target.ModelFilter); err != nil {
					return errTargetModelFilterInvalid(i, j, target.ModelFilter, err)
				}
			}
			// Validate api-key-index bounds.
			if target.APIKeyIndex < 0 {
				return errTargetAPIKeyIndexNegative(i, j)
			}
			if len(cfg.APIKeys) > 0 && target.APIKeyIndex >= len(cfg.APIKeys) {
				return errTargetAPIKeyIndexOutOfBounds(i, j, target.APIKeyIndex, len(cfg.APIKeys))
			}
		}

		// Check for duplicate tools within profile.
		seenTools := make(map[string]struct{}, len(profile.Targets))
		for _, target := range profile.Targets {
			toolKey := strings.ToLower(strings.TrimSpace(target.Tool))
			if toolKey == "" {
				continue
			}
			if _, exists := seenTools[toolKey]; exists {
				return errTargetDuplicateTool(i, toolKey)
			}
			seenTools[toolKey] = struct{}{}
		}
	}

	// Check for duplicate profile names.
	seenNames := make(map[string]struct{}, len(cfg.SyncProfiles))
	for _, profile := range cfg.SyncProfiles {
		nameKey := strings.ToLower(strings.TrimSpace(profile.Name))
		if nameKey == "" {
			continue
		}
		if _, exists := seenNames[nameKey]; exists {
			return errProfileDuplicateName(nameKey)
		}
		seenNames[nameKey] = struct{}{}
	}

	return nil
}

// Validation error constructors provide descriptive messages for API error responses.

func errProfileNameRequired(index int) error {
	return fmt.Errorf("sync-profiles[%d]: name is required", index)
}

func errProfileDuplicateName(name string) error {
	return fmt.Errorf("duplicate sync profile name: %q", name)
}

func errTargetToolRequired(profileIdx, targetIdx int) error {
	return fmt.Errorf("sync-profiles[%d].targets[%d]: tool is required", profileIdx, targetIdx)
}

func errTargetToolInvalid(profileIdx, targetIdx int, tool string) error {
	return fmt.Errorf("sync-profiles[%d].targets[%d]: unrecognized tool %q", profileIdx, targetIdx, tool)
}

func errTargetModelFilterInvalid(profileIdx, targetIdx int, filter string, err error) error {
	return fmt.Errorf("sync-profiles[%d].targets[%d]: invalid model-filter %q: %w", profileIdx, targetIdx, filter, err)
}

func errTargetAPIKeyIndexNegative(profileIdx, targetIdx int) error {
	return fmt.Errorf("sync-profiles[%d].targets[%d]: api-key-index must be non-negative", profileIdx, targetIdx)
}

func errTargetAPIKeyIndexOutOfBounds(profileIdx, targetIdx, index, maxKeys int) error {
	return fmt.Errorf("sync-profiles[%d].targets[%d]: api-key-index %d out of bounds (have %d API keys)", profileIdx, targetIdx, index, maxKeys)
}

func errTargetDuplicateTool(profileIdx int, tool string) error {
	return fmt.Errorf("sync-profiles[%d]: duplicate tool target %q", profileIdx, tool)
}
