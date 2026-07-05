import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parse as parseYaml } from 'yaml';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useNotificationStore } from '@/stores';
import { configFileApi } from '@/services/api/configFile';
import { pluginsApi } from '@/services/api/plugins';
import { PluginStore } from '@/components/plugins/PluginStore';
import { isRestartRequiredError } from '@/services/api/pluginStore';
import type {
  PluginConfigField,
  PluginInstanceConfig,
  PluginListEntry,
  PluginListResponse,
} from '@/types/plugins';
import styles from './PluginsPage.module.scss';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractPluginConfigs = (configYaml: string): Record<string, PluginInstanceConfig> => {
  try {
    const parsed: unknown = parseYaml(configYaml);
    if (!isRecord(parsed)) return {};
    const plugins = parsed.plugins;
    if (!isRecord(plugins)) return {};
    const configs = plugins.configs;
    if (!isRecord(configs)) return {};
    const out: Record<string, PluginInstanceConfig> = {};
    for (const [id, item] of Object.entries(configs)) {
      if (isRecord(item)) out[id] = item;
    }
    return out;
  } catch {
    return {};
  }
};

const fieldEditorValue = (value: unknown, field: PluginConfigField): string => {
  if (value === undefined || value === null) return '';
  if (field.type === 'array' || field.type === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

interface ConfigDraft {
  pluginId: string;
  fields: PluginConfigField[];
  values: Record<string, string>;
  booleans: Record<string, boolean>;
  priority: string;
  base: PluginInstanceConfig;
}

const buildDraft = (
  plugin: PluginListEntry,
  current: PluginInstanceConfig | undefined
): ConfigDraft => {
  const base: PluginInstanceConfig = current ? { ...current } : {};
  const fields = plugin.config_fields.filter((field) => field.name !== '');
  const values: Record<string, string> = {};
  const booleans: Record<string, boolean> = {};
  for (const field of fields) {
    if (field.type === 'boolean') {
      booleans[field.name] = Boolean(base[field.name]);
    } else {
      values[field.name] = fieldEditorValue(base[field.name], field);
    }
  }
  const priorityRaw = base.priority;
  const priority =
    typeof priorityRaw === 'number' && Number.isFinite(priorityRaw) ? String(priorityRaw) : '';
  return { pluginId: plugin.id, fields, values, booleans, priority, base };
};

const draftToConfig = (draft: ConfigDraft): { config: PluginInstanceConfig; error?: string } => {
  const config: PluginInstanceConfig = { ...draft.base };
  for (const field of draft.fields) {
    if (field.type === 'boolean') {
      config[field.name] = draft.booleans[field.name] ?? false;
      continue;
    }
    const raw = (draft.values[field.name] ?? '').trim();
    if (raw === '') {
      delete config[field.name];
      continue;
    }
    if (field.type === 'integer') {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed)) return { config, error: field.name };
      config[field.name] = parsed;
    } else if (field.type === 'number') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return { config, error: field.name };
      config[field.name] = parsed;
    } else if (field.type === 'array' || field.type === 'object') {
      try {
        const parsed: unknown = JSON.parse(raw);
        const wantArray = field.type === 'array';
        if (wantArray !== Array.isArray(parsed)) return { config, error: field.name };
        config[field.name] = parsed;
      } catch {
        return { config, error: field.name };
      }
    } else {
      config[field.name] = raw;
    }
  }
  const priorityRaw = draft.priority.trim();
  if (priorityRaw === '') {
    delete config.priority;
  } else {
    const parsed = Number(priorityRaw);
    if (!Number.isInteger(parsed)) return { config, error: 'priority' };
    config.priority = parsed;
  }
  return { config };
};

