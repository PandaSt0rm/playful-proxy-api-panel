import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { Input } from '@/components/ui/Input';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { excludedModelsToText, parseExcludedModels } from '@/components/providers/utils';
import {
  entriesToModels,
  modelsToEntries,
  type ModelEntry,
} from '@/components/ui/modelInputListUtils';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { ModelEffortPayloadsEditor } from '@/components/providers/ModelEffortPayloadsEditor';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { GeminiKeyConfig, ProviderKeyConfig } from '@/types';
import { buildHeaderObject, headersToEntries, type HeaderEntry } from '@/utils/headers';
import {
  ProviderDebugAction,
  buildSingleKeyTarget,
} from '@/components/providerDebug';
import styles from './AiProvidersPage.module.scss';
import layoutStyles from './AiProvidersEditLayout.module.scss';

export type NativeProviderKind = 'interactions' | 'xai';

type NativeProviderForm = {
  apiKey: string;
  priority?: number;
  prefix: string;
  baseUrl: string;
  proxyUrl: string;
  websockets: boolean;
  disableCooling?: boolean;
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
  raw?: Record<string, unknown>;
};

type Props = { kind: NativeProviderKind };
type LocationState = { fromAiProviders?: boolean } | null;

const EMPTY_FORM: NativeProviderForm = {
  apiKey: '',
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  websockets: false,
  headers: [],
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
};

const parseIndex = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
};

const toForm = (config: ProviderKeyConfig): NativeProviderForm => ({
  apiKey: config.apiKey,
  priority: config.priority,
  prefix: config.prefix ?? '',
  baseUrl: config.baseUrl ?? '',
  proxyUrl: config.proxyUrl ?? '',
  websockets: Boolean(config.websockets),
  disableCooling: config.disableCooling,
  headers: headersToEntries(config.headers),
  modelEntries: modelsToEntries(config.models),
  excludedText: excludedModelsToText(config.excludedModels),
  raw: config.raw ? { ...config.raw } : undefined,
});

const toConfig = (form: NativeProviderForm, includeWebsockets: boolean): ProviderKeyConfig => {
  const config: ProviderKeyConfig = {
    apiKey: form.apiKey.trim(),
    priority: form.priority,
    prefix: form.prefix.trim() || undefined,
    baseUrl: form.baseUrl.trim() || undefined,
    proxyUrl: form.proxyUrl.trim() || undefined,
    headers: buildHeaderObject(form.headers),
    models: entriesToModels(form.modelEntries),
    excludedModels: parseExcludedModels(form.excludedText),
    disableCooling: form.disableCooling,
    raw: form.raw ? { ...form.raw } : undefined,
  };
  if (includeWebsockets) config.websockets = form.websockets;
  return config;
};

