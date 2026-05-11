export type ApiKeyMode = 'placeholder' | 'embed';

export interface TemplateInputs {
  baseUrl: string;
  apiKey: string;
  models: string[];
  activeModel: string;
  mode: ApiKeyMode;
}

export interface ToolTemplate {
  id: ToolTemplateId;
  language: 'json' | 'toml' | 'yaml' | 'bash' | 'text';
  filename?: string;
  multiModel: boolean;
  render: (inputs: TemplateInputs) => string;
}

export type ToolTemplateId =
  | 'factory-droid'
  | 'opencode'
  | 'claude-code-env'
  | 'claude-code-settings'
  | 'codex'
  | 'cursor'
  | 'continue'
  | 'aider'
  | 'curl-openai'
  | 'curl-anthropic';

const PLACEHOLDER_BASE = '<your-proxy-base-url>';
const PLACEHOLDER_KEY = '${PROXY_API_KEY}';
const PLACEHOLDER_MODEL = '<your-model-id>';

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/g, '');

const resolveBase = (raw: string, mode: ApiKeyMode): string => {
  const trimmed = stripTrailingSlash((raw || '').trim());
  if (trimmed) return trimmed;
  return mode === 'placeholder' ? PLACEHOLDER_BASE : '';
};

const resolveKey = (raw: string, mode: ApiKeyMode): string => {
  if (mode === 'placeholder') return PLACEHOLDER_KEY;
  return (raw || '').trim();
};

const resolveModel = (raw: string, mode: ApiKeyMode): string => {
  const trimmed = (raw || '').trim();
  if (trimmed) return trimmed;
  return mode === 'placeholder' ? PLACEHOLDER_MODEL : '';
};

const resolveModelList = (models: string[], mode: ApiKeyMode): string[] => {
  const cleaned = models.map((entry) => (entry || '').trim()).filter(Boolean);
  if (cleaned.length > 0) return cleaned;
  return mode === 'placeholder' ? [PLACEHOLDER_MODEL] : [];
};

