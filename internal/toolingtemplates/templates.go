package toolingtemplates

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

const (
	ModePlaceholder = "placeholder"
	ModeEmbed       = "embed"

	placeholderBase  = "<your-proxy-base-url>"
	placeholderKey   = "${PROXY_API_KEY}"
	placeholderModel = "<your-model-id>"

	factoryDroidProvider               = "generic-chat-completion-api"
	factoryDroidDefaultMaxOutputTokens = 16384
)

var factoryDroidMaxOutputTokensByModel = map[string]int{
	"deepseek-v4-flash": 384000,
	"deepseek-v4-pro":   384000,
	"minimax-m2.7":      131072,
}

type TemplateMetadata struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Language   string `json:"language"`
	Filename   string `json:"filename,omitempty"`
	MultiModel bool   `json:"multi_model"`
	SyncToolID string `json:"sync_tool_id,omitempty"`
}

type RenderRequest struct {
	BaseURL      string            `json:"base_url"`
	APIKey       string            `json:"api_key"`
	APIKeyMode   string            `json:"api_key_mode"`
	Models       []string          `json:"models"`
	ActiveModel  string            `json:"active_model"`
	ActiveModels map[string]string `json:"active_models,omitempty"`
	TemplateIDs  []string          `json:"template_ids,omitempty"`
	SyncToolIDs  []string          `json:"sync_tool_ids,omitempty"`
}

type RenderResponse struct {
	Templates    []RenderedTemplate  `json:"templates"`
	ManualConfig []ManualConfigBlock `json:"manual_config"`
}

type RenderedTemplate struct {
	TemplateMetadata
	Content        string          `json:"content"`
	AuxiliaryFiles []AuxiliaryFile `json:"auxiliary_files,omitempty"`
}

type AuxiliaryFile struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
}

type ManualConfigBlock struct {
	ID       string             `json:"id"`
	TitleKey string             `json:"title_key"`
	Lines    []ManualConfigLine `json:"lines"`
}

type ManualConfigLine struct {
	ID       string `json:"id"`
	LabelKey string `json:"label_key"`
	Value    string `json:"value"`
}

func Metadata() []TemplateMetadata {
	return append([]TemplateMetadata(nil), templateCatalog...)
}

func Render(req RenderRequest) (*RenderResponse, error) {
	mode := strings.TrimSpace(req.APIKeyMode)
	if mode == "" {
		mode = ModePlaceholder
	}
	if mode != ModePlaceholder && mode != ModeEmbed {
		return nil, fmt.Errorf("api_key_mode must be %q or %q", ModePlaceholder, ModeEmbed)
	}
	req.APIKeyMode = mode

	selected := selectTemplates(req)
	templates := make([]RenderedTemplate, 0, len(selected))
	for _, meta := range selected {
		content, aux, err := renderTemplate(meta, req)
		if err != nil {
			return nil, fmt.Errorf("render %s: %w", meta.ID, err)
		}
		templates = append(templates, RenderedTemplate{
			TemplateMetadata: meta,
			Content:          content,
			AuxiliaryFiles:   aux,
		})
	}

	return &RenderResponse{
		Templates:    templates,
		ManualConfig: buildManualConfig(req),
	}, nil
}

func selectTemplates(req RenderRequest) []TemplateMetadata {
	if len(req.TemplateIDs) == 0 && len(req.SyncToolIDs) == 0 {
		return Metadata()
	}

	ids := make(map[string]struct{}, len(req.TemplateIDs))
	for _, id := range req.TemplateIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			ids[id] = struct{}{}
		}
	}

	syncToolIDs := make(map[string]struct{}, len(req.SyncToolIDs))
	for _, id := range req.SyncToolIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			syncToolIDs[id] = struct{}{}
		}
	}

	var selected []TemplateMetadata
	for _, meta := range templateCatalog {
		if _, ok := ids[meta.ID]; ok {
			selected = append(selected, meta)
			continue
		}
		if meta.SyncToolID != "" {
			if _, ok := syncToolIDs[meta.SyncToolID]; ok {
				selected = append(selected, meta)
			}
		}
	}
	return selected
}

