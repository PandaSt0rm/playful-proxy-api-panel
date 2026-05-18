package management

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/toolingtemplates"
)

type toolingTemplateRenderRequest struct {
	toolingtemplates.RenderRequest
	APIKeyIndex *int `json:"api_key_index,omitempty"`
}

func (h *Handler) GetToolingTemplates(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"templates": toolingtemplates.Metadata()})
}

func (h *Handler) RenderToolingTemplates(c *gin.Context) {
	var req toolingTemplateRenderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	h.mu.Lock()
	if req.BaseURL == "" {
		req.BaseURL = buildBaseURL(h.cfg)
	}
	if req.APIKeyIndex != nil {
		index := *req.APIKeyIndex
		if h.cfg == nil || index < 0 || index >= len(h.cfg.APIKeys) {
			h.mu.Unlock()
			c.JSON(http.StatusBadRequest, gin.H{"error": "api_key_index not found"})
			return
		}
		req.APIKey = h.cfg.APIKeys[index]
	}
	h.mu.Unlock()

	resp, err := toolingtemplates.Render(req.RenderRequest)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}
