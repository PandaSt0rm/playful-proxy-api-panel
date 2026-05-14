package management

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

// GetSyncProfiles returns the current list of sync profiles.
// GET /v0/management/sync-profiles
func (h *Handler) GetSyncProfiles(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	profiles := h.cfg.SyncProfiles
	if profiles == nil {
		profiles = []config.SyncProfile{}
	}
	c.JSON(http.StatusOK, gin.H{"sync-profiles": profiles})
}

// PutSyncProfiles replaces the entire sync profiles list.
// PUT /v0/management/sync-profiles
// Body: {"sync-profiles": [...]} or bare array [...]
func (h *Handler) PutSyncProfiles(c *gin.Context) {
	data, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
		return
	}

	// Try direct array first, then wrapped object.
	var profiles []config.SyncProfile
	if err = json.Unmarshal(data, &profiles); err != nil {
		var wrapped struct {
			Items []config.SyncProfile `json:"sync-profiles"`
		}
		if err2 := json.Unmarshal(data, &wrapped); err2 != nil || wrapped.Items == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		profiles = wrapped.Items
	}

	// Deep-copy to avoid mutating caller data.
	profiles = copySyncProfiles(profiles)

	h.mu.Lock()
	defer h.mu.Unlock()

	// Validate the raw input against a copy of the current config (inside lock to avoid races).
	tmpCfg := *h.cfg
	tmpCfg.SyncProfiles = profiles
	if errValidate := tmpCfg.ValidateSyncProfiles(); errValidate != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": errValidate.Error()})
		return
	}

	// Sanitize for normalization (trim, lowercase, etc.).
	tmpCfg.SanitizeSyncProfiles()

	h.cfg.SyncProfiles = tmpCfg.SyncProfiles
	h.persistLocked(c)
}

// PatchSyncProfiles updates a single profile by index or name match.
// PATCH /v0/management/sync-profiles
// Body: {"index": N, "value": {...}} or {"match": "name", "value": {...}}
//
// The value object supports profile-level fields (name, targets) and
// target-level convenience fields (active-model, model-filter, api-key-index)
// that are applied to all existing targets in the profile.
func (h *Handler) PatchSyncProfiles(c *gin.Context) {
	var body struct {
		Index *int                    `json:"index"`
		Match *string                 `json:"match"`
		Value *map[string]interface{} `json:"value"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Value == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	targetIndex := -1
	if body.Index != nil && *body.Index >= 0 && *body.Index < len(h.cfg.SyncProfiles) {
		targetIndex = *body.Index
	}
	if targetIndex == -1 && body.Match != nil {
		match := strings.TrimSpace(*body.Match)
		for i := range h.cfg.SyncProfiles {
			if h.cfg.SyncProfiles[i].Name == match {
				targetIndex = i
				break
			}
		}
	}
	if targetIndex == -1 {
		if body.Index != nil || body.Match != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing index or match"})
		return
	}

	// Apply partial update by merging the value fields into the existing profile.
	profile := h.cfg.SyncProfiles[targetIndex]
	val := *body.Value

	if nameRaw, ok := val["name"]; ok {
		if s, ok := nameRaw.(string); ok {
			profile.Name = strings.TrimSpace(s)
		}
	}
	if targetsRaw, ok := val["targets"]; ok {
		targetBytes, errM := json.Marshal(targetsRaw)
		if errM != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid targets: %v", errM)})
			return
		}
		var targets []config.SyncProfileTarget
		if errU := json.Unmarshal(targetBytes, &targets); errU != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid targets: %v", errU)})
			return
		}
		profile.Targets = targets
	}

	// Apply target-level convenience fields to all targets.
	applyTargetConvenienceFields(&profile, val)

	// Validate the updated profile in the context of the full list.
	updated := make([]config.SyncProfile, len(h.cfg.SyncProfiles))
	copy(updated, h.cfg.SyncProfiles)
	updated[targetIndex] = profile

	tmpCfg := *h.cfg
	tmpCfg.SyncProfiles = updated
	if errValidate := tmpCfg.ValidateSyncProfiles(); errValidate != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": errValidate.Error()})
		return
	}
	tmpCfg.SanitizeSyncProfiles()

	h.cfg.SyncProfiles = tmpCfg.SyncProfiles
	h.persistLocked(c)
}

// applyTargetConvenienceFields applies target-level convenience fields from
// the PATCH value to all targets in the profile. Supported fields:
// active-model, model-filter, api-key-index.
func applyTargetConvenienceFields(profile *config.SyncProfile, val map[string]interface{}) {
	activeModel, hasAM := val["active-model"]
	modelFilter, hasMF := val["model-filter"]
	apiKeyIndex, hasAKI := val["api-key-index"]

	if !hasAM && !hasMF && !hasAKI {
		return
	}

	for i := range profile.Targets {
		if hasAM {
			if s, ok := activeModel.(string); ok {
				profile.Targets[i].ActiveModel = strings.TrimSpace(s)
			}
		}
		if hasMF {
			if s, ok := modelFilter.(string); ok {
				profile.Targets[i].ModelFilter = strings.TrimSpace(s)
			}
		}
		if hasAKI {
			if f, ok := apiKeyIndex.(float64); ok {
				profile.Targets[i].APIKeyIndex = int(f)
			}
		}
	}
}

// DeleteSyncProfiles removes a profile by name or index.
// DELETE /v0/management/sync-profiles?name=X or ?index=N
func (h *Handler) DeleteSyncProfiles(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if name := strings.TrimSpace(c.Query("name")); name != "" {
		out := make([]config.SyncProfile, 0, len(h.cfg.SyncProfiles))
		for _, p := range h.cfg.SyncProfiles {
			if p.Name != name {
				out = append(out, p)
			}
		}
		if len(out) == len(h.cfg.SyncProfiles) {
			c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
			return
		}
		h.cfg.SyncProfiles = out
		h.persistLocked(c)
		return
	}

	if idxStr := c.Query("index"); idxStr != "" {
		var idx int
		if _, err := fmt.Sscanf(idxStr, "%d", &idx); err == nil && idx >= 0 && idx < len(h.cfg.SyncProfiles) {
			h.cfg.SyncProfiles = append(h.cfg.SyncProfiles[:idx], h.cfg.SyncProfiles[idx+1:]...)
			h.persistLocked(c)
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}

	c.JSON(http.StatusBadRequest, gin.H{"error": "missing index or name"})
}

// copySyncProfiles returns a deep copy of the profiles slice.
func copySyncProfiles(profiles []config.SyncProfile) []config.SyncProfile {
	if profiles == nil {
		return nil
	}
	out := make([]config.SyncProfile, len(profiles))
	copy(out, profiles)
	for i := range out {
		if out[i].Targets != nil {
			out[i].Targets = make([]config.SyncProfileTarget, len(profiles[i].Targets))
			copy(out[i].Targets, profiles[i].Targets)
		}
	}
	return out
}
