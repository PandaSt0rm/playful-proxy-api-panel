import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconCheck, IconX } from '@/components/ui/icons';
import iconOllamaLight from '@/assets/icons/ollama-light.svg';
import iconOllamaDark from '@/assets/icons/ollama-dark.svg';
import { useThemeStore } from '@/stores';
import type { OpenAIProviderConfig, UpstreamConcurrencyConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import { statusBarDataFromRecentRequests } from '@/utils/recentRequests';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderConcurrencyBadge } from '../ProviderConcurrencyBadge';
import { ProviderStatusBar } from '../ProviderStatusBar';
import {
  getOpenAIProviderRecentStatusData,
  getOpenAIProviderTotalStats,
  getProviderTotalStats,
  type ProviderRecentUsageMap,
} from '../utils';

export interface IndexedOllamaCloudProvider {
  config: OpenAIProviderConfig;
  originalIndex: number;
}

interface OllamaCloudSectionProps {
  providers: IndexedOllamaCloudProvider[];
  upstreamConcurrency?: UpstreamConcurrencyConfig;
  usageByProvider: ProviderRecentUsageMap;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
}

const EMPTY_STATUS_BAR = statusBarDataFromRecentRequests([]);

export function OllamaCloudSection({
  providers,
  upstreamConcurrency,
  usageByProvider,
  loading,
  disableControls,
  isSwitching,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
}: OllamaCloudSectionProps) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const iconOllama = resolvedTheme === 'dark' ? iconOllamaDark : iconOllamaLight;
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      const priorityA = a.config.priority ?? Number.MAX_SAFE_INTEGER;
      const priorityB = b.config.priority ?? Number.MAX_SAFE_INTEGER;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.config.name.localeCompare(b.config.name);
    });
  }, [providers]);

  const renderProviderCard = ({ config: provider, originalIndex }: IndexedOllamaCloudProvider) => {
    const stats = getOpenAIProviderTotalStats(provider, usageByProvider);
    const apiKeyEntries = provider.apiKeyEntries || [];
    const headerEntries = Object.entries(provider.headers || {});
    const statusData =
      getOpenAIProviderRecentStatusData(provider, usageByProvider) || EMPTY_STATUS_BAR;
    const providerDisabled = provider.disabled === true;

    return (
      <div
        key={`ollama-provider-${originalIndex}`}
        className={styles.openaiProviderCard}
        style={actionsDisabled ? { opacity: 0.6 } : undefined}
      >
        <div className={styles.openaiProviderMeta}>
          <div className={styles.openaiProviderTitle}>{provider.name || 'Ollama Cloud'}</div>
          {provider.priority !== undefined && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('common.priority')}:</span>
              <span className={styles.fieldValue}>{provider.priority}</span>
            </div>
          )}
          {provider.prefix && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('common.prefix')}:</span>
              <span className={styles.fieldValue}>{provider.prefix}</span>
            </div>
          )}
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
            <span className={styles.fieldValue}>{provider.baseUrl}</span>
          </div>
          <ProviderConcurrencyBadge providerKey={provider.name} config={upstreamConcurrency} />
          {provider.disableCooling !== undefined && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>
                {t('ai_providers.disable_cooling_label', {
                  defaultValue: 'Disable Cooling',
                })}
                :
              </span>
              <span className={styles.fieldValue}>
                {provider.disableCooling ? t('common.yes') : t('common.no')}
              </span>
            </div>
          )}
          {providerDisabled && (
            <div className="rf-badge rf-badge--caution" style={{ marginTop: 8, marginBottom: 0 }}>
              {t('ai_providers.config_disabled_badge')}
            </div>
          )}
          {headerEntries.length > 0 && (
            <div className={styles.headerBadgeList}>
              {headerEntries.map(([key, value]) => (
                <span key={key} className={styles.headerBadge}>
                  <strong>{key}:</strong> {value}
                </span>
              ))}
            </div>
          )}
          {apiKeyEntries.length > 0 && (
            <div className={styles.apiKeyEntriesSection}>
              <div className={styles.apiKeyEntriesLabel}>
                {t('ai_providers.openai_keys_count')}: {apiKeyEntries.length}
              </div>
              <div className={styles.apiKeyEntryList}>
                {apiKeyEntries.map((entry, entryIndex) => {
                  const entryStats = getProviderTotalStats(
                    usageByProvider,
                    provider.name,
                    entry.apiKey,
                    provider.baseUrl
                  );
                  return (
                    <div
                      key={entry.authIndex || `ollama-key-${originalIndex}-${entryIndex}`}
                      className={styles.apiKeyEntryCard}
                    >
                      <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                      <span className={styles.apiKeyEntryKey}>{maskApiKey(entry.apiKey)}</span>
                      {entry.proxyUrl && (
                        <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                      )}
                      <div className={styles.apiKeyEntryStats}>
                        <span
                          className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatSuccess}`}
                        >
                          <IconCheck size={12} /> {entryStats.success}
                        </span>
                        <span
                          className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatFailure}`}
                        >
                          <IconX size={12} /> {entryStats.failure}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className={styles.fieldRow} style={{ marginTop: '8px' }}>
            <span className={styles.fieldLabel}>{t('ai_providers.openai_models_count')}:</span>
            <span className={styles.fieldValue}>{provider.models?.length || 0}</span>
          </div>
          {provider.models?.length ? (
            <div className={styles.modelTagList}>
              {provider.models.map((model) => (
                <span key={model.name} className={styles.modelTag}>
                  <span className={styles.modelName}>{model.name}</span>
                  {model.alias && model.alias !== model.name && (
                    <span className={styles.modelAlias}>{model.alias}</span>
                  )}
                </span>
              ))}
            </div>
          ) : null}
          {provider.testModel && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('ai_providers.openai_test_model')}:</span>
              <span className={styles.fieldValue}>{provider.testModel}</span>
            </div>
          )}
          <div className={styles.cardStats}>
            <span className={`${styles.statPill} ${styles.statSuccess}`}>
              {t('stats.success')}: {stats.success}
            </span>
            <span className={`${styles.statPill} ${styles.statFailure}`}>
              {t('stats.failure')}: {stats.failure}
            </span>
          </div>
          <ProviderStatusBar statusData={statusData} />
        </div>
        <div className={styles.openaiProviderActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(originalIndex)}
            disabled={actionsDisabled}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(originalIndex)}
            disabled={actionsDisabled}
          >
            {t('common.delete')}
          </Button>
          <ToggleSwitch
            label={t('ai_providers.config_toggle_label')}
            checked={!providerDisabled}
            disabled={toggleDisabled}
            onChange={(value) => void onToggle(originalIndex, value)}
          />
        </div>
      </div>
    );
  };

  return (
    <Card
      title={
        <span className={styles.cardTitle}>
          <img src={iconOllama} alt="" className={styles.cardTitleIcon} />
          {t('ai_providers.ollama_title')}
        </span>
      }
      extra={
        <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
          {t('ai_providers.ollama_add_button')}
        </Button>
      }
    >
      {loading && sortedProviders.length === 0 ? (
        <div className="hint">{t('common.loading')}</div>
      ) : sortedProviders.length === 0 ? (
        <EmptyState
          title={t('ai_providers.ollama_empty_title')}
          description={t('ai_providers.ollama_empty_desc')}
        />
      ) : (
        <div className={styles.openaiProviderList}>
          {sortedProviders.map((provider) => renderProviderCard(provider))}
        </div>
      )}
    </Card>
  );
}
