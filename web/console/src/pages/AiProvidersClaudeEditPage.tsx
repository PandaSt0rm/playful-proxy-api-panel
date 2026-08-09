import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useConfigStore } from '@/stores';
import { parseTextList } from '@/components/providers/utils';
import { ProviderConcurrencyInput } from '@/components/providers';
import type { ClaudeEditOutletContext } from './AiProvidersClaudeEditLayout';
import { ProviderDebugAction, buildSingleKeyTarget } from '@/components/providerDebug';
import styles from './AiProvidersPage.module.scss';
import layoutStyles from './AiProvidersEditLayout.module.scss';

export function AiProvidersClaudeEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useConfigStore((state) => state.config);
  const {
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
  } = useOutletContext<ClaudeEditOutletContext>();

  const title = hasIndexParam
    ? t('ai_providers.claude_edit_modal_title')
    : t('ai_providers.claude_add_modal_title');

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });
  const lastCloakConfigRef = useRef<typeof form.cloak>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  useEffect(() => {
    if (!form.cloak) return;
    lastCloakConfigRef.current = form.cloak;
  }, [form.cloak]);

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

  const cloakModeOptions = useMemo(
    () => [
      { value: 'auto', label: t('ai_providers.claude_cloak_mode_auto') },
      { value: 'always', label: t('ai_providers.claude_cloak_mode_always') },
      { value: 'never', label: t('ai_providers.claude_cloak_mode_never') },
    ],
    [t]
  );

  const resolvedCloakMode = useMemo(() => {
    const mode = (form.cloak?.mode ?? '').trim().toLowerCase();
    if (!mode) return 'auto';
    if (mode === 'provider') return 'auto';
    if (mode === 'auto' || mode === 'always' || mode === 'never') return mode;
    return 'auto';
  }, [form.cloak?.mode]);

  const openClaudeModelDiscovery = () => {
    navigate('models');
  };

  // Built from the draft form so the bench debugs what is on screen, saved or not.
  const debugTarget = useMemo(
    () =>
      buildSingleKeyTarget({
        providerLabel: 'Claude',
        family: 'claude',
        routedKind: 'claude-api-key',
        form,
      }),
    [form]
  );

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
              label={t('ai_providers.claude_add_modal_key_label')}
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
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
              label={t('ai_providers.weight_label')}
              hint={t('ai_providers.weight_hint')}
              type="number"
              step={1}
              max={1000000}
              value={form.weight ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw.trim() === '' ? undefined : Number(raw);
                setForm((prev) => ({
                  ...prev,
                  weight: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
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
              label={t('ai_providers.claude_add_modal_url_label')}
              value={form.baseUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              disabled={saving || disableControls}
            />
            <Input
              label={t('ai_providers.claude_add_modal_proxy_label')}
              value={form.proxyUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, proxyUrl: e.target.value }))}
              disabled={saving || disableControls}
            />
            <ProviderConcurrencyInput
              providerKey="claude"
              value={concurrencyLimit}
              config={config?.upstreamConcurrency}
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
            <div className="form-group">
              <ToggleSwitch
                checked={Boolean(form.experimentalCCHSigning)}
                onChange={(experimentalCCHSigning) =>
                  setForm((prev) => ({ ...prev, experimentalCCHSigning }))
                }
                disabled={saving || disableControls}
                ariaLabel={t('ai_providers.claude_experimental_cch_signing_label', {
                  defaultValue: 'Experimental CCH signing',
                })}
                label={t('ai_providers.claude_experimental_cch_signing_label', {
                  defaultValue: 'Experimental CCH signing',
                })}
              />
              <div className="hint">
                {t('ai_providers.claude_experimental_cch_signing_hint', {
                  defaultValue:
                    'Enable final-body CCH signing for cloaked Claude /v1/messages requests.',
                })}
              </div>
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

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>
                  {t('ai_providers.claude_models_label')}
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
                    {t('ai_providers.claude_models_add_btn')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openClaudeModelDiscovery}
                    disabled={saving || disableControls}
                  >
                    {t('ai_providers.claude_models_fetch_button')}
                  </Button>
                </div>
              </div>

              <div className={styles.sectionHint}>{t('ai_providers.claude_models_hint')}</div>

              <ModelInputList
                entries={form.modelEntries}
                onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={saving || disableControls}
                hideAddButton
                className={styles.modelInputList}
                rowClassName={styles.modelInputRow}
                inputClassName={styles.modelInputField}
                removeButtonClassName={styles.modelRowRemoveButton}
                removeButtonTitle={t('common.delete')}
                removeButtonAriaLabel={t('common.delete')}
              />

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
                        : t('ai_providers.claude_test_select_empty')
                    }
                    className={styles.openaiTestSelect}
                    ariaLabel={t('provider_debug.default_model_label')}
                    disabled={saving || disableControls || availableModels.length === 0}
                  />
                  <ProviderDebugAction target={debugTarget} disabled={disableControls} />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>{t('ai_providers.excluded_models_label')}</label>
              <textarea
                className="input"
                placeholder={t('ai_providers.excluded_models_placeholder')}
                value={form.excludedText}
                onChange={(e) => setForm((prev) => ({ ...prev, excludedText: e.target.value }))}
                rows={4}
                disabled={saving || disableControls}
              />
              <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
            </div>

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>
                  {t('ai_providers.claude_cloak_title')}
                </label>
                <div className={styles.modelConfigToolbar}>
                  <ToggleSwitch
                    checked={Boolean(form.cloak)}
                    onChange={(enabled) =>
                      setForm((prev) => {
                        if (!enabled) {
                          if (prev.cloak) {
                            lastCloakConfigRef.current = prev.cloak;
                          }
                          return { ...prev, cloak: undefined };
                        }

                        const restored = prev.cloak ??
                          lastCloakConfigRef.current ?? {
                            mode: 'auto',
                            strictMode: false,
                            sensitiveWords: [],
                          };
                        const mode = String(restored.mode ?? 'auto').trim() || 'auto';
                        return {
                          ...prev,
                          cloak: {
                            mode,
                            strictMode: restored.strictMode ?? false,
                            sensitiveWords: restored.sensitiveWords ?? [],
                            cacheUserId: restored.cacheUserId,
                          },
                        };
                      })
                    }
                    disabled={saving || disableControls}
                    ariaLabel={t('ai_providers.claude_cloak_toggle_aria')}
                    label={t('ai_providers.claude_cloak_toggle_label')}
                  />
                </div>
              </div>
              <div className={styles.sectionHint}>{t('ai_providers.claude_cloak_hint')}</div>

              {form.cloak ? (
                <>
                  <div className="form-group">
                    <label>{t('ai_providers.claude_cloak_mode_label')}</label>
                    <Select
                      value={resolvedCloakMode}
                      options={cloakModeOptions}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          cloak: {
                            ...(prev.cloak ?? {}),
                            mode: value,
                          },
                        }))
                      }
                      ariaLabel={t('ai_providers.claude_cloak_mode_label')}
                      disabled={saving || disableControls}
                    />
                    <div className="hint">{t('ai_providers.claude_cloak_mode_hint')}</div>
                  </div>

                  <div className="form-group">
                    <label>{t('ai_providers.claude_cloak_strict_label')}</label>
                    <ToggleSwitch
                      checked={Boolean(form.cloak.strictMode)}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          cloak: {
                            ...(prev.cloak ?? {}),
                            strictMode: value,
                          },
                        }))
                      }
                      disabled={saving || disableControls}
                      ariaLabel={t('ai_providers.claude_cloak_strict_label')}
                    />
                    <div className="hint">{t('ai_providers.claude_cloak_strict_hint')}</div>
                  </div>

                  <div className="form-group">
                    <label>
                      {t('ai_providers.claude_cloak_cache_user_id_label', {
                        defaultValue: 'Cache Claude user_id',
                      })}
                    </label>
                    <ToggleSwitch
                      checked={Boolean(form.cloak.cacheUserId)}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          cloak: {
                            ...(prev.cloak ?? {}),
                            cacheUserId: value,
                          },
                        }))
                      }
                      disabled={saving || disableControls}
                      ariaLabel={t('ai_providers.claude_cloak_cache_user_id_label', {
                        defaultValue: 'Cache Claude user_id',
                      })}
                    />
                    <div className="hint">
                      {t('ai_providers.claude_cloak_cache_user_id_hint', {
                        defaultValue:
                          'Reuse generated Claude user_id values per API key instead of generating a fresh value for every request.',
                      })}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>{t('ai_providers.claude_cloak_sensitive_words_label')}</label>
                    <textarea
                      className="input"
                      placeholder={t('ai_providers.claude_cloak_sensitive_words_placeholder')}
                      value={(form.cloak.sensitiveWords ?? []).join('\n')}
                      onChange={(e) => {
                        const nextWords = parseTextList(e.target.value);
                        setForm((prev) => ({
                          ...prev,
                          cloak: {
                            ...(prev.cloak ?? {}),
                            sensitiveWords: nextWords.length ? nextWords : undefined,
                          },
                        }));
                      }}
                      rows={3}
                      disabled={saving || disableControls}
                    />
                    <div className="hint">
                      {t('ai_providers.claude_cloak_sensitive_words_hint')}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </Card>
      <ProviderDebugAction target={debugTarget} />
    </SecondaryScreenShell>
  );
}
