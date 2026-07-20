package management

import (
	"net/http"
	"strings"

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

	enrichModelMetadata(&req.RenderRequest)

	resp, err := toolingtemplates.Render(req.RenderRequest)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// enrichModelMetadata populates model provider categories and model capability
// metadata from the live registry and static catalog.
func enrichModelMetadata(req *toolingtemplates.RenderRequest) {
	if req == nil || len(req.Models) == 0 {
		return
	}
	req.ModelProviders = make(map[string]string, len(req.Models))
	req.ModelCapabilities = make(map[string]toolingtemplates.ModelCapabilities, len(req.Models))
	for _, model := range req.Models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		req.ModelProviders[model] = providerForModel(model)
		if capabilities, ok := capabilitiesForModel(model); ok {
			req.ModelCapabilities[model] = capabilities
		}
	}
	if len(req.ModelCapabilities) == 0 {
		req.ModelCapabilities = nil
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

func capabilitiesForModel(model string) (toolingtemplates.ModelCapabilities, bool) {
	info := modelInfoForToolingTemplate(model)
	if info == nil {
		return toolingtemplates.ModelCapabilities{}, false
	}

	capabilities := toolingtemplates.ModelCapabilities{}
	if info.MaxCompletionTokens > 0 {
		capabilities.MaxOutputTokens = info.MaxCompletionTokens
	} else if info.OutputTokenLimit > 0 {
		capabilities.MaxOutputTokens = info.OutputTokenLimit
	}

	if noImageSupport, ok := noImageSupportForModelInfo(info); ok {
		capabilities.NoImageSupport = &noImageSupport
	}

	return capabilities, capabilities.MaxOutputTokens > 0 || capabilities.NoImageSupport != nil
}

func modelInfoForToolingTemplate(model string) *registry.ModelInfo {
	for _, candidate := range modelMetadataCandidates(model) {
		if info := registry.LookupModelInfo(candidate); info != nil {
			return info
		}
		if info := registry.LookupStaticModelInfoByPrefix(candidate); info != nil {
			return info
		}
	}
	return nil
}

func modelMetadataCandidates(model string) []string {
	model = strings.TrimSpace(model)
	if model == "" {
		return nil
	}
	candidates := []string{model}
	if idx := strings.LastIndex(model, "/"); idx >= 0 {
		stripped := strings.TrimSpace(model[idx+1:])
		if stripped != "" && stripped != model {
			candidates = append(candidates, stripped)
		}
	}
	return candidates
}

func noImageSupportForModelInfo(info *registry.ModelInfo) (bool, bool) {
	if info == nil || len(info.SupportedInputModalities) == 0 {
		return false, false
	}
	for _, modality := range info.SupportedInputModalities {
		if strings.EqualFold(strings.TrimSpace(modality), "image") {
			return false, true
		}
	}
	return true, true
}
