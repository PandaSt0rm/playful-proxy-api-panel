package management

import (
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/syncstate"
)

// syncStateDefaultFilename is used when sync-state-path is not configured.
const syncStateDefaultFilename = "sync-state.json"

// syncStateMaxHostnameLen bounds the reported hostname length.
const syncStateMaxHostnameLen = 253

// syncStateMaxErrorLen bounds stored per-tool error details.
const syncStateMaxErrorLen = 2000

// syncStateReportRequest is the body of POST /v0/management/sync/state,
// submitted by the aiproxy-sync CLI after a sync or rollback.
type syncStateReportRequest struct {
	Hostname string                 `json:"hostname"`
	Profile  string                 `json:"profile,omitempty"`
	Tools    []syncstate.ToolReport `json:"tools"`
}

// getSyncStateStore returns the store for the currently configured path,
// recreating it when a config hot-reload changes the path.
func (h *Handler) getSyncStateStore() *syncstate.Store {
	h.mu.Lock()
	configured := ""
	if h.cfg != nil {
		configured = strings.TrimSpace(h.cfg.SyncStatePath)
	}
	configFilePath := h.configFilePath
	h.mu.Unlock()

	path := configured
	if path == "" {
		if configFilePath != "" {
			path = filepath.Join(filepath.Dir(configFilePath), syncStateDefaultFilename)
		} else {
			path = syncStateDefaultFilename
		}
	}

	h.syncStateMu.Lock()
	defer h.syncStateMu.Unlock()
	if h.syncStateStore == nil || h.syncStateStore.Path() != path {
		h.syncStateStore = syncstate.NewStore(path)
	}
	return h.syncStateStore
}

// GetSyncState returns the per-host sync status reported by aiproxy-sync CLIs.
// GET /v0/management/sync/state
func (h *Handler) GetSyncState(c *gin.Context) {
	store := h.getSyncStateStore()
	c.JSON(http.StatusOK, gin.H{"hosts": store.Snapshot()})
}

// PostSyncState records a sync status report from a aiproxy-sync CLI.
// POST /v0/management/sync/state
func (h *Handler) PostSyncState(c *gin.Context) {
	var req syncStateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	req.Hostname = strings.TrimSpace(req.Hostname)
	if req.Hostname == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hostname is required"})
		return
	}
	if len(req.Hostname) > syncStateMaxHostnameLen {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hostname too long"})
		return
	}
	if len(req.Tools) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tools must not be empty"})
		return
	}

	reports := make([]syncstate.ToolReport, 0, len(req.Tools))
	for _, report := range req.Tools {
		report.Tool = strings.ToLower(strings.TrimSpace(report.Tool))
		if !config.ValidSyncToolIDs[report.Tool] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unrecognized tool: " + report.Tool})
			return
		}
		report.Status = strings.ToLower(strings.TrimSpace(report.Status))
		if !syncstate.ValidStatuses[report.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status for " + report.Tool + ": " + report.Status})
			return
		}
		if len(report.Error) > syncStateMaxErrorLen {
			report.Error = report.Error[:syncStateMaxErrorLen]
		}
		reports = append(reports, report)
	}

	store := h.getSyncStateStore()
	if err := store.Merge(req.Hostname, strings.TrimSpace(req.Profile), reports, time.Now().UTC()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "persist sync state: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