const renderFactoryDroid = ({ baseUrl, apiKey, models, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelList = resolveModelList(models, mode);
  const config = {
    customModels: modelList.map((modelId) => ({
      model: modelId,
      baseUrl: `${base}/v1`,
      apiKey: key,
      provider: 'generic-chat-completion-api',
      displayName: `PPAP — ${modelId}`,
    })),
  };
  return JSON.stringify(config, null, 2);
};

const renderOpenCode = ({ baseUrl, apiKey, models, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelList = resolveModelList(models, mode);
  const modelsBlock: Record<string, { name: string }> = {};
  modelList.forEach((modelId) => {
    modelsBlock[modelId] = { name: modelId };
  });
  const config = {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      ppap: {
        npm: '@ai-sdk/openai-compatible',
        name: 'PPAP',
        options: {
          baseURL: `${base}/v1`,
          apiKey: key,
        },
        models: modelsBlock,
      },
    },
  };
  return JSON.stringify(config, null, 2);
};

const renderClaudeCodeEnv = ({ baseUrl, apiKey, activeModel, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelId = resolveModel(activeModel, mode);
  return [
    `export ANTHROPIC_BASE_URL="${base}"`,
    `export ANTHROPIC_AUTH_TOKEN="${key}"`,
    `export ANTHROPIC_MODEL="${modelId}"`,
  ].join('\n');
};

const renderClaudeCodeSettings = ({
  baseUrl,
  apiKey,
  activeModel,
  mode,
}: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelId = resolveModel(activeModel, mode);
  const config = {
    env: {
      ANTHROPIC_BASE_URL: base,
      ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_MODEL: modelId,
    },
  };
  return JSON.stringify(config, null, 2);
};

const renderCodex = ({ baseUrl, activeModel, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const modelId = resolveModel(activeModel, mode);
  return [
    `model = "${modelId}"`,
    `model_provider = "ppap"`,
    ``,
    `[model_providers.ppap]`,
    `name = "PPAP"`,
    `base_url = "${base}/v1"`,
    `wire_api = "chat"`,
    `env_key = "PROXY_API_KEY"`,
  ].join('\n');
};

const renderCursor = ({ baseUrl, apiKey, activeModel, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelId = resolveModel(activeModel, mode);
  return [
    `Cursor → Settings → Models → "Override OpenAI Base URL"`,
    ``,
    `  Base URL: ${base}/v1`,
    `  API Key:  ${key}`,
    `  Model:    ${modelId}`,
    ``,
    `Notes:`,
    `- Click "Verify" after pasting. Cursor will reject the override if it cannot reach the URL.`,
    `- BYOK is honored in Ask/Plan mode only. Agent mode falls back to Cursor's hosted models.`,
    `- The URL must be reachable from your machine; localhost works only when Cursor runs locally.`,
  ].join('\n');
};

const renderContinue = ({ baseUrl, apiKey, models, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelList = resolveModelList(models, mode);
  const lines: string[] = [`models:`];
  modelList.forEach((modelId) => {
    lines.push(`  - name: PPAP ${modelId}`);
    lines.push(`    provider: openai`);
    lines.push(`    model: ${modelId}`);
    lines.push(`    apiBase: ${base}/v1`);
    lines.push(`    apiKey: ${key}`);
  });
  return lines.join('\n');
};

const renderAider = ({ baseUrl, apiKey, activeModel, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelId = resolveModel(activeModel, mode);
  return [
    `model: openai/${modelId}`,
    `openai-api-base: ${base}/v1`,
    `openai-api-key: ${key}`,
  ].join('\n');
};

const renderCurlOpenAI = ({ baseUrl, apiKey, activeModel, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelId = resolveModel(activeModel, mode);
  return [
    `curl ${base}/v1/chat/completions \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "model": "${modelId}",`,
    `    "messages": [{"role": "user", "content": "ping"}]`,
    `  }'`,
  ].join('\n');
};

const renderCurlAnthropic = ({ baseUrl, apiKey, activeModel, mode }: TemplateInputs): string => {
  const base = resolveBase(baseUrl, mode);
  const key = resolveKey(apiKey, mode);
  const modelId = resolveModel(activeModel, mode);
  return [
    `curl ${base}/v1/messages \\`,
    `  -H "x-api-key: ${key}" \\`,
    `  -H "anthropic-version: 2023-06-01" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "model": "${modelId}",`,
    `    "max_tokens": 64,`,
    `    "messages": [{"role": "user", "content": "ping"}]`,
    `  }'`,
  ].join('\n');
};

export interface ManualConfigLine {
  id: string;
  labelKey: string;
  value: string;
}

export interface ManualConfigBlock {
  id: 'openai' | 'anthropic';
  titleKey: string;
  lines: ManualConfigLine[];
}

export function buildManualConfig(inputs: TemplateInputs): ManualConfigBlock[] {
  const base = resolveBase(inputs.baseUrl, inputs.mode);
  const key = resolveKey(inputs.apiKey, inputs.mode);
  return [
    {
      id: 'openai',
      titleKey: 'tooling_templates.manual_config.openai.title',
      lines: [
        {
          id: 'openai-base',
          labelKey: 'tooling_templates.manual_config.openai.base_url',
          value: `${base}/v1`,
        },
        {
          id: 'openai-chat',
          labelKey: 'tooling_templates.manual_config.openai.chat_url',
          value: `${base}/v1/chat/completions`,
        },
        {
          id: 'openai-models',
          labelKey: 'tooling_templates.manual_config.openai.models_url',
          value: `${base}/v1/models`,
        },
        {
          id: 'openai-auth',
          labelKey: 'tooling_templates.manual_config.openai.auth_header',
          value: `Authorization: Bearer ${key}`,
        },
      ],
    },
    {
      id: 'anthropic',
      titleKey: 'tooling_templates.manual_config.anthropic.title',
      lines: [
        {
          id: 'anthropic-base',
          labelKey: 'tooling_templates.manual_config.anthropic.base_url',
          value: base,
        },
        {
          id: 'anthropic-messages',
          labelKey: 'tooling_templates.manual_config.anthropic.messages_url',
          value: `${base}/v1/messages`,
        },
        {
          id: 'anthropic-auth',
          labelKey: 'tooling_templates.manual_config.anthropic.auth_header',
          value: `x-api-key: ${key}`,
        },
        {
          id: 'anthropic-version',
          labelKey: 'tooling_templates.manual_config.anthropic.version',
          value: 'anthropic-version: 2023-06-01',
        },
      ],
    },
  ];
}

export const TOOL_TEMPLATES: ReadonlyArray<ToolTemplate> = [
  { id: 'factory-droid', language: 'json', filename: '~/.factory/settings.json', multiModel: true, render: renderFactoryDroid },
  { id: 'opencode', language: 'json', filename: '~/.config/opencode/opencode.json', multiModel: true, render: renderOpenCode },
  { id: 'claude-code-env', language: 'bash', filename: 'shell env', multiModel: false, render: renderClaudeCodeEnv },
  { id: 'claude-code-settings', language: 'json', filename: '~/.claude/settings.json', multiModel: false, render: renderClaudeCodeSettings },
  { id: 'codex', language: 'toml', filename: '~/.codex/config.toml', multiModel: false, render: renderCodex },
  { id: 'cursor', language: 'text', multiModel: false, render: renderCursor },
  { id: 'continue', language: 'yaml', filename: '~/.continue/config.yaml', multiModel: true, render: renderContinue },
  { id: 'aider', language: 'yaml', filename: '~/.aider.conf.yml', multiModel: false, render: renderAider },
  { id: 'curl-openai', language: 'bash', multiModel: false, render: renderCurlOpenAI },
  { id: 'curl-anthropic', language: 'bash', multiModel: false, render: renderCurlAnthropic },
];