var templateCatalog = []TemplateMetadata{
	{ID: "factory-droid", Kind: "config", Language: "json", Filename: "~/.factory/settings.json", MultiModel: true, SyncToolID: "factory-droid"},
	{ID: "opencode", Kind: "config", Language: "json", Filename: "~/.config/opencode/opencode.json", MultiModel: true, SyncToolID: "opencode"},
	{ID: "claude-code-env", Kind: "shell", Language: "bash", Filename: "shell env", MultiModel: false},
	{ID: "claude-code-settings", Kind: "config", Language: "json", Filename: "~/.claude/settings.json", MultiModel: false, SyncToolID: "claude-code"},
	{ID: "codex", Kind: "config", Language: "toml", Filename: "~/.codex/config.toml", MultiModel: false, SyncToolID: "codex"},
	{ID: "cursor", Kind: "instructions", Language: "text", MultiModel: false, SyncToolID: "cursor"},
	{ID: "continue", Kind: "config", Language: "yaml", Filename: "~/.continue/config.yaml", MultiModel: true, SyncToolID: "continue"},
	{ID: "aider", Kind: "config", Language: "yaml", Filename: "~/.aider.conf.yml", MultiModel: false, SyncToolID: "aider"},
	{ID: "forgecode", Kind: "config", Language: "toml", Filename: "~/.forge/.forge.toml", MultiModel: false, SyncToolID: "forgecode"},
	{ID: "hermes", Kind: "config", Language: "yaml", Filename: "~/.hermes/config.yaml", MultiModel: false, SyncToolID: "hermes"},
	{ID: "curl-openai", Kind: "curl", Language: "bash", MultiModel: false},
	{ID: "curl-anthropic", Kind: "curl", Language: "bash", MultiModel: false},
}

func renderTemplate(meta TemplateMetadata, req RenderRequest) (string, []AuxiliaryFile, error) {
	switch meta.ID {
	case "factory-droid":
		return renderFactoryDroid(req)
	case "opencode":
		return renderOpenCode(req)
	case "claude-code-env":
		return renderClaudeCodeEnv(req), nil, nil
	case "claude-code-settings":
		return renderClaudeCodeSettings(req)
	case "codex":
		return renderCodex(req), nil, nil
	case "cursor":
		return renderCursor(req), nil, nil
	case "continue":
		return renderContinue(req), nil, nil
	case "aider":
		return renderAider(req), nil, nil
	case "forgecode":
		return renderForgeCode(req), nil, nil
	case "hermes":
		return renderHermes(req)
	case "curl-openai":
		return renderCurlOpenAI(req), nil, nil
	case "curl-anthropic":
		return renderCurlAnthropic(req), nil, nil
	default:
		return "", nil, fmt.Errorf("unknown template id %q", meta.ID)
	}
}

func renderFactoryDroid(req RenderRequest) (string, []AuxiliaryFile, error) {
	base := resolveBase(req)
	key := resolveKey(req)
	models := resolveModelList(req)
	type entry struct {
		Model           string `json:"model"`
		ID              string `json:"id"`
		Index           int    `json:"index"`
		BaseURL         string `json:"baseUrl"`
		APIKey          string `json:"apiKey"`
		DisplayName     string `json:"displayName"`
		MaxOutputTokens int    `json:"maxOutputTokens"`
		NoImageSupport  bool   `json:"noImageSupport"`
		Provider        string `json:"provider"`
	}
	config := struct {
		CustomModels []entry `json:"customModels"`
	}{CustomModels: make([]entry, 0, len(models))}
	for i, model := range models {
		displayName := factoryDroidDisplayName(model)
		config.CustomModels = append(config.CustomModels, entry{
			Model:           model,
			ID:              factoryDroidCustomModelID(displayName),
			Index:           i,
			BaseURL:         base + "/v1",
			APIKey:          key,
			DisplayName:     displayName,
			MaxOutputTokens: factoryDroidMaxOutputTokens(model),
			NoImageSupport:  false,
			Provider:        factoryDroidProvider,
		})
	}
	return marshalJSON(config)
}

