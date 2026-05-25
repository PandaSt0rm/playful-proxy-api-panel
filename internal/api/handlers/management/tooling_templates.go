package management

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
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

	enrichModelProviders(&req.RenderRequest)

	resp, err := toolingtemplates.Render(req.RenderRequest)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// enrichModelProviders populates ModelProviders on the render request by
// inspecting the model registry and the static model catalog. It maps each
// model to its provider category (openai, anthropic, or generic) so that
// templates can emit tool-specific provider settings.
func enrichModelProviders(req *toolingtemplates.RenderRequest) {
	if req == nil || len(req.Models) == 0 {
		return
	}
	req.ModelProviders = make(map[string]string, len(req.Models))
	for _, model := range req.Models {
		req.ModelProviders[model] = providerForModel(model)
	}
}

// providerForModel determines the provider category for a model name by
// consulting the model registry's provider info and the static model catalog.
func providerForModel(model string) string {
	// Check the live model registry for provider info.
	if reg := registry.GetGlobalRegistry(); reg != nil {
		for _, p := range reg.GetModelProviders(model) {
			switch p {
			case "codex":
				return toolingtemplates.ModelProviderOpenAI
			case "claude":
				return toolingtemplates.ModelProviderAnthropic
			}
		}
	}

	// Fallback: check static model definitions for known channels.
	for _, info := range registry.GetStaticModelDefinitionsByChannel("codex") {
		if info != nil && info.ID == model {
			return toolingtemplates.ModelProviderOpenAI
		}
	}
	for _, info := range registry.GetStaticModelDefinitionsByChannel("claude") {
		if info != nil && info.ID == model {
			return toolingtemplates.ModelProviderAnthropic
		}
	}

	return toolingtemplates.ModelProviderGeneric
}
