import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { providersApi, saveProviderConcurrencyDraft } from '@/services/api';
import {
  useAuthStore,
  useConfigStore,
  useNotificationStore,
  useOpenAIEditDraftStore,
} from '@/stores';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';
import type { ApiKeyEntry, OpenAIProviderConfig } from '@/types';
import type { ModelInfo } from '@/utils/models';
import { buildHeaderObject, headersToEntries, normalizeHeaderEntries } from '@/utils/headers';
import { areKeyValueEntriesEqual, areModelEntriesEqual } from '@/utils/compare';
import { buildApiKeyEntry } from '@/components/providers/utils';
import { buildDefaultZaiProvider, isZaiOpenAIProvider } from '@/utils/zaiProvider';
import {
  buildDefaultOpenRouterProvider,
  isOpenRouterOpenAIProvider,
} from '@/utils/openrouterProvider';
import {
  buildDefaultOllamaCloudProvider,
  isOllamaCloudOpenAIProvider,
} from '@/utils/ollamaCloudProvider';
import type { ModelEntry, OpenAIFormState } from '@/components/providers/types';
import type { KeyTestStatus, OpenAIEditBaseline } from '@/stores/useOpenAIEditDraftStore';
import {
  concurrencyLimitToDraft,
  getProviderConcurrencyOverride,
  parseConcurrencyLimitDraft,
} from '@/utils/upstreamConcurrency';

type LocationState = { fromAiProviders?: boolean } | null;
export type OpenAIProviderEditorMode = 'openai' | 'zai' | 'openrouter' | 'ollama';

export type OpenAIEditOutletContext = {
  providerMode: OpenAIProviderEditorMode;
  hasIndexParam: boolean;
  editIndex: number | null;
  invalidIndexParam: boolean;
  invalidIndex: boolean;
  disableControls: boolean;
  loading: boolean;
  saving: boolean;
  form: OpenAIFormState;
  setForm: Dispatch<SetStateAction<OpenAIFormState>>;
  testModel: string;
  setTestModel: Dispatch<SetStateAction<string>>;
  testStatus: 'idle' | 'loading' | 'success' | 'error';
  setTestStatus: Dispatch<SetStateAction<'idle' | 'loading' | 'success' | 'error'>>;
  testMessage: string;
  setTestMessage: Dispatch<SetStateAction<string>>;
  keyTestStatuses: KeyTestStatus[];
  setDraftKeyTestStatus: (keyIndex: number, status: KeyTestStatus) => void;
  resetDraftKeyTestStatuses: (count: number) => void;
  availableModels: string[];
  concurrencyLimit: string;
  setConcurrencyLimit: Dispatch<SetStateAction<string>>;
  concurrencyLimitError?: string;
  handleBack: () => void;
  handleSave: () => Promise<void>;
  mergeDiscoveredModels: (selectedModels: ModelInfo[]) => void;
};

const providerToForm = (provider: OpenAIProviderConfig): OpenAIFormState => ({
  name: provider.name,
  priority: provider.priority,
  prefix: provider.prefix ?? '',
  baseUrl: provider.baseUrl,
  headers: headersToEntries(provider.headers),
  testModel: provider.testModel,
  disableCooling: provider.disableCooling,
  apiKeyEntries: provider.apiKeyEntries?.length ? provider.apiKeyEntries : [buildApiKeyEntry()],
  modelEntries: modelsToEntries(provider.models),
});

const buildEmptyForm = (providerMode: OpenAIProviderEditorMode): OpenAIFormState => {
  if (providerMode === 'zai') {
    return providerToForm(buildDefaultZaiProvider());
  }
  if (providerMode === 'openrouter') {
    return providerToForm(buildDefaultOpenRouterProvider());
  }
  if (providerMode === 'ollama') {
    return providerToForm(buildDefaultOllamaCloudProvider());
  }
  return {
    name: '',
    priority: undefined,
    prefix: '',
    baseUrl: '',
    headers: [],
    disableCooling: undefined,
    apiKeyEntries: [buildApiKeyEntry()],
    modelEntries: [{ name: '', alias: '' }],
    testModel: undefined,
  };
};

