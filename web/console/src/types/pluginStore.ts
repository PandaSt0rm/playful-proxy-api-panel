// Mirrors the Go management plugin-store DTOs in
// internal/api/handlers/management/plugin_store.go (snake_case JSON fields).

export interface PluginStoreSource {
  id: string;
  name: string;
  url: string;
}

export interface PluginStoreSourceError {
  source_id: string;
  source_name: string;
  source_url: string;
  message: string;
}

export interface PluginStoreEntry {
  store_id: string;
  source_id: string;
  source_name: string;
  source_url: string;
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  repository: string;
  install_type: string;
  auth_required: boolean;
  auth_configured: boolean;
  logo: string;
  homepage: string;
  license: string;
  tags: string[];
  installed: boolean;
  installed_version: string;
  path: string;
  configured: boolean;
  registered: boolean;
  enabled: boolean;
  effective_enabled: boolean;
  update_available: boolean;
}

export interface PluginStoreListResponse {
  plugins_enabled: boolean;
  plugins_dir: string;
  sources: PluginStoreSource[];
  source_errors: PluginStoreSourceError[];
  plugins: PluginStoreEntry[];
}

export interface PluginInstallResult {
  status: string;
  source_id: string;
  source_name: string;
  source_url: string;
  id: string;
  version: string;
  install_type: string;
  path: string;
  plugins_enabled: boolean;
  restart_required: boolean;
}