func renderOpenCode(req RenderRequest) (string, []AuxiliaryFile, error) {
	models := make(map[string]map[string]string)
	for _, model := range resolveModelList(req) {
		models[model] = map[string]string{"name": model}
	}
	config := map[string]interface{}{
		"$schema": "https://opencode.ai/config.json",
		"provider": map[string]interface{}{
			"ppap": map[string]interface{}{
				"npm":  "@ai-sdk/openai-compatible",
				"name": "PPAP",
				"options": map[string]string{
					"baseURL": resolveBase(req) + "/v1",
					"apiKey":  resolveKey(req),
				},
				"models": models,
			},
		},
	}
	return marshalJSON(config)
}

func renderClaudeCodeEnv(req RenderRequest) string {
	base := strings.TrimSuffix(resolveBase(req), "/v1")
	model := resolveActiveModel("claude-code-env", "", req)
	return strings.Join([]string{
		fmt.Sprintf("export ANTHROPIC_BASE_URL=%q", base),
		fmt.Sprintf("export ANTHROPIC_AUTH_TOKEN=%q", resolveKey(req)),
		fmt.Sprintf("export ANTHROPIC_MODEL=%q", model),
	}, "\n")
}

func renderClaudeCodeSettings(req RenderRequest) (string, []AuxiliaryFile, error) {
	base := strings.TrimSuffix(resolveBase(req), "/v1")
	config := map[string]interface{}{
		"env": map[string]string{
			"ANTHROPIC_BASE_URL":   base,
			"ANTHROPIC_AUTH_TOKEN": resolveKey(req),
			"ANTHROPIC_MODEL":      resolveActiveModel("claude-code-settings", "claude-code", req),
		},
	}
	return marshalJSON(config)
}

func renderCodex(req RenderRequest) string {
	return strings.Join([]string{
		fmt.Sprintf("model = %q", resolveActiveModel("codex", "codex", req)),
		`model_provider = "ppap"`,
		``,
		`[model_providers.ppap]`,
		`name = "PPAP"`,
		fmt.Sprintf("base_url = %q", resolveBase(req)+"/v1"),
		`wire_api = "chat"`,
		`env_key = "PROXY_API_KEY"`,
	}, "\n")
}

func renderCursor(req RenderRequest) string {
	model := resolveActiveModel("cursor", "cursor", req)
	return strings.Join([]string{
		`Cursor -> Settings -> Models -> "Override OpenAI Base URL"`,
		``,
		fmt.Sprintf("  Base URL: %s/v1", resolveBase(req)),
		fmt.Sprintf("  API Key:  %s", resolveKey(req)),
		fmt.Sprintf("  Model:    %s", model),
		``,
		`Notes:`,
		`- Click "Verify" after pasting. Cursor will reject the override if it cannot reach the URL.`,
		`- BYOK is honored in Ask/Plan mode only. Agent mode falls back to Cursor's hosted models.`,
		`- The URL must be reachable from your machine; localhost works only when Cursor runs locally.`,
	}, "\n")
}

func renderContinue(req RenderRequest) string {
	var lines []string
	lines = append(lines, "models:")
	for _, model := range resolveModelList(req) {
		lines = append(lines,
			fmt.Sprintf("  - name: PPAP %s", model),
			"    provider: openai",
			fmt.Sprintf("    model: %s", model),
			fmt.Sprintf("    apiBase: %s/v1", resolveBase(req)),
			fmt.Sprintf("    apiKey: %s", resolveKey(req)),
		)
	}
	return strings.Join(lines, "\n")
}

func renderAider(req RenderRequest) string {
	return strings.Join([]string{
		fmt.Sprintf("model: openai/%s", resolveActiveModel("aider", "aider", req)),
		fmt.Sprintf("openai-api-base: %s", resolveBase(req)),
		fmt.Sprintf("openai-api-key: %s", resolveKey(req)),
	}, "\n")
}