const parseIndexParam = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const normalizeModelEntries = (entries: ModelEntry[]) =>
  (entries ?? []).reduce<
    Array<{
      name: string;
      alias: string;
      thinking?: ModelEntry['thinking'];
      thinkingLevels?: ModelEntry['thinkingLevels'];
      thinkingPayloads?: ModelEntry['thinkingPayloads'];
    }>
  >((acc, entry) => {
    const name = String(entry?.name ?? '').trim();
    let alias = String(entry?.alias ?? '').trim();
    if (name && (alias === '' || alias === name)) {
      alias = '';
    }
    if (!name && !alias) return acc;
    acc.push({
      name,
      alias,
      thinking: entry.thinking,
      thinkingLevels: entry.thinkingLevels,
      thinkingPayloads: entry.thinkingPayloads,
    });
    return acc;
  }, []);

const normalizeKeyHeaders = (headers: ApiKeyEntry['headers']) => {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers)
    .map(([key, value]) => ({ key: String(key ?? '').trim(), value: String(value ?? '').trim() }))
    .filter((entry) => entry.key || entry.value)
    .sort((a, b) => {
      const byKey = a.key.toLowerCase().localeCompare(b.key.toLowerCase());
      if (byKey !== 0) return byKey;
      return a.value.localeCompare(b.value);
    });
};

const normalizeApiKeyEntries = (entries: ApiKeyEntry[]) =>
  (entries ?? []).reduce<
    Array<{
      apiKey: string;
      proxyUrl: string;
      headers: Array<{ key: string; value: string }>;
    }>
  >((acc, entry) => {
    const apiKey = String(entry?.apiKey ?? '').trim();
    const proxyUrl = String(entry?.proxyUrl ?? '').trim();
    const headers = normalizeKeyHeaders(entry?.headers);
    if (!apiKey && !proxyUrl && headers.length === 0) return acc;
    acc.push({ apiKey, proxyUrl, headers });
    return acc;
  }, []);

const buildOpenAIBaseline = (form: OpenAIFormState, testModel: string): OpenAIEditBaseline => ({
  name: String(form.name ?? '').trim(),
  priority:
    form.priority !== undefined && Number.isFinite(form.priority)
      ? Math.trunc(form.priority)
      : null,
  prefix: String(form.prefix ?? '').trim(),
  baseUrl: String(form.baseUrl ?? '').trim(),
  headers: normalizeHeaderEntries(form.headers),
  apiKeyEntries: normalizeApiKeyEntries(form.apiKeyEntries),
  models: normalizeModelEntries(form.modelEntries),
  testModel: String(testModel ?? '').trim(),
  disableCooling: form.disableCooling === undefined ? null : Boolean(form.disableCooling),
});

const areNormalizedApiKeyEntriesEqual = (
  a: OpenAIEditBaseline['apiKeyEntries'],
  b: ReturnType<typeof normalizeApiKeyEntries>
) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.apiKey !== right.apiKey || left.proxyUrl !== right.proxyUrl) return false;
    if (!areKeyValueEntriesEqual(left.headers, right.headers)) return false;
  }
  return true;
};

interface AiProvidersOpenAIEditLayoutProps {
  providerMode?: OpenAIProviderEditorMode;
}

