import { apiClient } from './client';
import type {
  PluginInstallResult,
  PluginStoreEntry,
  PluginStoreListResponse,
  PluginStoreSource,
  PluginStoreSourceError,
} from '@/types/pluginStore';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const asSource = (value: unknown): PluginStoreSource | null => {
  if (!isRecord(value)) return null;
  return { id: asString(value.id), name: asString(value.name), url: asString(value.url) };
};

const asSourceError = (value: unknown): PluginStoreSourceError | null => {
  if (!isRecord(value)) return null;
  return {
    source_id: asString(value.source_id),
    source_name: asString(value.source_name),
    source_url: asString(value.source_url),
    message: asString(value.message),
  };
};

const asEntry = (value: unknown): PluginStoreEntry | null => {
  if (!isRecord(value) || asString(value.id) === '') return null;
  return {
    store_id: asString(value.store_id),
    source_id: asString(value.source_id),
    source_name: asString(value.source_name),
    source_url: asString(value.source_url),
    id: asString(value.id),
    name: asString(value.name),
    description: asString(value.description),
    author: asString(value.author),
    version: asString(value.version),
    repository: asString(value.repository),
    logo: asString(value.logo),
    homepage: asString(value.homepage),
    license: asString(value.license),
    tags: asStringArray(value.tags),
    installed: Boolean(value.installed),
    installed_version: asString(value.installed_version),
    path: asString(value.path),
    configured: Boolean(value.configured),
    registered: Boolean(value.registered),
    enabled: Boolean(value.enabled),
    effective_enabled: Boolean(value.effective_enabled),
    update_available: Boolean(value.update_available),
  };
};

const asListResponse = (data: unknown): PluginStoreListResponse => {
  const value = isRecord(data) ? data : {};
  const sources = Array.isArray(value.sources)
    ? value.sources.map(asSource).filter((s): s is PluginStoreSource => s !== null)
    : [];
  const sourceErrors = Array.isArray(value.source_errors)
    ? value.source_errors
        .map(asSourceError)
        .filter((e): e is PluginStoreSourceError => e !== null)
    : [];
  const plugins = Array.isArray(value.plugins)
    ? value.plugins.map(asEntry).filter((p): p is PluginStoreEntry => p !== null)
    : [];
  return {
    plugins_enabled: Boolean(value.plugins_enabled),
    plugins_dir: typeof value.plugins_dir === 'string' ? value.plugins_dir : 'plugins',
    sources,
    source_errors: sourceErrors,
    plugins,
  };
};

const asInstallResult = (data: unknown): PluginInstallResult => {
  const value = isRecord(data) ? data : {};
  return {
    status: asString(value.status),
    source_id: asString(value.source_id),
    source_name: asString(value.source_name),
    source_url: asString(value.source_url),
    id: asString(value.id),
    version: asString(value.version),
    path: asString(value.path),
    plugins_enabled: Boolean(value.plugins_enabled),
    restart_required: Boolean(value.restart_required),
  };
};

export const pluginStoreApi = {
  async list(): Promise<PluginStoreListResponse> {
    return asListResponse(await apiClient.get('/plugin-store'));
  },

  async install(id: string, sourceId?: string): Promise<PluginInstallResult> {
    const query = sourceId ? `?source=${encodeURIComponent(sourceId)}` : '';
    return asInstallResult(
      await apiClient.post(`/plugin-store/${encodeURIComponent(id)}/install${query}`)
    );
  },
};
