export type PluginConfigFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'object';

export interface PluginConfigField {
  name: string;
  type: PluginConfigFieldType | string;
  enum_values: string[];
  description: string;
}

export interface PluginMenu {
  path: string;
  menu: string;
  description: string;
}

export interface PluginMetadata {
  name: string;
  version: string;
  author: string;
  github_repository: string;
  logo: string;
  config_fields: PluginConfigField[];
}

export interface PluginListEntry {
  id: string;
  path: string;
  configured: boolean;
  registered: boolean;
  enabled: boolean;
  effective_enabled: boolean;
  supports_oauth: boolean;
  logo: string;
  config_fields: PluginConfigField[];
  menus: PluginMenu[];
  metadata: PluginMetadata | null;
}

export interface PluginListResponse {
  plugins_enabled: boolean;
  plugins_dir: string;
  plugins: PluginListEntry[];
}

export type PluginInstanceConfig = Record<string, unknown>;