export function AiProvidersOpenAIEditLayout({
  providerMode = 'openai',
}: AiProvidersOpenAIEditLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();

  const params = useParams<{ index?: string }>();
  const hasIndexParam = typeof params.index === 'string';
  const editIndex = useMemo(() => parseIndexParam(params.index), [params.index]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const [providers, setProviders] = useState<OpenAIProviderConfig[]>(
    () => config?.openaiCompatibility ?? []
  );
  const [providersFetched, setProvidersFetched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [concurrencyLimit, setConcurrencyLimit] = useState('');
  const [baselineConcurrencyLimit, setBaselineConcurrencyLimit] = useState('');
  const [baselineConcurrencyProvider, setBaselineConcurrencyProvider] = useState('');

  const draftKey = useMemo(() => {
    if (invalidIndexParam) return `${providerMode}:invalid:${params.index ?? 'unknown'}`;
    if (editIndex === null) return `${providerMode}:new`;
    return `${providerMode}:${editIndex}`;
  }, [editIndex, invalidIndexParam, params.index, providerMode]);

  const draft = useOpenAIEditDraftStore((state) => state.drafts[draftKey]);
  const acquireDraft = useOpenAIEditDraftStore((state) => state.acquireDraft);
  const releaseDraft = useOpenAIEditDraftStore((state) => state.releaseDraft);
  const initDraft = useOpenAIEditDraftStore((state) => state.initDraft);
  const setDraftBaseline = useOpenAIEditDraftStore((state) => state.setDraftBaseline);
  const setDraftForm = useOpenAIEditDraftStore((state) => state.setDraftForm);
  const setDraftTestModel = useOpenAIEditDraftStore((state) => state.setDraftTestModel);
  const setDraftTestStatus = useOpenAIEditDraftStore((state) => state.setDraftTestStatus);
  const setDraftTestMessage = useOpenAIEditDraftStore((state) => state.setDraftTestMessage);
  const setDraftKeyTestStatus = useOpenAIEditDraftStore((state) => state.setDraftKeyTestStatus);
  const resetDraftKeyTestStatuses = useOpenAIEditDraftStore(
    (state) => state.resetDraftKeyTestStatuses
  );

  const form = draft?.form ?? buildEmptyForm(providerMode);
  const testModel = draft?.testModel ?? '';
  const testStatus = draft?.testStatus ?? 'idle';
  const testMessage = draft?.testMessage ?? '';
  const keyTestStatuses = draft?.keyTestStatuses ?? [];

  const setForm: Dispatch<SetStateAction<OpenAIFormState>> = useCallback(
    (action) => {
      setDraftForm(draftKey, action);
    },
    [draftKey, setDraftForm]
  );

  const setTestModel: Dispatch<SetStateAction<string>> = useCallback(
    (action) => {
      setDraftTestModel(draftKey, action);
    },
    [draftKey, setDraftTestModel]
  );

  const setTestStatus: Dispatch<SetStateAction<'idle' | 'loading' | 'success' | 'error'>> =
    useCallback(
      (action) => {
        setDraftTestStatus(draftKey, action);
      },
      [draftKey, setDraftTestStatus]
    );

  const setTestMessage: Dispatch<SetStateAction<string>> = useCallback(
    (action) => {
      setDraftTestMessage(draftKey, action);
    },
    [draftKey, setDraftTestMessage]
  );

  const handleSetDraftKeyTestStatus = useCallback(
    (keyIndex: number, status: KeyTestStatus) => {
      setDraftKeyTestStatus(draftKey, keyIndex, status);
    },
    [draftKey, setDraftKeyTestStatus]
  );

  const handleResetDraftKeyTestStatuses = useCallback(
    (count: number) => {
      resetDraftKeyTestStatuses(draftKey, count);
    },
    [draftKey, resetDraftKeyTestStatuses]
  );

  const initialData = useMemo(() => {
    if (editIndex === null) return undefined;
    return providers[editIndex];
  }, [editIndex, providers]);

  const providerListReady =
    providersFetched ||
    (editIndex !== null ? Boolean(initialData) : Array.isArray(config?.openaiCompatibility));
  const invalidIndex = editIndex !== null && providerListReady && !initialData;
  const resolvedLoading = !draft?.initialized || (!invalidIndexParam && !providerListReady);

  useEffect(() => {
    if (providerMode !== 'openai') return;
    if (!providerListReady || editIndex === null || !initialData) return;
    if (isZaiOpenAIProvider(initialData)) {
      navigate(`/ai-providers/zai/${editIndex}`, { replace: true, state: location.state });
      return;
    }
    if (isOpenRouterOpenAIProvider(initialData)) {
      navigate(`/ai-providers/openrouter/${editIndex}`, { replace: true, state: location.state });
      return;
    }
    if (isOllamaCloudOpenAIProvider(initialData)) {
      navigate(`/ai-providers/ollama/${editIndex}`, { replace: true, state: location.state });
    }
  }, [editIndex, initialData, location.state, navigate, providerListReady, providerMode]);

  const availableModels = useMemo(
    () => form.modelEntries.map((entry) => entry.name.trim()).filter(Boolean),
    [form.modelEntries]
  );

  useEffect(() => {
    acquireDraft(draftKey);
    return () => releaseDraft(draftKey);
  }, [acquireDraft, draftKey, releaseDraft]);

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);

  useEffect(() => {
    let cancelled = false;

    providersApi
      .getOpenAIProviders()
      .then((value) => {
        if (cancelled) return;
        const nextProviders = value || [];
        setProviders(nextProviders);
        setProvidersFetched(true);
        updateConfigValue('openai-compatibility', nextProviders);
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        try {
          const fallback = await fetchConfig('openai-compatibility');
          if (cancelled) return;
          setProviders(Array.isArray(fallback) ? (fallback as OpenAIProviderConfig[]) : []);
          setProvidersFetched(true);
        } catch {
          if (cancelled) return;
          const message = getErrorMessage(err) || t('notification.refresh_failed');
          showNotification(`${t('notification.load_failed')}: ${message}`, 'error');
          setProvidersFetched(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchConfig, showNotification, t, updateConfigValue]);

  useEffect(() => {
    if (draft?.initialized) return;
    if (invalidIndexParam) {
      const emptyForm = buildEmptyForm(providerMode);
      setConcurrencyLimit('');
      setBaselineConcurrencyLimit('');
      setBaselineConcurrencyProvider(emptyForm.name.trim());
      initDraft(draftKey, {
        baseline: buildOpenAIBaseline(emptyForm, ''),
        form: emptyForm,
        testModel: '',
        testStatus: 'idle',
        testMessage: '',
        keyTestStatuses: [],
      });
      return;
    }
    if (!providerListReady) return;

    if (initialData) {
      const seededForm = providerToForm(initialData);
      const modelEntries = seededForm.modelEntries;

      const available = modelEntries.map((entry) => entry.name.trim()).filter(Boolean);
      const initialTestModel =
        initialData.testModel && available.includes(initialData.testModel)
          ? initialData.testModel
          : available[0] || '';
      const baseline = buildOpenAIBaseline(seededForm, initialTestModel);
      const nextConcurrencyLimit = concurrencyLimitToDraft(
        getProviderConcurrencyOverride(config?.upstreamConcurrency, seededForm.name)
      );
      setConcurrencyLimit(nextConcurrencyLimit);
      setBaselineConcurrencyLimit(nextConcurrencyLimit);
      setBaselineConcurrencyProvider(seededForm.name.trim());
      initDraft(draftKey, {
        baseline,
        form: seededForm,
        testModel: initialTestModel,
        testStatus: 'idle',
        testMessage: '',
        keyTestStatuses: [],
      });
    } else {
      const emptyForm = buildEmptyForm(providerMode);
      const nextConcurrencyLimit = concurrencyLimitToDraft(
        getProviderConcurrencyOverride(config?.upstreamConcurrency, emptyForm.name)
      );
      setConcurrencyLimit(nextConcurrencyLimit);
      setBaselineConcurrencyLimit(nextConcurrencyLimit);
      setBaselineConcurrencyProvider(emptyForm.name.trim());
      initDraft(draftKey, {
        baseline: buildOpenAIBaseline(emptyForm, ''),
        form: emptyForm,
        testModel: '',
        testStatus: 'idle',
        testMessage: '',
        keyTestStatuses: [],
      });
    }
  }, [
    draft?.initialized,
    draftKey,
    initDraft,
    initialData,
    invalidIndexParam,
    providerListReady,
    providerMode,
    config?.upstreamConcurrency,
  ]);

  useEffect(() => {
    if (resolvedLoading) return;

    if (availableModels.length === 0) {
      if (testModel) {
        setTestModel('');
        setTestStatus('idle');
        setTestMessage('');
      }
      return;
    }

    if (!testModel || !availableModels.includes(testModel)) {
      setTestModel(availableModels[0]);
      setTestStatus('idle');
      setTestMessage('');
    }
  }, [availableModels, resolvedLoading, setTestMessage, setTestModel, setTestStatus, testModel]);

  const mergeDiscoveredModels = useCallback(
    (selectedModels: ModelInfo[]) => {
      if (!selectedModels.length) return;

      let addedCount = 0;
      setForm((prev) => {
        const mergedMap = new Map<string, ModelEntry>();
        prev.modelEntries.forEach((entry) => {
          const name = entry.name.trim();
          if (!name) return;
          mergedMap.set(name, { name, alias: entry.alias?.trim() || '' });
        });

        selectedModels.forEach((model) => {
          const name = model.name.trim();
          if (!name || mergedMap.has(name)) return;
          mergedMap.set(name, { name, alias: model.alias ?? '' });
          addedCount += 1;
        });

        const mergedEntries = Array.from(mergedMap.values());
        return {
          ...prev,
          modelEntries: mergedEntries.length ? mergedEntries : [{ name: '', alias: '' }],
        };
      });

      if (addedCount > 0) {
        showNotification(
          t('ai_providers.openai_models_fetch_added', { count: addedCount }),
          'success'
        );
      }
    },
    [setForm, showNotification, t]
  );

  const baseline = draft?.baseline ?? null;
  const normalizedHeaders = useMemo(() => normalizeHeaderEntries(form.headers), [form.headers]);
  const normalizedModels = useMemo(
    () => normalizeModelEntries(form.modelEntries),
    [form.modelEntries]
  );
  const normalizedApiKeyEntries = useMemo(
    () => normalizeApiKeyEntries(form.apiKeyEntries),
    [form.apiKeyEntries]
  );
  const normalizedPriority = useMemo(() => {
    return form.priority !== undefined && Number.isFinite(form.priority)
      ? Math.trunc(form.priority)
      : null;
  }, [form.priority]);
  const normalizedTestModel = useMemo(() => String(testModel ?? '').trim(), [testModel]);
  const isHeadersDirty = useMemo(() => {
    if (!baseline) return false;
    return !areKeyValueEntriesEqual(baseline.headers, normalizedHeaders);
  }, [baseline, normalizedHeaders]);
  const isModelsDirty = useMemo(() => {
    if (!baseline) return false;
    return !areModelEntriesEqual(baseline.models, normalizedModels);
  }, [baseline, normalizedModels]);
  const isApiKeyEntriesDirty = useMemo(() => {
    if (!baseline) return false;
    return !areNormalizedApiKeyEntriesEqual(baseline.apiKeyEntries, normalizedApiKeyEntries);
  }, [baseline, normalizedApiKeyEntries]);
  const isDirty =
    Boolean(draft?.initialized) &&
    baseline !== null &&
    (baseline.name !== form.name.trim() ||
      baseline.priority !== normalizedPriority ||
      baseline.prefix !== form.prefix.trim() ||
      baseline.baseUrl !== form.baseUrl.trim() ||
      baseline.testModel !== normalizedTestModel ||
      baseline.disableCooling !==
        (form.disableCooling === undefined ? null : Boolean(form.disableCooling)) ||
      isHeadersDirty ||
      isApiKeyEntriesDirty ||
      isModelsDirty ||
      baselineConcurrencyLimit !== concurrencyLimit.trim() ||
      (baselineConcurrencyLimit !== '' && baselineConcurrencyProvider !== form.name.trim()));
  const concurrencyLimitError =
    concurrencyLimit.trim() && !Number.isFinite(parseConcurrencyLimitDraft(concurrencyLimit))
      ? t('config_management.visual.validation.provider_limit_invalid', {
          defaultValue: 'Enter a non-negative whole number',
        })
      : undefined;
  const editorRootPath = useMemo(() => {
    if (hasIndexParam) {
      return `/ai-providers/${providerMode}/${params.index ?? ''}`;
    }
    return `/ai-providers/${providerMode}/new`;
  }, [hasIndexParam, params.index, providerMode]);
  const canGuard = !resolvedLoading && !saving && !invalidIndexParam && !invalidIndex;

  const { allowNextNavigation } = useUnsavedChangesGuard({
    enabled: canGuard,
    shouldBlock: ({ nextLocation }) => {
      const nextPath = nextLocation.pathname;
      const isWithinRoot = nextPath === editorRootPath || nextPath.startsWith(`${editorRootPath}/`);
      return isDirty && !isWithinRoot;
    },
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  const handleSave = useCallback(async () => {
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim();

    if (!name || !baseUrl) {
      showNotification(t(`notification.${providerMode}_provider_required`), 'error');
      return;
    }
    if (concurrencyLimitError) {
      showNotification(concurrencyLimitError, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: OpenAIProviderConfig = {
        name,
        raw: initialData?.raw,
        prefix: form.prefix?.trim() || undefined,
        baseUrl,
        headers: buildHeaderObject(form.headers),
        disableCooling: form.disableCooling,
        apiKeyEntries: form.apiKeyEntries.map((entry: ApiKeyEntry) => ({
          raw: entry.raw,
          apiKey: entry.apiKey.trim(),
          proxyUrl: entry.proxyUrl?.trim() || undefined,
          headers: entry.headers,
        })),
      };
      if (form.priority !== undefined && Number.isFinite(form.priority)) {
        payload.priority = Math.trunc(form.priority);
      }
      if (initialData?.disabled !== undefined) {
        payload.disabled = initialData.disabled;
      }
      const resolvedTestModel = testModel.trim();
      if (resolvedTestModel) payload.testModel = resolvedTestModel;
      const models = entriesToModels(form.modelEntries);
      if (models.length) payload.models = models;

      const nextList =
        editIndex !== null
          ? providers.map((item, idx) => (idx === editIndex ? payload : item))
          : [...providers, payload];

      await providersApi.saveOpenAIProviders(nextList);
      await saveProviderConcurrencyDraft({
        providerKey: name,
        draftLimit: concurrencyLimit,
        baselineProviderKey: baselineConcurrencyProvider,
        baselineDraftLimit: baselineConcurrencyLimit,
      });

      let syncedProviders = nextList;
      try {
        syncedProviders = await providersApi.getOpenAIProviders();
      } catch {
        // 保存成功后刷新失败时，回退到本地计算结果，避免页面数据为空或回退
      }

      setProviders(syncedProviders);
      updateConfigValue('openai-compatibility', syncedProviders);
      await fetchConfig(undefined, true);
      showNotification(
        editIndex !== null
          ? t(`notification.${providerMode}_provider_updated`)
          : t(`notification.${providerMode}_provider_added`),
        'success'
      );
      allowNextNavigation();
      setDraftBaseline(draftKey, buildOpenAIBaseline(form, testModel));
      setBaselineConcurrencyLimit(concurrencyLimit.trim());
      setBaselineConcurrencyProvider(name);
      handleBack();
    } catch (err: unknown) {
      showNotification(`${t('notification.update_failed')}: ${getErrorMessage(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    allowNextNavigation,
    draftKey,
    editIndex,
    fetchConfig,
    form,
    handleBack,
    initialData?.disabled,
    initialData?.raw,
    providers,
    providerMode,
    setDraftBaseline,
    showNotification,
    t,
    testModel,
    updateConfigValue,
    concurrencyLimit,
    baselineConcurrencyLimit,
    baselineConcurrencyProvider,
    concurrencyLimitError,
  ]);

  return (
    <Outlet
      context={
        {
          hasIndexParam,
          providerMode,
          editIndex,
          invalidIndexParam,
          invalidIndex,
          disableControls,
          loading: resolvedLoading,
          saving,
          form,
          setForm,
          testModel,
          setTestModel,
          testStatus,
          setTestStatus,
          testMessage,
          setTestMessage,
          keyTestStatuses,
          setDraftKeyTestStatus: handleSetDraftKeyTestStatus,
          resetDraftKeyTestStatuses: handleResetDraftKeyTestStatuses,
          availableModels,
          concurrencyLimit,
          setConcurrencyLimit,
          concurrencyLimitError,
          handleBack,
          handleSave,
          mergeDiscoveredModels,
        } satisfies OpenAIEditOutletContext
      }
    />
  );
}
