import { apiClient } from './client';
import type {
  ApiKeyMode,
  RenderedToolTemplate,
  ToolTemplateId,
  ToolTemplateMetadata,
  ToolingTemplatesRenderResponse,
} from '@/utils/toolingTemplates';

interface ToolingTemplatesListResponse {
  templates: ToolTemplateMetadata[];
}

interface ToolingTemplatesRenderRequest {
  base_url: string;
  api_key: string;
  api_key_mode: ApiKeyMode;
  models: string[];
  active_model: string;
  active_models?: Partial<Record<ToolTemplateId | string, string>>;
  template_ids?: ToolTemplateId[];
  sync_tool_ids?: string[];
}

const asTemplateList = (data: unknown): ToolTemplateMetadata[] => {
  const value = data as Partial<ToolingTemplatesListResponse> | null | undefined;
  return Array.isArray(value?.templates) ? value.templates : [];
};

// Validate the fields the UI actually consumes (id/content/language are read
// when rendering each snippet) rather than blind-casting, so a malformed
// element from the server is dropped instead of rendered as `undefined`.
const isRenderedTemplate = (value: unknown): value is RenderedToolTemplate => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.content === 'string' &&
    typeof record.language === 'string'
  );
};

const asRenderResponse = (data: unknown): ToolingTemplatesRenderResponse => {
  const value = data as Partial<ToolingTemplatesRenderResponse> | null | undefined;
  return {
    templates: Array.isArray(value?.templates) ? value.templates.filter(isRenderedTemplate) : [],
    manual_config: Array.isArray(value?.manual_config) ? value.manual_config : [],
  };
};

export const toolingTemplatesApi = {
  async list(): Promise<ToolTemplateMetadata[]> {
    return asTemplateList(await apiClient.get('/tooling-templates'));
  },

  async render(request: ToolingTemplatesRenderRequest): Promise<ToolingTemplatesRenderResponse> {
    return asRenderResponse(await apiClient.post('/tooling-templates/render', request));
  },
};
