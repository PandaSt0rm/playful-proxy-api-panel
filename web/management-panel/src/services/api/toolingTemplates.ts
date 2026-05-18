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
  const value = data as Partial<ToolingTemplatesListResponse>;
  return Array.isArray(value.templates) ? value.templates : [];
};

const asRenderResponse = (data: unknown): ToolingTemplatesRenderResponse => {
  const value = data as Partial<ToolingTemplatesRenderResponse>;
  return {
    templates: Array.isArray(value.templates) ? (value.templates as RenderedToolTemplate[]) : [],
    manual_config: Array.isArray(value.manual_config) ? value.manual_config : [],
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