func renderForgeCode(req RenderRequest) string {
	return strings.Join([]string{
		"# ppap-sync: managed",
		"[session]",
		`provider_id = "ppap"`,
		fmt.Sprintf("model_id = %q", resolveActiveModel("forgecode", "forgecode", req)),
		``,
		"# ppap-sync: managed",
		"[model_providers.ppap]",
		`name = "PPAP"`,
		fmt.Sprintf("base_url = %q", resolveBase(req)+"/v1"),
		`wire_api = "openai"`,
		fmt.Sprintf("api_key = %q", resolveKey(req)),
	}, "\n")
}

func renderHermes(req RenderRequest) (string, []AuxiliaryFile, error) {
	content := strings.Join([]string{
		"# ppap-sync: managed",
		"model:",
		fmt.Sprintf("  default: %s", resolveActiveModel("hermes", "hermes", req)),
		"  provider: ppap",
		fmt.Sprintf("  base_url: %s/v1", resolveBase(req)),
		"  api_key: ${PPAP_API_KEY}",
	}, "\n") + "\n"
	aux := []AuxiliaryFile{{
		Filename: ".env",
		Content:  fmt.Sprintf("PPAP_API_KEY=%s\n", resolveKey(req)),
	}}
	return content, aux, nil
}

func renderCurlOpenAI(req RenderRequest) string {
	model := resolveActiveModel("curl-openai", "", req)
	return strings.Join([]string{
		fmt.Sprintf("curl %s/v1/chat/completions \\", resolveBase(req)),
		fmt.Sprintf("  -H %q \\", "Authorization: Bearer "+resolveKey(req)),
		`  -H "Content-Type: application/json" \`,
		`  -d '{`,
		fmt.Sprintf(`    "model": "%s",`, model),
		`    "messages": [{"role": "user", "content": "ping"}]`,
		`  }'`,
	}, "\n")
}

func renderCurlAnthropic(req RenderRequest) string {
	model := resolveActiveModel("curl-anthropic", "", req)
	return strings.Join([]string{
		fmt.Sprintf("curl %s/v1/messages \\", resolveBase(req)),
		fmt.Sprintf("  -H %q \\", "x-api-key: "+resolveKey(req)),
		`  -H "anthropic-version: 2023-06-01" \`,
		`  -H "Content-Type: application/json" \`,
		`  -d '{`,
		fmt.Sprintf(`    "model": "%s",`, model),
		`    "max_tokens": 64,`,
		`    "messages": [{"role": "user", "content": "ping"}]`,
		`  }'`,
	}, "\n")
}

func buildManualConfig(req RenderRequest) []ManualConfigBlock {
	base := resolveBase(req)
	key := resolveKey(req)
	return []ManualConfigBlock{
		{
			ID:       "openai",
			TitleKey: "tooling_templates.manual_config.openai.title",
			Lines: []ManualConfigLine{
				{ID: "openai-base", LabelKey: "tooling_templates.manual_config.openai.base_url", Value: base + "/v1"},
				{ID: "openai-chat", LabelKey: "tooling_templates.manual_config.openai.chat_url", Value: base + "/v1/chat/completions"},
				{ID: "openai-models", LabelKey: "tooling_templates.manual_config.openai.models_url", Value: base + "/v1/models"},
				{ID: "openai-auth", LabelKey: "tooling_templates.manual_config.openai.auth_header", Value: "Authorization: Bearer " + key},
			},
		},
		{
			ID:       "anthropic",
			TitleKey: "tooling_templates.manual_config.anthropic.title",
			Lines: []ManualConfigLine{
				{ID: "anthropic-base", LabelKey: "tooling_templates.manual_config.anthropic.base_url", Value: base},
				{ID: "anthropic-messages", LabelKey: "tooling_templates.manual_config.anthropic.messages_url", Value: base + "/v1/messages"},
				{ID: "anthropic-auth", LabelKey: "tooling_templates.manual_config.anthropic.auth_header", Value: "x-api-key: " + key},
				{ID: "anthropic-version", LabelKey: "tooling_templates.manual_config.anthropic.version", Value: "anthropic-version: 2023-06-01"},
			},
		},
	}
}

