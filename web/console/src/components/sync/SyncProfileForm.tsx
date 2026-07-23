/**
 * Create/Edit sync profile form. Renders a profile name input and a
 * vertical list of ToolCards — each tool is a slim row when unselected and
 * an expandable card with model picker, model filter (chips or regex), and
 * API key selector when selected. The persisted `model-filter` schema is
 * unchanged: chips serialise to a canonical anchored regex on save and are
 * decoded back from that shape on load.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { type SelectOption } from '@/components/ui/Select';
import { syncApi } from '@/services/api/sync';
import { useNotificationStore } from '@/stores';
import type { SyncProfile, SyncProfileTarget, SyncAvailableConfigs } from '@/types';
import { SYNC_TOOLS, type SyncToolId } from './constants';
import { ToolCard, type ToolCardConfig } from './ToolCard';
import { groupModels } from './modelGrouping';
import { decodeRegexAsList, encodeListAsRegex } from './modelFilterCodec';
import styles from './sync.module.scss';

interface SyncProfileFormProps {
  profile?: SyncProfile;
  onClose: () => void;
  onSaved: () => void;
}

type ToolConfigMap = Record<string, ToolCardConfig>;

function initialConfigFromTarget(target: SyncProfileTarget): ToolCardConfig {
  const decoded = decodeRegexAsList(target['model-filter'] ?? '');
  return {
    modelFilter: decoded.raw,
    modelFilterMode: decoded.mode,
    modelFilterChips: decoded.ids,
    apiKeyIndex: target['api-key-index'] !== undefined ? String(target['api-key-index']) : '',
    activeModel: target['active-model'] ?? '',
    collapsed: false,
  };
}

function emptyConfig(): ToolCardConfig {
  return {
    modelFilter: '',
    modelFilterMode: 'list',
    modelFilterChips: [],
    apiKeyIndex: '',
    activeModel: '',
    collapsed: false,
  };
}

export function SyncProfileForm({ profile, onClose, onSaved }: SyncProfileFormProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((s) => s.showNotification);
  const isEdit = profile !== undefined;

  const [name, setName] = useState(profile?.name ?? '');
  const [selectedTools, setSelectedTools] = useState<Set<SyncToolId>>(() => {
    const initial = new Set<SyncToolId>();
    profile?.targets?.forEach((target) => {
      if (target.tool) initial.add(target.tool as SyncToolId);
    });
    return initial;
  });
  const [toolConfigs, setToolConfigs] = useState<ToolConfigMap>(() => {
    const configs: ToolConfigMap = {};
    profile?.targets?.forEach((target) => {
      configs[target.tool] = initialConfigFromTarget(target);
    });
    return configs;
  });
  const [availableConfigs, setAvailableConfigs] = useState<SyncAvailableConfigs | null>(null);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  const [toolsError, setToolsError] = useState('');
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setConfigsLoading(true);
    syncApi
      .getSyncAvailableConfigs()
      .then((configs) => {
        if (!cancelled) setAvailableConfigs(configs);
      })
      .catch(() => {
        // Silently fail — pickers will simply show an empty catalog.
      })
      .finally(() => {
        if (!cancelled) setConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => groupModels(availableConfigs), [availableConfigs]);

  const apiKeyOptions: SelectOption[] = useMemo(() => {
    if (!availableConfigs) return [];
    const defaultMasked = availableConfigs.api_keys[0]?.masked;
    const defaultTail = defaultMasked ? extractTail(defaultMasked) : '';
    const defaultLabel = defaultTail
      ? t('sync_profiles.form.api_key_default_with_tail', {
          defaultValue: 'Default (Key #1 · ****{{tail}})',
          tail: defaultTail,
        })
      : t('sync_profiles.form.api_key_default', { defaultValue: 'Default (first key)' });
    const options: SelectOption[] = [{ value: '', label: defaultLabel }];
    availableConfigs.api_keys.forEach((key) => {
      const tail = extractTail(key.masked);
      options.push({
        value: String(key.index),
        label: t('sync_profiles.form.api_key_option_v2', {
          defaultValue: 'Key #{{index}} · ****{{tail}}',
          index: key.index + 1,
          tail,
        }),
      });
    });
    return options;
  }, [availableConfigs, t]);

  const toggleSelected = useCallback((toolId: SyncToolId) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
        setToolConfigs((cfgs) => (cfgs[toolId] ? cfgs : { ...cfgs, [toolId]: emptyConfig() }));
      }
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((toolId: SyncToolId) => {
    setToolConfigs((cfgs) => {
      const current = cfgs[toolId] ?? emptyConfig();
      return { ...cfgs, [toolId]: { ...current, collapsed: !current.collapsed } };
    });
  }, []);

  const patchConfig = useCallback((toolId: SyncToolId, patch: Partial<ToolCardConfig>) => {
    setToolConfigs((cfgs) => {
      const current = cfgs[toolId] ?? emptyConfig();
      return { ...cfgs, [toolId]: { ...current, ...patch } };
    });
  }, []);

  const requestModeSwitch = useCallback((toolId: SyncToolId, nextMode: 'list' | 'regex') => {
    setToolConfigs((cfgs) => {
      const current = cfgs[toolId] ?? emptyConfig();
      if (current.modelFilterMode === nextMode) return cfgs;

      if (nextMode === 'regex') {
        // list → regex: seed the input with the encoded chip set so the user
        // has a working starting point to edit.
        const encoded = encodeListAsRegex(current.modelFilterChips);
        return {
          ...cfgs,
          [toolId]: {
            ...current,
            modelFilterMode: 'regex',
            modelFilter: encoded || current.modelFilter,
          },
        };
      }

      // regex → list: decode the raw regex if it's expressible as a chip list,
      // otherwise warn and clear. Users can confirm to drop the regex.
      const decoded = decodeRegexAsList(current.modelFilter);
      if (decoded.mode === 'list') {
        return {
          ...cfgs,
          [toolId]: {
            ...current,
            modelFilterMode: 'list',
            modelFilterChips: decoded.ids,
          },
        };
      }
      const ok =
        current.modelFilter.trim() === '' ||
        window.confirm(
          // Inline string fallback — the form's t() isn't reachable from this callback
          // without threading; the prompt is short enough to inline safely.
          "The current regex can't be expressed as a list of model IDs. Switching modes will clear it. Continue?"
        );
      if (!ok) return cfgs;
      return {
        ...cfgs,
        [toolId]: {
          ...current,
          modelFilterMode: 'list',
          modelFilter: '',
          modelFilterChips: [],
        },
      };
    });
  }, []);

  const validate = (): boolean => {
    let valid = true;
    setNameError('');
    setToolsError('');
    if (!name.trim()) {
      setNameError(
        t('sync_profiles.validation.name_required', { defaultValue: 'Profile name is required' })
      );
      valid = false;
    }
    if (selectedTools.size === 0) {
      setToolsError(
        t('sync_profiles.validation.tools_required', { defaultValue: 'Select at least one tool' })
      );
      valid = false;
    }
    return valid;
  };

  const buildTargets = (): SyncProfileTarget[] => {
    return Array.from(selectedTools).map((toolId) => {
      const cfg = toolConfigs[toolId] ?? emptyConfig();
      const target: SyncProfileTarget = { tool: toolId };

      let filter = '';
      if (cfg.modelFilterMode === 'regex') {
        filter = cfg.modelFilter.trim();
      } else if (cfg.modelFilterChips.length > 0) {
        filter = encodeListAsRegex(cfg.modelFilterChips);
      }
      if (filter) target['model-filter'] = filter;

      if (cfg.apiKeyIndex !== '') {
        target['api-key-index'] = parseInt(cfg.apiKeyIndex, 10);
      }
      if (cfg.activeModel.trim()) {
        target['active-model'] = cfg.activeModel.trim();
      }
      return target;
    });
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setServerError('');
    setSubmitting(true);
    try {
      const profileData: SyncProfile = { name: name.trim(), targets: buildTargets() };

      if (isEdit && profile) {
        // Patch by the original name so the update targets the right
        // profile even if the list was reordered or edited elsewhere.
        await syncApi.updateSyncProfileByName(profile.name, profileData);
      } else {
        const current = await syncApi.getSyncProfiles();
        await syncApi.saveSyncProfiles([...current, profileData]);
      }

      showNotification(
        t(isEdit ? 'sync_profiles.notifications.updated' : 'sync_profiles.notifications.created', {
          defaultValue: isEdit ? 'Profile updated' : 'Profile created',
          name: name.trim(),
        }),
        'success'
      );
      onSaved();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setServerError(message);
      showNotification(
        t('sync_profiles.notifications.save_error', { defaultValue: 'Failed to save profile' }),
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      {serverError && <div className={styles.formError}>{serverError}</div>}

      <div className={styles.formSection}>
        <label className={styles.formLabel} htmlFor="sync-profile-name">
          {t('sync_profiles.form.name_label', { defaultValue: 'Profile name' })}
        </label>
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
        />
      </div>

      <div className={styles.formSection}>
        <h4 className={styles.formSectionTitle}>
          {t('sync_profiles.form.tools_section', { defaultValue: 'Tools' })}
        </h4>
        <p className={styles.formSectionHint}>
          {t('sync_profiles.form.tools_section_hint', {
            defaultValue:
              'Pick the tools this profile should configure. Selected tools expand into a config card.',
          })}
        </p>
        <div className={styles.toolCardList}>
          {SYNC_TOOLS.map((tool) => {
            const selected = selectedTools.has(tool.id);
            const config = toolConfigs[tool.id] ?? emptyConfig();
            return (
              <ToolCard
                key={tool.id}
                toolId={tool.id}
                selected={selected}
                config={config}
                groups={groups}
                apiKeyOptions={apiKeyOptions}
                configsLoading={configsLoading}
                disabled={submitting}
                onToggleSelected={toggleSelected}
                onToggleCollapsed={toggleCollapsed}
                onChange={patchConfig}
                onRequestModeSwitch={requestModeSwitch}
              />
            );
          })}
        </div>
        {toolsError && <div className={styles.toolsError}>{toolsError}</div>}
      </div>

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

function extractTail(masked: string): string {
  // Mask format is `**...**abcd` — strip leading '*' to get the visible tail.
  return masked.replace(/^\**/, '');
}
