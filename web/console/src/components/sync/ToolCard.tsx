/**
 * Per-tool card used by SyncProfileForm. Renders a slim row when not
 * selected and an expandable card with model/filter/api-key controls when
 * selected. Layout and persistence logic live here; the parent only
 * supplies the tool definition, the current config, and change callbacks.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { IconChevronUp, IconChevronDown } from '@/components/ui/icons';
import { ModelPicker } from './ModelPicker';
import type { ModelGroup } from './modelGrouping';
import { SYNC_TOOLS, type SyncToolId } from './constants';
import styles from './sync.module.scss';

export interface ToolCardConfig {
  modelFilter: string;
  modelFilterMode: 'list' | 'regex';
  modelFilterChips: string[];
  apiKeyIndex: string;
  activeModel: string;
  collapsed: boolean;
}

interface ToolCardProps {
  toolId: SyncToolId;
  selected: boolean;
  config: ToolCardConfig;
  groups: ModelGroup[];
  apiKeyOptions: SelectOption[];
  configsLoading: boolean;
  disabled: boolean;
  onToggleSelected: (toolId: SyncToolId) => void;
  onToggleCollapsed: (toolId: SyncToolId) => void;
  onChange: (toolId: SyncToolId, patch: Partial<ToolCardConfig>) => void;
  onRequestModeSwitch: (toolId: SyncToolId, nextMode: 'list' | 'regex') => void;
}

function toolLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  toolId: string
): string {
  const entry = SYNC_TOOLS.find((tool) => tool.id === toolId);
  return entry ? t(entry.labelKey, { defaultValue: toolId }) : toolId;
}

export function ToolCard({
  toolId,
  selected,
  config,
  groups,
  apiKeyOptions,
  configsLoading,
  disabled,
  onToggleSelected,
  onToggleCollapsed,
  onChange,
  onRequestModeSwitch,
}: ToolCardProps) {
  const { t } = useTranslation();
  const headerId = useId();
  const label = toolLabel(t, toolId);

  if (!selected) {
    return (
      <label className={styles.toolRowSlim}>
        <input
          type="checkbox"
          className={styles.toolRowCheckbox}
          checked={false}
          onChange={() => onToggleSelected(toolId)}
          disabled={disabled}
        />
        <span className={styles.toolRowLabel}>{label}</span>
      </label>
    );
  }

  return (
    <div className={`${styles.toolCard} ${config.collapsed ? styles.toolCardCollapsed : ''}`}>
      <div className={styles.toolCardHeader}>
        <label className={styles.toolCardHeaderLeft}>
          <input
            type="checkbox"
            className={styles.toolRowCheckbox}
            checked={true}
            onChange={() => onToggleSelected(toolId)}
            disabled={disabled}
            aria-labelledby={headerId}
          />
          <span id={headerId} className={styles.toolCardTitle}>
            {label}
          </span>
        </label>
        <button
          type="button"
          className={styles.toolCardCollapse}
          onClick={() => onToggleCollapsed(toolId)}
          aria-label={
            config.collapsed
              ? t('sync_profiles.form.expand', { defaultValue: 'Expand configuration' })
              : t('sync_profiles.form.collapse', { defaultValue: 'Collapse configuration' })
          }
          aria-expanded={!config.collapsed}
          disabled={disabled}
        >
          {config.collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
        </button>
      </div>

      {!config.collapsed && (
        <div className={styles.toolCardBody}>
          {/* Active model */}
          <div className={styles.toolCardField}>
            <label className={styles.toolCardLabel} htmlFor={`model-${toolId}`}>
              {t('sync_profiles.form.active_model_label', { defaultValue: 'Active model' })}
            </label>
            <ModelPicker
              triggerId={`model-${toolId}`}
              mode="active"
              value={config.activeModel}
              onChange={(val) => onChange(toolId, { activeModel: val })}
              groups={groups}
              loading={configsLoading}
              disabled={disabled}
              placeholder={
                configsLoading
                  ? t('common.loading', { defaultValue: 'Loading…' })
                  : t('sync_profiles.form.active_model_none', {
                      defaultValue: 'None (use first available)',
                    })
              }
              ariaLabel={t('sync_profiles.form.active_model_label', {
                defaultValue: 'Active model',
              })}
              searchPlaceholder={t('sync_profiles.form.model_picker_search', {
                defaultValue: 'Search models',
              })}
              emptyHint={t('sync_profiles.form.model_picker_empty', {
                defaultValue: 'No models found',
              })}
            />
          </div>

          {/* Model filter (segmented: chips list / regex) */}
          <div className={styles.toolCardField}>
            <label className={styles.toolCardLabel}>
              {t('sync_profiles.form.model_filter_label', { defaultValue: 'Model filter' })}
            </label>
            <div className={styles.segmented} role="tablist" aria-label="Filter mode">
              <button
                type="button"
                role="tab"
                aria-selected={config.modelFilterMode === 'list'}
                className={`${styles.segmentedButton} ${config.modelFilterMode === 'list' ? styles.segmentedButtonActive : ''}`}
                onClick={() => onRequestModeSwitch(toolId, 'list')}
                disabled={disabled}
              >
                {t('sync_profiles.form.filter_mode_list', { defaultValue: 'Pick models' })}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={config.modelFilterMode === 'regex'}
                className={`${styles.segmentedButton} ${config.modelFilterMode === 'regex' ? styles.segmentedButtonActive : ''}`}
                onClick={() => onRequestModeSwitch(toolId, 'regex')}
                disabled={disabled}
              >
                {t('sync_profiles.form.filter_mode_regex', { defaultValue: 'Regex (advanced)' })}
              </button>
            </div>

            {config.modelFilterMode === 'list' ? (
              <ModelPicker
                triggerId={`filter-${toolId}`}
                mode="filter-list"
                values={config.modelFilterChips}
                onChange={(values) => onChange(toolId, { modelFilterChips: values })}
                groups={groups}
                loading={configsLoading}
                disabled={disabled}
                placeholder={t('sync_profiles.form.filter_pick_placeholder', {
                  defaultValue: 'Add models',
                })}
                ariaLabel={t('sync_profiles.form.model_filter_label', {
                  defaultValue: 'Model filter',
                })}
                searchPlaceholder={t('sync_profiles.form.model_picker_search', {
                  defaultValue: 'Search models',
                })}
                emptyHint={t('sync_profiles.form.model_picker_empty', {
                  defaultValue: 'No models found',
                })}
              />
            ) : (
              <Input
                id={`filter-${toolId}`}
                value={config.modelFilter}
                onChange={(e) => onChange(toolId, { modelFilter: e.target.value })}
                placeholder={t('sync_profiles.form.filter_regex_placeholder', {
                  defaultValue: 'e.g., ^gpt-.*',
                })}
                hint={t('sync_profiles.form.filter_regex_hint', {
                  defaultValue: 'Matches any model whose ID matches this regex.',
                })}
                disabled={disabled}
              />
            )}
          </div>

          {/* API key */}
          <div className={styles.toolCardField}>
            <label className={styles.toolCardLabel} htmlFor={`apikey-${toolId}`}>
              {t('sync_profiles.form.api_key_label', { defaultValue: 'API key' })}
            </label>
            <Select
              id={`apikey-${toolId}`}
              value={config.apiKeyIndex}
              options={apiKeyOptions}
              onChange={(val) => onChange(toolId, { apiKeyIndex: val })}
              disabled={disabled || configsLoading}
              placeholder={t('sync_profiles.form.api_key_placeholder', { defaultValue: 'Default' })}
              ariaLabel={t('sync_profiles.form.api_key_label', { defaultValue: 'API key' })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