func resolveBase(req RenderRequest) string {
	base := strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	if base != "" {
		return base
	}
	if req.APIKeyMode == ModePlaceholder {
		return placeholderBase
	}
	return ""
}

func resolveKey(req RenderRequest) string {
	if req.APIKeyMode == ModePlaceholder {
		return placeholderKey
	}
	return strings.TrimSpace(req.APIKey)
}

func resolveModelList(req RenderRequest) []string {
	var models []string
	for _, model := range req.Models {
		model = strings.TrimSpace(model)
		if model != "" {
			models = append(models, model)
		}
	}
	if len(models) > 0 {
		return models
	}
	if req.APIKeyMode == ModePlaceholder {
		return []string{placeholderModel}
	}
	return []string{}
}

func resolveActiveModel(templateID, syncToolID string, req RenderRequest) string {
	for _, key := range []string{templateID, syncToolID} {
		if key == "" || req.ActiveModels == nil {
			continue
		}
		if model := strings.TrimSpace(req.ActiveModels[key]); model != "" {
			return model
		}
	}
	if model := strings.TrimSpace(req.ActiveModel); model != "" {
		return model
	}
	models := resolveModelList(req)
	if len(models) > 0 {
		return models[0]
	}
	if req.APIKeyMode == ModePlaceholder {
		return placeholderModel
	}
	return ""
}

func marshalJSON(value interface{}) (string, []AuxiliaryFile, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "", nil, err
	}
	return string(data), nil, nil
}

func factoryDroidModelKey(model string) string {
	key := strings.ToLower(strings.TrimSpace(model))
	if idx := strings.LastIndex(key, "/"); idx >= 0 {
		key = key[idx+1:]
	}
	if idx := strings.Index(key, ":"); idx >= 0 {
		key = key[:idx]
	}
	return key
}

func factoryDroidMaxOutputTokens(model string) int {
	if tokens, ok := factoryDroidMaxOutputTokensByModel[factoryDroidModelKey(model)]; ok {
		return tokens
	}
	return factoryDroidDefaultMaxOutputTokens
}

func factoryDroidDisplayName(model string) string {
	name := strings.TrimSpace(model)
	if idx := strings.LastIndex(name, "/"); idx >= 0 {
		name = name[idx+1:]
	}
	name = strings.TrimSpace(strings.ReplaceAll(name, ":", "-"))
	parts := strings.FieldsFunc(name, func(r rune) bool {
		return r == '-' || r == '_' || unicode.IsSpace(r)
	})
	if len(parts) == 0 {
		return model
	}
	for i, part := range parts {
		parts[i] = formatFactoryDroidDisplayToken(part)
	}
	return strings.Join(parts, " ")
}

func formatFactoryDroidDisplayToken(token string) string {
	if token == "" {
		return token
	}
	acronyms := map[string]string{
		"api": "API",
		"gpt": "GPT",
		"glm": "GLM",
		"oss": "OSS",
	}
	lower := strings.ToLower(token)
	if acronym, ok := acronyms[lower]; ok {
		return acronym
	}
	if startsWithDigit(lower) {
		return lower
	}
	if containsDigit(lower) {
		return strings.ToUpper(lower[:1]) + lower[1:]
	}
	return strings.ToUpper(lower[:1]) + lower[1:]
}

func startsWithDigit(s string) bool {
	for _, r := range s {
		return unicode.IsDigit(r)
	}
	return false
}

func containsDigit(s string) bool {
	for _, r := range s {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

var invalidFactoryDroidIDChars = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func factoryDroidCustomModelID(displayName string) string {
	idPart := strings.ReplaceAll(strings.TrimSpace(displayName), " ", "-")
	idPart = invalidFactoryDroidIDChars.ReplaceAllString(idPart, "-")
	idPart = strings.Trim(idPart, "-")
	if idPart == "" {
		idPart = "Model"
	}
	return "custom:" + idPart
}