export function PluginsPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [data, setData] = useState<PluginListResponse | null>(null);
  const [configs, setConfigs] = useState<Record<string, PluginInstanceConfig>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, configYaml] = await Promise.all([
        pluginsApi.list(),
        configFileApi.fetchConfigYaml().catch(() => ''),
      ]);
      setData(list);
      setConfigs(extractPluginConfigs(configYaml));
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('plugins.load_failed', { defaultValue: 'Failed to load plugins.' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(
    async (plugin: PluginListEntry, enabled: boolean) => {
      setTogglingId(plugin.id);
      try {
        await pluginsApi.setEnabled(plugin.id, enabled);
        setData((prev) =>
          prev
            ? {
                ...prev,
                plugins: prev.plugins.map((item) =>
                  item.id === plugin.id
                    ? {
                        ...item,
                        enabled,
                        configured: true,
                        effective_enabled: prev.plugins_enabled && enabled && item.registered,
                      }
                    : item
                ),
              }
            : prev
        );
        showNotification(
          t('plugins.toggle_success', {
            defaultValue: 'Plugin "{{id}}" {{state}}.',
            id: plugin.id,
            state: enabled
              ? t('plugins.state_enabled', { defaultValue: 'enabled' })
              : t('plugins.state_disabled', { defaultValue: 'disabled' }),
          }),
          'success'
        );
      } catch (err: unknown) {
        showNotification(
          getErrorMessage(err) ||
            t('plugins.toggle_failed', { defaultValue: 'Failed to update plugin state.' }),
          'error'
        );
      } finally {
        setTogglingId(null);
      }
    },
    [showNotification, t]
  );

  const handleDelete = useCallback(
    async (plugin: PluginListEntry) => {
      const confirmed = window.confirm(
        t('plugins.delete_confirm', {
          defaultValue:
            'Delete plugin "{{id}}"? This removes its library file from the plugins directory.',
          id: plugin.id,
        })
      );
      if (!confirmed) return;
      setDeletingId(plugin.id);
      try {
        await pluginsApi.remove(plugin.id);
        showNotification(
          t('plugins.delete_success', {
            defaultValue: 'Plugin "{{id}}" deleted.',
            id: plugin.id,
          }),
          'success'
        );
        await load();
      } catch (err: unknown) {
        if (isRestartRequiredError(err)) {
          showNotification(
            t('plugins.delete_restart', {
              defaultValue:
                'Plugin "{{id}}" is currently loaded. Restart the server to remove it.',
              id: plugin.id,
            }),
            'warning'
          );
        } else {
          showNotification(
            getErrorMessage(err) ||
              t('plugins.delete_failed', { defaultValue: 'Failed to delete plugin.' }),
            'error'
          );
        }
      } finally {
        setDeletingId(null);
      }
    },
    [load, showNotification, t]
  );

  const openConfigEditor = useCallback(
    (plugin: PluginListEntry) => {
      setDraft(buildDraft(plugin, configs[plugin.id]));
    },
    [configs]
  );

  const handleSaveConfig = useCallback(async () => {
    if (!draft) return;
    const { config, error: fieldError } = draftToConfig(draft);
    if (fieldError) {
      showNotification(
        t('plugins.invalid_field', {
          defaultValue: 'Invalid value for "{{field}}".',
          field: fieldError,
        }),
        'error'
      );
      return;
    }
    setSaving(true);
    try {
      await pluginsApi.putConfig(draft.pluginId, config);
      setConfigs((prev) => ({ ...prev, [draft.pluginId]: config }));
      setDraft(null);
      showNotification(
        t('plugins.config_saved', { defaultValue: 'Plugin configuration saved.' }),
        'success'
      );
    } catch (err: unknown) {
      showNotification(
        getErrorMessage(err) ||
          t('plugins.config_save_failed', { defaultValue: 'Failed to save plugin configuration.' }),
        'error'
      );
    } finally {
      setSaving(false);
    }
  }, [draft, showNotification, t]);

  const plugins = useMemo(() => data?.plugins ?? [], [data]);

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>{t('plugins.title', { defaultValue: 'Plugins' })}</h1>
        <div className={styles.loadingState}>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>{t('plugins.title', { defaultValue: 'Plugins' })}</h1>
        <Card>
          <div className={styles.errorState}>
            <p>{error}</p>
            <Button variant="secondary" onClick={() => void load()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('plugins.title', { defaultValue: 'Plugins' })}</h1>
      <p className={styles.pageHint}>
        {t('plugins.description', {
          defaultValue:
            'Manage dynamic library plugins discovered in the plugins directory. Plugins are trusted in-process code.',
        })}
      </p>

      <Card>
        <div className={styles.globalRow}>
          <div>
            <div className={styles.globalTitle}>
              {t('plugins.global_state', { defaultValue: 'Plugin system' })}
              <span
                className={data?.plugins_enabled ? styles.badgeOn : styles.badgeOff}
                data-testid="plugins-global-state"
              >
                {data?.plugins_enabled
                  ? t('plugins.state_enabled', { defaultValue: 'enabled' })
                  : t('plugins.state_disabled', { defaultValue: 'disabled' })}
              </span>
            </div>
            <div className={styles.globalHint}>
              {t('plugins.global_hint', {
                defaultValue:
                  'The global switch and directory ({{dir}}) are managed in the config editor.',
                dir: data?.plugins_dir ?? 'plugins',
              })}
            </div>
          </div>
        </div>
      </Card>

      {plugins.length === 0 ? (
        <Card>
          <EmptyState
            title={t('plugins.empty_title', { defaultValue: 'No plugins found' })}
            description={t('plugins.empty_desc', {
              defaultValue: 'Place plugin libraries in the plugins directory and restart.',
            })}
          />
        </Card>
      ) : (
        <div className={styles.pluginList}>
          {plugins.map((plugin) => {
            const meta = plugin.metadata;
            const displayName = meta?.name || plugin.id;
            return (
              <Card key={plugin.id} className={styles.pluginCard}>
                <div className={styles.pluginHeader}>
                  <div className={styles.pluginIdentity}>
                    {plugin.logo ? (
                      <img className={styles.pluginLogo} src={plugin.logo} alt="" aria-hidden />
                    ) : null}
                    <div>
                      <div className={styles.pluginName}>
                        {displayName}
                        {meta?.version ? (
                          <span className={styles.pluginVersion}>v{meta.version}</span>
                        ) : null}
                      </div>
                      <div className={styles.pluginMeta}>
                        <code>{plugin.id}</code>
                        {meta?.author ? <span>{meta.author}</span> : null}
                      </div>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={plugin.enabled}
                    disabled={togglingId === plugin.id}
                    onChange={(enabled) => void handleToggle(plugin, enabled)}
                    ariaLabel={t('plugins.toggle_aria', {
                      defaultValue: 'Toggle plugin {{id}}',
                      id: plugin.id,
                    })}
                  />
                </div>
                <div className={styles.badgeRow}>
                  <span className={plugin.registered ? styles.badgeOn : styles.badgeOff}>
                    {plugin.registered
                      ? t('plugins.badge_registered', { defaultValue: 'registered' })
                      : t('plugins.badge_unregistered', { defaultValue: 'not registered' })}
                  </span>
                  <span className={plugin.effective_enabled ? styles.badgeOn : styles.badgeOff}>
                    {plugin.effective_enabled
                      ? t('plugins.badge_active', { defaultValue: 'active' })
                      : t('plugins.badge_inactive', { defaultValue: 'inactive' })}
                  </span>
                  {plugin.supports_oauth ? (
                    <span className={styles.badgeNeutral}>
                      {plugin.oauth_provider
                        ? t('plugins.badge_oauth_provider', {
                            defaultValue: 'OAuth: {{provider}}',
                            provider: plugin.oauth_provider,
                          })
                        : t('plugins.badge_oauth', { defaultValue: 'OAuth provider' })}
                    </span>
                  ) : null}
                  {plugin.configured ? (
                    <span className={styles.badgeNeutral}>
                      {t('plugins.badge_configured', { defaultValue: 'configured' })}
                    </span>
                  ) : null}
                </div>
                {plugin.menus.length > 0 ? (
                  <div className={styles.menuList}>
                    {plugin.menus.map((menu) => (
                      <a
                        key={menu.path}
                        className={styles.menuLink}
                        href={menu.path}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {menu.menu || menu.path}
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className={styles.pluginActions}>
                  <Button variant="secondary" size="sm" onClick={() => openConfigEditor(plugin)}>
                    {t('plugins.edit_config', { defaultValue: 'Edit configuration' })}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(plugin)}
                    loading={deletingId === plugin.id}
                  >
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </Button>
                  {meta?.github_repository ? (
                    <a
                      className={styles.repoLink}
                      href={meta.github_repository}
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub
                    </a>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PluginStore onChanged={() => void load()} />

      <Modal
        open={draft !== null}
        title={t('plugins.edit_config_title', {
          defaultValue: 'Configure plugin "{{id}}"',
          id: draft?.pluginId ?? '',
        })}
        onClose={() => setDraft(null)}
        footer={
          <div className={styles.modalFooter}>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button onClick={() => void handleSaveConfig()} loading={saving}>
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className={styles.configForm}>
            <Input
              label={t('plugins.field_priority', { defaultValue: 'Priority' })}
              hint={t('plugins.field_priority_hint', {
                defaultValue: 'Higher priority plugins win route and flag conflicts.',
              })}
              type="number"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            />
            {draft.fields.length === 0 ? (
              <p className={styles.noFieldsHint}>
                {t('plugins.no_fields', {
                  defaultValue:
                    'This plugin does not declare configuration fields. Edit advanced settings in the config source editor.',
                })}
              </p>
            ) : (
              draft.fields.map((field) => {
                if (field.type === 'boolean') {
                  return (
                    <div key={field.name} className={styles.booleanField}>
                      <ToggleSwitch
                        checked={draft.booleans[field.name] ?? false}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            booleans: { ...draft.booleans, [field.name]: value },
                          })
                        }
                        label={field.name}
                      />
                      {field.description ? (
                        <div className={styles.fieldDescription}>{field.description}</div>
                      ) : null}
                    </div>
                  );
                }
                if (field.type === 'enum' && field.enum_values.length > 0) {
                  return (
                    <div key={field.name} className={styles.enumField}>
                      <div className={styles.fieldLabel}>{field.name}</div>
                      <Select
                        value={draft.values[field.name] ?? ''}
                        options={field.enum_values.map((option) => ({
                          value: option,
                          label: option,
                        }))}
                        onChange={(value) =>
                          setDraft({ ...draft, values: { ...draft.values, [field.name]: value } })
                        }
                        ariaLabel={field.name}
                        fullWidth
                      />
                      {field.description ? (
                        <div className={styles.fieldDescription}>{field.description}</div>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <Input
                    key={field.name}
                    label={field.name}
                    hint={
                      field.description ||
                      (field.type === 'array' || field.type === 'object'
                        ? t('plugins.field_json_hint', { defaultValue: 'JSON value' })
                        : undefined)
                    }
                    type={field.type === 'integer' || field.type === 'number' ? 'number' : 'text'}
                    value={draft.values[field.name] ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        values: { ...draft.values, [field.name]: e.target.value },
                      })
                    }
                  />
                );
              })
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