export function AiProvidersNativeKeyEditPage({ kind }: Props) {
  const { t } = useTranslation();
  const { index } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const configKey = kind === 'xai' ? 'xai-api-key' : 'interactions-api-key';
  const providerLabel = kind === 'xai' ? 'xAI' : 'Google Interactions';
  const editIndex = parseIndex(index);
  const isNew = location.pathname.endsWith('/new');
  const invalidIndexParam = !isNew && editIndex === null;

  const [configs, setConfigs] = useState<ProviderKeyConfig[]>([]);
  const [form, setForm] = useState<NativeProviderForm>({ ...EMPTY_FORM });
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const disableControls = connectionStatus !== 'connected';
  const excludedModelsId = useId();

  useEffect(() => {
    if (invalidIndexParam) {
      setError(t('common.invalid_provider_index'));
      setLoading(false);
      return;
    }
    setError('');
    let cancelled = false;
    setLoading(true);
    const loadConfigs =
      kind === 'xai' ? providersApi.getXAIConfigs() : providersApi.getInteractionsConfigs();
    loadConfigs
      .then((value) => {
        if (cancelled) return;
        const list = Array.isArray(value) ? (value as ProviderKeyConfig[]) : [];
        setConfigs(list);
        const next =
          editIndex === null ? { ...EMPTY_FORM } : list[editIndex] ? toForm(list[editIndex]) : null;
        if (!next) {
          setError(t('common.invalid_provider_index'));
          return;
        }
        setForm(next);
        setBaseline(JSON.stringify(next));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(getErrorMessage(cause) || t('notification.refresh_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editIndex, invalidIndexParam, kind, t]);

  const dirty = useMemo(
    () => Boolean(baseline) && JSON.stringify(form) !== baseline,
    [baseline, form]
  );
  const { allowNextNavigation } = useUnsavedChangesGuard({
    shouldBlock: dirty && !saving,
    dialog: {
      title: t('common.unsaved_changes', { defaultValue: 'Unsaved changes' }),
      message: t('common.unsaved_changes_confirm', {
        defaultValue: 'Discard your unsaved changes?',
      }),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
    },
  });

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) navigate(-1);
    else navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);
  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  const handleSave = async () => {
    const nextItem = toConfig(form, kind === 'xai');
    const nextList =
      editIndex === null
        ? [...configs, nextItem]
        : configs.map((item, itemIndex) => (itemIndex === editIndex ? nextItem : item));
    setSaving(true);
    try {
      if (kind === 'xai') await providersApi.saveXAIConfigs(nextList);
      else await providersApi.saveInteractionsConfigs(nextList as GeminiKeyConfig[]);
      updateConfigValue(configKey, nextList);
      clearCache(configKey);
      await fetchConfig(undefined, true);
      setBaseline(JSON.stringify(form));
      showNotification(t('notification.save_success'), 'success');
      allowNextNavigation();
      handleBack();
    } catch (cause: unknown) {
      showNotification(`${t('notification.save_failed')}: ${getErrorMessage(cause)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !disableControls && !loading && !saving && !invalidIndexParam && Boolean(form.apiKey.trim());

  // Built from the draft form so the bench debugs what is on screen, saved or not.
  const debugTarget = useMemo(
    () =>
      buildSingleKeyTarget({
        providerLabel: kind === 'xai' ? 'xAI' : 'Interactions',
        family: 'generic',
        routedKind: kind === 'xai' ? 'xai-api-key' : 'interactions-api-key',
        form,
      }),
    [form, kind]
  );

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      contentClassName={layoutStyles.content}
      title={`${editIndex === null ? 'Add' : 'Edit'} ${providerLabel} API Key`}
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
        {error && <div className="error-box">{error}</div>}
        {!invalidIndexParam && !error && (
          <>
            <Input
              label={t('common.api_key')}
              value={form.apiKey}
              onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('common.priority')}
              type="number"
              step={1}
              value={form.priority ?? ''}
              onChange={(event) => {
                const value = event.target.value.trim();
                setForm((prev) => ({ ...prev, priority: value ? Number(value) : undefined }));
              }}
              disabled={disableControls || saving}
            />
            <Input
              label={t('common.prefix')}
              value={form.prefix}
              onChange={(event) => setForm((prev) => ({ ...prev, prefix: event.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('common.base_url')}
              value={form.baseUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('common.proxy_url')}
              value={form.proxyUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, proxyUrl: event.target.value }))}
              disabled={disableControls || saving}
            />
            {kind === 'xai' && (
              <ToggleSwitch
                label="Responses WebSocket transport"
                checked={form.websockets}
                onChange={(websockets) => setForm((prev) => ({ ...prev, websockets }))}
                disabled={disableControls || saving}
              />
            )}
            <ToggleSwitch
              label={t('auth_files.disable_cooling_label')}
              checked={Boolean(form.disableCooling)}
              onChange={(disableCooling) => setForm((prev) => ({ ...prev, disableCooling }))}
              disabled={disableControls || saving}
            />
            <HeaderInputList
              entries={form.headers}
              onChange={(headers) => setForm((prev) => ({ ...prev, headers }))}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={disableControls || saving}
            />
            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>Models</label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      modelEntries: [...prev.modelEntries, { name: '', alias: '' }],
                    }))
                  }
                  disabled={disableControls || saving}
                >
                  Add model
                </Button>
              </div>
              <ModelInputList
                entries={form.modelEntries}
                onChange={(modelEntries) => setForm((prev) => ({ ...prev, modelEntries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={disableControls || saving}
                hideAddButton
                className={styles.modelInputList}
                rowClassName={styles.modelInputRow}
                inputClassName={styles.modelInputField}
                removeButtonClassName={styles.modelRowRemoveButton}
                removeButtonTitle={t('common.delete')}
                removeButtonAriaLabel={t('common.delete')}
                renderRowExtras={(args) => <ModelEffortPayloadsEditor {...args} />}
              />
            </div>
            <div className="form-group">
              <label htmlFor={excludedModelsId}>{t('ai_providers.excluded_models_label')}</label>
              <textarea
                id={excludedModelsId}
                className="input"
                value={form.excludedText}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, excludedText: event.target.value }))
                }
                rows={4}
                disabled={disableControls || saving}
              />
            </div>
          </>
        )}
      </Card>
      <ProviderDebugAction target={debugTarget} />
    </SecondaryScreenShell>
  );
}
