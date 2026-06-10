// Package thinking provides unified thinking configuration processing.
//
// This file implements per-model thinking payload overrides: user-configured
// JSON patches that translate a canonical reasoning label into whatever body
// fields a non-standard upstream expects (e.g. GLM's thinking.type or
// Qwen-style enable_thinking) instead of the OpenAI reasoning_effort field.
package thinking

import (
	"sort"
	"strings"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// CanonicalEffortLabel returns the canonical reasoning label for a validated
// thinking config: "none", "auto", a level name, or a level derived from a
// numeric budget. Returns "" when the config carries no thinking setting.
func CanonicalEffortLabel(config ThinkingConfig) string {
	return reasoningEffortFromConfig(config)
}

// NormalizeThinkingPayloads lowercases payload keys and drops entries whose
// key is not a canonical reasoning label or whose patch is empty. Returns nil
// when nothing remains.
func NormalizeThinkingPayloads(payloads map[string]map[string]any) map[string]map[string]any {
	if len(payloads) == 0 {
		return nil
	}
	out := make(map[string]map[string]any, len(payloads))
	for key, patch := range payloads {
		label := strings.ToLower(strings.TrimSpace(key))
		if !isCanonicalEffortLabel(label) || len(patch) == 0 {
			continue
		}
		out[label] = patch
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// PayloadLevelKeys returns the payload map's level-named keys in canonical
// order (minimal → max). Special labels (none, auto) are not levels and are
// excluded. Used to implicitly declare thinking.levels for models that only
// configure payloads.
func PayloadLevelKeys(payloads map[string]map[string]any) []string {
	if len(payloads) == 0 {
		return nil
	}
	out := make([]string, 0, len(payloads))
	for _, level := range standardLevelOrder {
		if _, ok := payloads[string(level)]; ok {
			out = append(out, string(level))
		}
	}
	return out
}

// MergeThinkingPayload removes the standard reasoning_effort field and merges
// the patch into the JSON body. Nested maps merge recursively (sibling fields
// in the body are preserved), a nil value deletes that field, and any other
// value (including arrays) replaces the field wholesale. The patch can set
// reasoning_effort itself to reintroduce it.
func MergeThinkingPayload(body []byte, patch map[string]any) []byte {
	if len(body) == 0 || !gjson.ValidBytes(body) {
		body = []byte(`{}`)
	}
	body, _ = sjson.DeleteBytes(body, "reasoning_effort")
	return mergePayloadObject(body, "", patch)
}

func mergePayloadObject(body []byte, prefix string, patch map[string]any) []byte {
	// Apply keys in sorted order so the merged body is deterministic.
	keys := make([]string, 0, len(patch))
	for key := range patch {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := patch[key]
		path := escapePayloadPathKey(key)
		if prefix != "" {
			path = prefix + "." + path
		}
		switch typed := value.(type) {
		case nil:
			body, _ = sjson.DeleteBytes(body, path)
		case map[string]any:
			body = mergePayloadObject(body, path, typed)
		default:
			body, _ = sjson.SetBytes(body, path, typed)
		}
	}
	return body
}

// escapePayloadPathKey escapes gjson/sjson path metacharacters so payload
// keys are always treated as literal object keys.
func escapePayloadPathKey(key string) string {
	var b strings.Builder
	for _, r := range key {
		switch r {
		case '.', '*', '?', '|', '#', '@', '\\':
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func isCanonicalEffortLabel(label string) bool {
	switch ThinkingLevel(label) {
	case LevelNone, LevelAuto:
		return true
	}
	for _, level := range standardLevelOrder {
		if label == string(level) {
			return true
		}
	}
	return false
}
