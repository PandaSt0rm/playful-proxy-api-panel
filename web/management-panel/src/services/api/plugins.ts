import { apiClient } from './client';
import type {
  PluginConfigField,
  PluginInstanceConfig,
  PluginListEntry,
  PluginListResponse,
  PluginMenu,
} from '@/types/plugins';

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asConfigFields = (value: unknown): PluginConfigField[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((field) => ({
    name: typeof field.name === 'string' ? field.name : '',
    type: typeof field.type === 'string' ? field.type : 'string',
    enum_values: asStringArray(field.enum_values),
    description: typeof field.description === 'string' ? field.description : '',
  }));
};

const asMenus = (value: unknown): PluginMenu[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((menu) => ({
    path: typeof menu.path === 'string' ? menu.path : '',
    menu: typeof menu.menu === 'string' ? menu.menu : '',
    description: typeof menu.description === 'string' ? menu.description : '',
  }));
};

const asPluginEntry = (value: unknown): PluginListEntry | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return null;
  const metadata = isRecord(value.metadata)
    ? {
        name: typeof value.metadata.name === 'string' ? value.metadata.name : '',
        version: typeof value.metadata.version === 'string' ? value.metadata.version : '',
        author: typeof value.metadata.author === 'string' ? value.metadata.author : '',
        github_repository:
          typeof value.metadata.github_repository === 'string'
            ? value.metadata.github_repository
            : '',
        logo: typeof value.metadata.logo === 'string' ? value.metadata.logo : '',
        config_fields: asConfigFields(value.metadata.config_fields),
      }
    : null;
  return {
    id: value.id,
    path: typeof value.path === 'string' ? value.path : '',
    configured: Boolean(value.configured),
    registered: Boolean(value.registered),
    enabled: Boolean(value.enabled),
    effective_enabled: Boolean(value.effective_enabled),
    supports_oauth: Boolean(value.supports_oauth),
    logo: typeof value.logo === 'string' ? value.logo : '',
    config_fields: asConfigFields(value.config_fields),
    menus: asMenus(value.menus),
    metadata,
  };
};

const asPluginListResponse = (data: unknown): PluginListResponse => {
  const value = isRecord(data) ? data : {};
  const plugins = Array.isArray(value.plugins)
    ? value.plugins.map(asPluginEntry).filter((entry): entry is PluginListEntry => entry !== null)
    : [];
  return {
    plugins_enabled: Boolean(value.plugins_enabled),
    plugins_dir: typeof value.plugins_dir === 'string' ? value.plugins_dir : 'plugins',
    plugins,
  };
};

export const pluginsApi = {
  async list(): Promise<PluginListResponse> {
    return asPluginListResponse(await apiClient.get('/plugins'));
  },

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await apiClient.patch(`/plugins/${encodeURIComponent(id)}/enabled`, { enabled });
  },

  async putConfig(id: string, config: PluginInstanceConfig): Promise<void> {
    await apiClient.put(`/plugins/${encodeURIComponent(id)}/config`, config);
  },
};
