import { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { Input } from '@/components/ui/Input';
import { ModelInputList, type ModelInputListRowExtrasArgs } from '@/components/ui/ModelInputList';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useNotificationStore } from '@/stores';
import type { ApiKeyEntry } from '@/types';
import { buildHeaderObject } from '@/utils/headers';
import { buildApiKeyEntry } from '@/components/providers/utils';
import { ModelEffortPayloadsEditor, ProviderConcurrencyInput } from '@/components/providers';
import { ProviderDebugDrawer } from '@/components/providerDebug';
import type { DebugTarget } from '@/features/providerDebug/types';
import type { OpenAIEditOutletContext } from './AiProvidersOpenAIEditLayout';
import styles from './AiProvidersPage.module.scss';
import layoutStyles from './AiProvidersEditLayout.module.scss';

export function AiProvidersOpenAIEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const {
    providerMode,
    hasIndexParam,
    invalidIndexParam,
    invalidIndex,
    disableControls,
    loading,
    saving,
    form,
    setForm,
    testModel,
    setTestModel,
    availableModels,
    concurrencyLimit,
    setConcurrencyLimit,
    concurrencyLimitError,
    handleBack,
    handleSave,
  } = useOutletContext<OpenAIEditOutletContext>();

  const providerI18nPrefix = providerMode;
  const title = hasIndexParam
    ? t(`ai_providers.${providerI18nPrefix}_edit_modal_title`)
    : t(`ai_providers.${providerI18nPrefix}_add_modal_title`);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });
  const [debugOpen, setDebugOpen] = useState(false);

  // Built from the draft form, not from saved config, so the bench debugs what is on
  // screen — including a key that has not been saved yet.
  const debugTarget = useMemo<DebugTarget>(
    () => ({
      providerLabel: form.name.trim() || providerMode,
      family: 'openai',
      baseUrl: form.baseUrl,
      headers: buildHeaderObject(form.headers),
      keys: form.apiKeyEntries.map((entry) => ({
        apiKey: entry.apiKey ?? '',
        authIndex: entry.authIndex,
        headers: entry.headers,
      })),
      models: form.modelEntries.map((entry) => entry.name).filter((name) => name.trim()),
      // The bench defaults to whatever model the connection test is pointed at.
      model: testModel,
      // zai, openrouter, and ollama are presentation modes over the one
      // openai-compatibility config list, so they all address the same server-side kind.
      routedKind: 'openai-compatibility',
    }),
    [
      form.name,
      form.baseUrl,
      form.headers,
      form.apiKeyEntries,
      form.modelEntries,
      providerMode,
      testModel,
    ]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const canSave =
    !disableControls &&
    !loading &&
    !saving &&
    !invalidIndexParam &&
    !invalidIndex &&
    !concurrencyLimitError;
  const modelSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    return form.modelEntries.reduce<Array<{ value: string; label: string }>>((acc, entry) => {
      const name = entry.name.trim();
      if (!name || seen.has(name)) return acc;
      seen.add(name);
      const alias = entry.alias.trim();
      acc.push({
        value: name,
        label: alias && alias !== name ? `${name} (${alias})` : name,
      });
      return acc;
    }, []);
  }, [form.modelEntries]);

  const renderModelEffortPayloads = useCallback(
    (args: ModelInputListRowExtrasArgs) => (
      <ModelEffortPayloadsEditor {...args} mode={providerMode} baseUrl={form.baseUrl} />
    ),
    [providerMode, form.baseUrl]
  );

  const openOpenaiModelDiscovery = () => {
    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
      showNotification(t('ai_providers.openai_models_fetch_invalid_url'), 'error');
      return;
    }
    navigate('models');
  };

  const renderKeyEntries = (entries: ApiKeyEntry[]) => {
    const list = entries.length ? entries : [buildApiKeyEntry()];

    const updateEntry = (idx: number, field: keyof ApiKeyEntry, value: string) => {
      const next = list.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry));
      setForm((prev) => ({ ...prev, apiKeyEntries: next }));
    };

    const removeEntry = (idx: number) => {
      const next = list.filter((_, i) => i !== idx);
      setForm((prev) => ({
        ...prev,
        apiKeyEntries: next.length ? next : [buildApiKeyEntry()],
      }));
    };

    const addEntry = () => {
      setForm((prev) => ({ ...prev, apiKeyEntries: [...list, buildApiKeyEntry()] }));
    };

    return (
      <div className={styles.keyEntriesList}>
        <div className={styles.keyEntriesToolbar}>
          <span className={styles.keyEntriesCount}>
            {t('ai_providers.openai_keys_count')}: {list.length}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={addEntry}
            disabled={saving || disableControls}
            className={styles.addKeyButton}
          >
            {t('ai_providers.openai_keys_add_btn')}
          </Button>
        </div>
        <div className={styles.keyTableShell}>
          {/* 表头 */}
          <div className={styles.keyTableHeader}>
            <div className={styles.keyTableColIndex}>#</div>
            <div className={styles.keyTableColKey}>{t('common.api_key')}</div>
            <div className={styles.keyTableColWeight}>{t('ai_providers.weight_label')}</div>
            <div className={styles.keyTableColProxy}>{t('common.proxy_url')}</div>
            <div className={styles.keyTableColAction}>{t('common.action')}</div>
          </div>

          {/* 数据行 */}
          {list.map((entry, index) => {
            return (
              <div key={index} className={styles.keyTableRow}>
                {/* 序号 */}
                <div className={styles.keyTableColIndex}>{index + 1}</div>

                {/* Key 输入框 */}
                <div className={styles.keyTableColKey}>
                  <input
                    type="text"
                    value={entry.apiKey}
                    onChange={(e) => updateEntry(index, 'apiKey', e.target.value)}
                    disabled={saving || disableControls}
                    className={`input ${styles.keyTableInput}`}
                    placeholder={t('ai_providers.openai_key_placeholder')}
                  />
                </div>
                <div className={styles.keyTableColWeight}>
                  <input
                    type="number"
                    step={1}
                    max={1000000}
                    value={entry.weight ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = raw.trim() === '' ? undefined : Number(raw);
                      const weight =
                        parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
                      const next = list.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, weight } : item
                      );
                      setForm((prev) => ({ ...prev, apiKeyEntries: next }));
                    }}
                    disabled={saving || disableControls}
                    className={`input ${styles.keyTableInput}`}
                    aria-label={`${t('ai_providers.weight_label')} ${index + 1}`}
                    title={t('ai_providers.weight_hint')}
                  />
                </div>

                {/* Proxy 输入框 */}
                <div className={styles.keyTableColProxy}>
                  <input
                    type="text"
                    value={entry.proxyUrl ?? ''}
                    onChange={(e) => updateEntry(index, 'proxyUrl', e.target.value)}
                    disabled={saving || disableControls}
                    className={`input ${styles.keyTableInput}`}
                    placeholder={t('ai_providers.openai_proxy_placeholder')}
                  />
                </div>

                {/* 操作按钮 */}
                <div className={styles.keyTableColAction}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEntry(index)}
                    disabled={saving || disableControls || list.length <= 1}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      contentClassName={layoutStyles.content}
      title={title}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      hideTopBarBackButton
      hideTopBarRightAction
      actionBar={
        <div className={layoutStyles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            className={layoutStyles.backButton}
          >
            {t('common.back')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!canSave}
            className={layoutStyles.saveButton}
          >
            {t('common.save')}
          </Button>
        </div>
      }
      isLoading={loading}
      loadingLabel={t('common.loading')}
    >
      <Card>
        {invalidIndexParam || invalidIndex ? (
          <div className={styles.sectionHint}>{t('common.invalid_provider_index')}</div>
        ) : (
          <div className={styles.openaiEditForm}>
            <Input
              label={t(`ai_providers.${providerI18nPrefix}_add_modal_name_label`)}
              value={form.name}
              placeholder={t(`ai_providers.${providerI18nPrefix}_add_modal_name_placeholder`)}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              disabled={saving || disableControls}
            />
            <Input
              label={t('ai_providers.priority_label')}
              hint={t('ai_providers.priority_hint')}
              type="number"
              step={1}
              value={form.priority ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw.trim() === '' ? undefined : Number(raw);
                setForm((prev) => ({
                  ...prev,
                  priority: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
                }));
              }}
              disabled={saving || disableControls}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              value={form.prefix ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
              hint={t('ai_providers.prefix_hint')}
              disabled={saving || disableControls}
            />
            <Input
              label={t(`ai_providers.${providerI18nPrefix}_add_modal_url_label`)}
              value={form.baseUrl}
              placeholder={t(`ai_providers.${providerI18nPrefix}_add_modal_url_placeholder`)}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              disabled={saving || disableControls}
            />
            <ProviderConcurrencyInput
              providerKey={form.name}
              value={concurrencyLimit}
              disabled={saving || disableControls}
              error={concurrencyLimitError}
              onChange={setConcurrencyLimit}
            />
            <div className="form-group">
              <ToggleSwitch
                checked={Boolean(form.disableCooling)}
                onChange={(disableCooling) => setForm((prev) => ({ ...prev, disableCooling }))}
                disabled={saving || disableControls}
                ariaLabel={t('auth_files.disable_cooling_label')}
                label={t('auth_files.disable_cooling_label')}
              />
              <div className="hint">{t('auth_files.disable_cooling_hint')}</div>
            </div>

            <HeaderInputList
              entries={form.headers}
              onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={saving || disableControls}
            />

            {/* 模型配置区域 - 统一布局 */}
            <div className={styles.modelConfigSection}>
              {/* 标题行 */}
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>
                  {hasIndexParam
                    ? t('ai_providers.openai_edit_modal_models_label')
                    : t('ai_providers.openai_add_modal_models_label')}
                </label>
                <div className={styles.modelConfigToolbar}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        modelEntries: [...prev.modelEntries, { name: '', alias: '' }],
                      }))
                    }
                    disabled={saving || disableControls}
                  >
                    {t('ai_providers.openai_models_add_btn')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openOpenaiModelDiscovery}
                    disabled={saving || disableControls}
                  >
                    {t('ai_providers.openai_models_fetch_button')}
                  </Button>
                </div>
              </div>

              {/* 提示文本 */}
              <div className={styles.sectionHint}>{t('ai_providers.openai_models_hint')}</div>

              {/* 模型列表 */}
              <ModelInputList
                entries={form.modelEntries}
                onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={saving || disableControls}
                hideAddButton
                className={styles.modelInputList}
                rowClassName={styles.modelInputRowWithChips}
                inputClassName={styles.modelInputField}
                removeButtonClassName={styles.modelRowRemoveButton}
                removeButtonTitle={t('common.delete')}
                removeButtonAriaLabel={t('common.delete')}
                renderRowExtras={renderModelEffortPayloads}
              />
              <div className={styles.modelLevelChipsHint}>
                {t('ai_providers.openai_models_variants_hint')}
              </div>

              {/* Provider debug bench: replaces the single-prompt connection test. */}
              <div className={styles.modelTestPanel}>
                <div className={styles.modelTestMeta}>
                  <label className={styles.modelTestLabel}>{t('provider_debug.panel_title')}</label>
                  <span className={styles.modelTestHint}>{t('provider_debug.panel_hint')}</span>
                </div>
                <div className={styles.modelTestControls}>
                  <Select
                    value={testModel}
                    options={modelSelectOptions}
                    onChange={setTestModel}
                    placeholder={
                      availableModels.length
                        ? t('provider_debug.default_model_placeholder')
                        : t('ai_providers.openai_test_select_empty')
                    }
                    className={styles.openaiTestSelect}
                    ariaLabel={t('provider_debug.default_model_label')}
                    disabled={saving || disableControls || availableModels.length === 0}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDebugOpen(true)}
                    disabled={disableControls}
                    className={styles.modelTestAllButton}
                  >
                    {t('provider_debug.open')}
                  </Button>
                </div>
              </div>
            </div>

            <div className={styles.keyEntriesSection}>
              <div className={styles.keyEntriesHeader}>
                <label className={styles.keyEntriesTitle}>
                  {t('ai_providers.openai_add_modal_keys_label')}
                </label>
                <span className={styles.keyEntriesHint}>{t('ai_providers.openai_keys_hint')}</span>
              </div>
              {renderKeyEntries(form.apiKeyEntries)}
            </div>
          </div>
        )}
      </Card>
      <ProviderDebugDrawer
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        target={debugTarget}
      />
    </SecondaryScreenShell>
  );
}
