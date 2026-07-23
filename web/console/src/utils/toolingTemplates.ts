export type ApiKeyMode = 'placeholder' | 'embed';

export type ToolTemplateId =
  | 'factory-droid'
  | 'opencode'
  | 'claude-code-env'
  | 'claude-code-settings'
  | 'codex'
  | 'cursor'
  | 'continue'
  | 'aider'
  | 'forgecode'
  | 'hermes'
  | 'curl-openai'
  | 'curl-anthropic';

export interface TemplateInputs {
  baseUrl: string;
  apiKey: string;
  models: string[];
  activeModel: string;
  activeModels?: Partial<Record<ToolTemplateId | string, string>>;
  mode: ApiKeyMode;
}

export interface ToolTemplateMetadata {
  id: ToolTemplateId;
  kind: string;
  language: 'json' | 'toml' | 'yaml' | 'bash' | 'text';
  filename?: string;
  multi_model: boolean;
  sync_tool_id?: string;
}

export interface ToolTemplateAuxiliaryFile {
  filename: string;
  content: string;
}

export interface RenderedToolTemplate extends ToolTemplateMetadata {
  content: string;
  auxiliary_files?: ToolTemplateAuxiliaryFile[];
}

export interface ManualConfigLine {
  id: string;
  label_key: string;
  value: string;
}

export interface ManualConfigBlock {
  id: 'openai' | 'anthropic';
  title_key: string;
  markdown: string;
  lines: ManualConfigLine[];
}

export interface ToolingTemplatesRenderResponse {
  templates: RenderedToolTemplate[];
  manual_config: ManualConfigBlock[];
}
