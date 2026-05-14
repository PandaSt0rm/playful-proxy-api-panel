/**
 * Create/Edit sync profile form.
 * Handles name input, tool selection checkboxes, per-tool model filter,
 * active model dropdown, and API key index selector.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { syncApi } from '@/services/api/sync';
import { useNotificationStore } from '@/stores';
import type { SyncProfile, SyncProfileTarget, SyncAvailableConfigs } from '@/types';
import { SYNC_TOOLS, type SyncToolId } from './constants';
import styles from './sync.module.scss';

interface SyncProfileFormProps {
  profile?: SyncProfile;
  profileIndex?: number;
  onClose: () => void;
  onSaved: () => void;
}

interface ToolConfig {
  tool: SyncToolId;
  modelFilter: string;
  apiKeyIndex: string;
  activeModel: string;
}

function toolLabel(t: (key: string, options?: Record<string, unknown>) => string, toolId: string): string {
  const entry = SYNC_TOOLS.find((t) => t.id === toolId);
  return entry ? t(entry.labelKey, { defaultValue: toolId }) : toolId;
}

export function SyncProfileForm({ profile, profileIndex, onClose, onSaved }: SyncProfileFormProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((s) => s.showNotification);

  const isEdit = profile !== undefined && profileIndex !== undefined;

  const [name, setName] = useState(profile?.name ?? '');
  const [selectedTools, setSelectedTools] = useState<Set<SyncToolId>>(() => {
    const initial = new Set<SyncToolId>();
    profile?.targets?.forEach((target) => {
      if (target.tool) initial.add(target.tool as SyncToolId);
    });
    return initial;
  });
  const [toolConfigs, setToolConfigs] = useState<Record<string, ToolConfig>>(() => {
    const configs: Record<string, ToolConfig> = {};
    profile?.targets?.forEach((target) => {
      configs[target.tool] = {
        tool: target.tool as SyncToolId,
        modelFilter: target['model-filter'] ?? '',
        apiKeyIndex: target['api-key-index'] !== undefined ? String(target['api-key-index']) : '',
        activeModel: target['active-model'] ?? '',
      };
    });
    return configs;
  });
  const [availableConfigs, setAvailableConfigs] = useState<SyncAvailableConfigs | null>(null);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  const [toolsError, setToolsError] = useState('');
  const [serverError, setServerError] = useState('');

  // Fetch available configs for model dropdowns and API key selectors
  useEffect(() => {
    let cancelled = false;
    setConfigsLoading(true);
    syncApi
      .getSyncAvailableConfigs()
      .then((configs) => {
        if (cancelled) return;
        setAvailableConfigs(configs);
      })
      .catch(() => {
        // Silently fail — dropdowns will just be empty
      })
      .finally(() => {
        if (!cancelled) setConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const modelOptions: SelectOption[] = useMemo(() => {
    if (!availableConfigs) return [];
    return availableConfigs.all_models.map((model) => ({
      value: model,
      label: model,
    }));
  }, [availableConfigs]);

  const apiKeyOptions: SelectOption[] = useMemo(() => {
    if (!availableConfigs) return [];
    const options: SelectOption[] = [
      { value: '', label: t('sync_profiles.form.api_key_default', { defaultValue: 'Default (first key)' }) },
    ];
    availableConfigs.api_keys.forEach((key) => {
      options.push({
        value: String(key.index),
        label: t('sync_profiles.form.api_key_option', {
          defaultValue: 'Key #{{index}}: {{masked}}',
          index: key.index + 1,
          masked: key.masked,
        }),
      });
    });
    return options;
  }, [availableConfigs, t]);

  const toggleTool = useCallback((toolId: SyncToolId) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
        // Initialize config defaults if not present
        setToolConfigs((prevConfigs) => {
          if (prevConfigs[toolId]) return prevConfigs;
          return {
            ...prevConfigs,
            [toolId]: { tool: toolId, modelFilter: '', apiKeyIndex: '', activeModel: '' },
          };
        });
      }
      return next;
    });
  }, []);

  const updateToolConfig = useCallback(
    (toolId: string, field: keyof ToolConfig, value: string) => {
      setToolConfigs((prev) => ({
        ...prev,
        [toolId]: {
          ...(prev[toolId] ?? { tool: toolId as SyncToolId, modelFilter: '', apiKeyIndex: '', activeModel: '' }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const validate = (): boolean => {
    let valid = true;
    setNameError('');
    setToolsError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t('sync_profiles.validation.name_required', { defaultValue: 'Profile name is required' }));
      valid = false;
    }

    if (selectedTools.size === 0) {
      setToolsError(t('sync_profiles.validation.tools_required', { defaultValue: 'Select at least one tool' }));
      valid = false;
    }

    return valid;
  };

  const buildTargets = (): SyncProfileTarget[] => {
    return Array.from(selectedTools).map((toolId) => {
      const config = toolConfigs[toolId];
      const target: SyncProfileTarget = { tool: toolId };
      if (config?.modelFilter?.trim()) {
        target['model-filter'] = config.modelFilter.trim();
      }
      if (config?.apiKeyIndex !== undefined && config.apiKeyIndex !== '') {
        target['api-key-index'] = parseInt(config.apiKeyIndex, 10);
      }
      if (config?.activeModel?.trim()) {
        target['active-model'] = config.activeModel.trim();
      }
      return target;
    });
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setServerError('');
    setSubmitting(true);

    try {
      const profileData: SyncProfile = {
        name: name.trim(),
        targets: buildTargets(),
      };

      if (isEdit) {
        // For edit, we need to update the profile in the full list.
        // Fetch the current list, replace the profile at the given index, and PUT the full list.
        const currentProfiles = await syncApi.getSyncProfiles();
        const updatedProfiles = [...currentProfiles];
        updatedProfiles[profileIndex] = profileData;
        await syncApi.saveSyncProfiles(updatedProfiles);
      } else {
        // For create, fetch current list, append, and PUT.
        const currentProfiles = await syncApi.getSyncProfiles();
        await syncApi.saveSyncProfiles([...currentProfiles, profileData]);
      }

      showNotification(
        t(isEdit ? 'sync_profiles.notifications.updated' : 'sync_profiles.notifications.created', {
          defaultValue: isEdit ? 'Profile updated' : 'Profile created',
          name: name.trim(),
        }),
        'success',
      );
      onSaved();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setServerError(message);
      showNotification(
        t('sync_profiles.notifications.save_error', { defaultValue: 'Failed to save profile' }),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const sortedTools = Array.from(selectedTools).sort();

  return (
    <div className={styles.form}>
      {serverError && <div className={styles.formError}>{serverError}</div>}

      {/* Profile Name */}
      <div className={styles.formSection}>
        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="sync-profile-name">
            {t('sync_profiles.form.name_label', { defaultValue: 'Profile name' })}
          </label>
          <div className={styles.formField}>
            <Input
              id="sync-profile-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              placeholder={t('sync_profiles.form.name_placeholder', {
                defaultValue: 'e.g., Production, Staging',
              })}
              error={nameError}
              disabled={submitting}
              aria-describedby={nameError ? 'sync-profile-name-error' : undefined}
            />
          </div>
        </div>
      </div>

      {/* Tool Selection */}
      <div className={styles.formSection}>
        <h4 className={styles.formSectionTitle}>
          {t('sync_profiles.form.tools_section', { defaultValue: 'Select tools to sync' })}
        </h4>
        <div className={styles.toolGrid}>
          {SYNC_TOOLS.map((tool) => {
            const checked = selectedTools.has(tool.id);
            return (
              <label
                key={tool.id}
                className={`${styles.toolCheckbox} ${checked ? styles.toolCheckboxChecked : ''}`.trim()}
              >
                <input
                  type="checkbox"
                  className={styles.toolCheckboxInput}
                  checked={checked}
                  onChange={() => toggleTool(tool.id)}
                  disabled={submitting}
                />
                <span className={styles.toolCheckboxLabel}>{t(tool.labelKey, { defaultValue: tool.id })}</span>
              </label>
            );
          })}
        </div>
        {toolsError && <div className={styles.toolsError}>{toolsError}</div>}
      </div>

      {/* Per-Tool Configuration */}
      {sortedTools.length > 0 && (
        <div className={styles.formSection}>
          <h4 className={styles.formSectionTitle}>
            {t('sync_profiles.form.per_tool_config', { defaultValue: 'Per-tool configuration' })}
          </h4>
          <div className={styles.toolConfigs}>
            {sortedTools.map((toolId) => {
              const config = toolConfigs[toolId] ?? {
                tool: toolId,
                modelFilter: '',
                apiKeyIndex: '',
                activeModel: '',
              };
              return (
                <div key={toolId} className={styles.toolConfigBlock}>
                  <div className={styles.toolConfigHeader}>
                    {toolLabel(t, toolId)}
                  </div>
                  <div className={styles.toolConfigBody}>
                    <div className={styles.toolConfigField}>
                      <label className={styles.toolConfigLabel} htmlFor={`filter-${toolId}`}>
                        {t('sync_profiles.form.model_filter_label', { defaultValue: 'Model filter (regex)' })}
                      </label>
                      <Input
                        id={`filter-${toolId}`}
                        value={config.modelFilter}
                        onChange={(e) => updateToolConfig(toolId, 'modelFilter', e.target.value)}
                        placeholder={t('sync_profiles.form.model_filter_placeholder', {
                          defaultValue: 'e.g., gpt-4.*',
                        })}
                        disabled={submitting}
                        hint={t('sync_profiles.form.model_filter_hint', {
                          defaultValue: 'Optional regex to filter models',
                        })}
                      />
                    </div>
                    <div className={styles.toolConfigField}>
                      <label className={styles.toolConfigLabel} htmlFor={`model-${toolId}`}>
                        {t('sync_profiles.form.active_model_label', { defaultValue: 'Active model' })}
                      </label>
                      <Select
                        id={`model-${toolId}`}
                        value={config.activeModel}
                        options={modelOptions}
                        onChange={(val) => updateToolConfig(toolId, 'activeModel', val)}
                        disabled={submitting || configsLoading}
                        placeholder={t('sync_profiles.form.active_model_placeholder', {
                          defaultValue: configsLoading
                            ? t('common.loading', { defaultValue: 'Loading...' })
                            : t('sync_profiles.form.active_model_none', { defaultValue: 'None (use first available)' }),
                        })}
                        ariaLabel={t('sync_profiles.form.active_model_label', { defaultValue: 'Active model' })}
                      />
                    </div>
                    <div className={styles.toolConfigField}>
                      <label className={styles.toolConfigLabel} htmlFor={`apikey-${toolId}`}>
                        {t('sync_profiles.form.api_key_label', { defaultValue: 'API key' })}
                      </label>
                      <Select
                        id={`apikey-${toolId}`}
                        value={config.apiKeyIndex}
                        options={apiKeyOptions}
                        onChange={(val) => updateToolConfig(toolId, 'apiKeyIndex', val)}
                        disabled={submitting || configsLoading}
                        placeholder={t('sync_profiles.form.api_key_placeholder', {
                          defaultValue: 'Default',
                        })}
                        ariaLabel={t('sync_profiles.form.api_key_label', { defaultValue: 'API key' })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Form Actions */}
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={submitting}>
          {isEdit
            ? t('common.save', { defaultValue: 'Save' })
            : t('sync_profiles.form.create_button', { defaultValue: 'Create Profile' })}
        </Button>
      </div>
    </div>
  );
}
