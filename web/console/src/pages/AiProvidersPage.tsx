import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ClaudeSection,
  CodexSection,
  GeminiSection,
  OpenAISection,
  OllamaCloudSection,
  OpenRouterSection,
  VertexSection,
  ZaiSection,
  ProviderNav,
  useProviderRecentRequests,
} from '@/components/providers';
import iconGemini from '@/assets/icons/gemini.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import {
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { WorkspacePage } from '@/components/workspace/WorkspacePage';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore, useThemeStore } from '@/stores';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import { isZaiOpenAIProvider } from '@/utils/zaiProvider';
import { isOpenRouterOpenAIProvider } from '@/utils/openrouterProvider';
import { isOllamaCloudOpenAIProvider } from '@/utils/ollamaCloudProvider';
import styles from './AiProvidersPage.module.scss';

type OpenAIProviderKind = 'openai' | 'zai' | 'openrouter' | 'ollama';

export function AiProvidersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);
  const isCacheValid = useConfigStore((state) => state.isCacheValid);

  const hasMounted = useRef(false);
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [error, setError] = useState('');

  const [geminiKeys, setGeminiKeys] = useState<GeminiKeyConfig[]>(
    () => config?.geminiApiKeys || []
  );
  const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>(
    () => config?.codexApiKeys || []
  );
  const [interactionsConfigs, setInteractionsConfigs] = useState<GeminiKeyConfig[]>(
    () => config?.interactionsApiKeys || []
  );
  const [xaiConfigs, setXaiConfigs] = useState<ProviderKeyConfig[]>(() => config?.xaiApiKeys || []);
  const [claudeConfigs, setClaudeConfigs] = useState<ProviderKeyConfig[]>(
    () => config?.claudeApiKeys || []
  );
  const [vertexConfigs, setVertexConfigs] = useState<ProviderKeyConfig[]>(
    () => config?.vertexApiKeys || []
  );
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProviderConfig[]>(
    () => config?.openaiCompatibility || []
  );

  const [configSwitchingKey, setConfigSwitchingKey] = useState<string | null>(null);

  const disableControls = connectionStatus !== 'connected';
  const isSwitching = Boolean(configSwitchingKey);

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;

  const { usageByProvider, loadRecentRequests, refreshRecentRequests } = useProviderRecentRequests({
    enabled: isCurrentLayer,
  });

  const zaiProviders = useMemo(
    () =>
      openaiProviders
        .map((config, originalIndex) => ({ config, originalIndex }))
        .filter(({ config }) => isZaiOpenAIProvider(config)),
    [openaiProviders]
  );

  const openrouterProviders = useMemo(
    () =>
      openaiProviders
        .map((config, originalIndex) => ({ config, originalIndex }))
        .filter(({ config }) => !isZaiOpenAIProvider(config) && isOpenRouterOpenAIProvider(config)),
    [openaiProviders]
  );

  const ollamaCloudProviders = useMemo(
    () =>
      openaiProviders
        .map((config, originalIndex) => ({ config, originalIndex }))
        .filter(
          ({ config }) =>
            !isZaiOpenAIProvider(config) &&
            !isOpenRouterOpenAIProvider(config) &&
            isOllamaCloudOpenAIProvider(config)
        ),
    [openaiProviders]
  );

  const isGenericOpenAIProvider = useCallback(
    (provider: OpenAIProviderConfig) =>
      !isZaiOpenAIProvider(provider) &&
      !isOpenRouterOpenAIProvider(provider) &&
      !isOllamaCloudOpenAIProvider(provider),
    []
  );

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return '';
  };

  const loadConfigs = useCallback(async () => {
    const hasValidCache = isCacheValid();
    if (!hasValidCache) {
      setLoading(true);
    }
    setError('');
    try {
      const [configResult, vertexResult, openaiResult] = await Promise.allSettled([
        fetchConfig(),
        providersApi.getVertexConfigs(),
        providersApi.getOpenAIProviders(),
      ]);

      if (configResult.status !== 'fulfilled') {
        throw configResult.reason;
      }

      const data = configResult.value;
      setGeminiKeys(data?.geminiApiKeys || []);
      setCodexConfigs(data?.codexApiKeys || []);
      setClaudeConfigs(data?.claudeApiKeys || []);
      setInteractionsConfigs(data?.interactionsApiKeys || []);
      setXaiConfigs(data?.xaiApiKeys || []);
      setVertexConfigs(data?.vertexApiKeys || []);
      setOpenaiProviders(data?.openaiCompatibility || []);

      if (vertexResult.status === 'fulfilled') {
        setVertexConfigs(vertexResult.value || []);
        updateConfigValue('vertex-api-key', vertexResult.value || []);
        clearCache('vertex-api-key');
      }

      if (openaiResult.status === 'fulfilled') {
        setOpenaiProviders(openaiResult.value || []);
        updateConfigValue('openai-compatibility', openaiResult.value || []);
        clearCache('openai-compatibility');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [clearCache, fetchConfig, isCacheValid, t, updateConfigValue]);

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadRecentRequests().catch(() => {});
  }, [isCurrentLayer, loadRecentRequests]);

  useEffect(() => {
    if (config?.geminiApiKeys) setGeminiKeys(config.geminiApiKeys);
    if (config?.codexApiKeys) setCodexConfigs(config.codexApiKeys);
    if (config?.interactionsApiKeys) setInteractionsConfigs(config.interactionsApiKeys);
    if (config?.xaiApiKeys) setXaiConfigs(config.xaiApiKeys);
    if (config?.claudeApiKeys) setClaudeConfigs(config.claudeApiKeys);
    if (config?.vertexApiKeys) setVertexConfigs(config.vertexApiKeys);
    if (config?.openaiCompatibility) setOpenaiProviders(config.openaiCompatibility);
  }, [
    config?.geminiApiKeys,
    config?.codexApiKeys,
    config?.interactionsApiKeys,
    config?.xaiApiKeys,
    config?.claudeApiKeys,
    config?.vertexApiKeys,
    config?.openaiCompatibility,
  ]);

  const handleRecentRequestsRefresh = useCallback(async () => {
    await refreshRecentRequests();
  }, [refreshRecentRequests]);

  useHeaderRefresh(handleRecentRequestsRefresh, isCurrentLayer);

  const openEditor = useCallback(
    (path: string) => {
      navigate(path, { state: { fromAiProviders: true } });
    },
    [navigate]
  );

  const deleteGemini = async (index: number) => {
    const entry = geminiKeys[index];
    if (!entry) return;
    showConfirmation({
      title: t('ai_providers.gemini_delete_title', { defaultValue: 'Delete Gemini Key' }),
      message: t('ai_providers.gemini_delete_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteGeminiKey(entry.apiKey, entry.baseUrl);
          const next = geminiKeys.filter((_, idx) => idx !== index);
          setGeminiKeys(next);
          updateConfigValue('gemini-api-key', next);
          clearCache('gemini-api-key');
          showNotification(t('notification.gemini_key_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const setConfigEnabled = async (
    provider: 'gemini' | 'codex' | 'claude' | 'vertex',
    index: number,
    enabled: boolean
  ) => {
    if (provider === 'gemini') {
      const current = geminiKeys[index];
      if (!current) return;

      const switchingKey = `${provider}:${current.apiKey}`;
      setConfigSwitchingKey(switchingKey);

      const previousList = geminiKeys;
      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);
      const nextItem: GeminiKeyConfig = { ...current, excludedModels: nextExcluded };
      const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

      setGeminiKeys(nextList);
      updateConfigValue('gemini-api-key', nextList);
      clearCache('gemini-api-key');

      try {
        await providersApi.saveGeminiKeys(nextList);
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setGeminiKeys(previousList);
        updateConfigValue('gemini-api-key', previousList);
        clearCache('gemini-api-key');
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        setConfigSwitchingKey(null);
      }
      return;
    }

    const source =
      provider === 'codex' ? codexConfigs : provider === 'claude' ? claudeConfigs : vertexConfigs;
    const current = source[index];
    if (!current) return;

    const switchingKey = `${provider}:${current.apiKey}`;
    setConfigSwitchingKey(switchingKey);

    const previousList = source;
    const nextExcluded = enabled
      ? withoutDisableAllModelsRule(current.excludedModels)
      : withDisableAllModelsRule(current.excludedModels);
    const nextItem: ProviderKeyConfig = { ...current, excludedModels: nextExcluded };
    const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

    if (provider === 'codex') {
      setCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');
    } else if (provider === 'claude') {
      setClaudeConfigs(nextList);
      updateConfigValue('claude-api-key', nextList);
      clearCache('claude-api-key');
    } else {
      setVertexConfigs(nextList);
      updateConfigValue('vertex-api-key', nextList);
      clearCache('vertex-api-key');
    }

    try {
      if (provider === 'codex') {
        await providersApi.saveCodexConfigs(nextList);
      } else if (provider === 'claude') {
        await providersApi.saveClaudeConfigs(nextList);
      } else {
        await providersApi.saveVertexConfigs(nextList);
      }
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (provider === 'codex') {
        setCodexConfigs(previousList);
        updateConfigValue('codex-api-key', previousList);
        clearCache('codex-api-key');
      } else if (provider === 'claude') {
        setClaudeConfigs(previousList);
        updateConfigValue('claude-api-key', previousList);
        clearCache('claude-api-key');
      } else {
        setVertexConfigs(previousList);
        updateConfigValue('vertex-api-key', previousList);
        clearCache('vertex-api-key');
      }
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setConfigSwitchingKey(null);
    }
  };

  const setNativeConfigEnabled = async (
    provider: 'interactions' | 'xai',
    index: number,
    enabled: boolean
  ) => {
    const source = provider === 'interactions' ? interactionsConfigs : xaiConfigs;
    const current = source[index];
    if (!current) return;
    const previousList = source;
    const nextItem = {
      ...current,
      excludedModels: enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels),
    };
    const nextList = previousList.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
    const configKey = provider === 'interactions' ? 'interactions-api-key' : 'xai-api-key';
    setConfigSwitchingKey(`${provider}:${current.apiKey}`);
    if (provider === 'interactions') setInteractionsConfigs(nextList as GeminiKeyConfig[]);
    else setXaiConfigs(nextList as ProviderKeyConfig[]);
    updateConfigValue(configKey, nextList);
    clearCache(configKey);
    try {
      if (provider === 'interactions') {
        await providersApi.saveInteractionsConfigs(nextList as GeminiKeyConfig[]);
      } else {
        await providersApi.saveXAIConfigs(nextList as ProviderKeyConfig[]);
      }
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      if (provider === 'interactions') {
        setInteractionsConfigs(previousList as GeminiKeyConfig[]);
      } else {
        setXaiConfigs(previousList as ProviderKeyConfig[]);
      }
      updateConfigValue(configKey, previousList);
      clearCache(configKey);
      showNotification(`${t('notification.update_failed')}: ${getErrorMessage(err)}`, 'error');
    } finally {
      setConfigSwitchingKey(null);
    }
  };

  const deleteNativeProvider = async (provider: 'interactions' | 'xai', index: number) => {
    const source = provider === 'interactions' ? interactionsConfigs : xaiConfigs;
    const entry = source[index];
    if (!entry) return;
    const label = provider === 'interactions' ? 'Google Interactions' : 'xAI';
    showConfirmation({
      title: `Delete ${label} API key`,
      message: `Delete this ${label} API key configuration?`,
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          if (provider === 'interactions') {
            await providersApi.deleteInteractionsConfig(entry.apiKey, entry.baseUrl);
            const next = interactionsConfigs.filter((_, itemIndex) => itemIndex !== index);
            setInteractionsConfigs(next);
            updateConfigValue('interactions-api-key', next);
            clearCache('interactions-api-key');
          } else {
            await providersApi.deleteXAIConfig(entry.apiKey, entry.baseUrl);
            const next = xaiConfigs.filter((_, itemIndex) => itemIndex !== index);
            setXaiConfigs(next);
            updateConfigValue('xai-api-key', next);
            clearCache('xai-api-key');
          }
          showNotification(t('notification.delete_success'), 'success');
        } catch (err: unknown) {
          showNotification(`${t('notification.delete_failed')}: ${getErrorMessage(err)}`, 'error');
        }
      },
    });
  };

  const setOpenAIProviderEnabled = async (index: number, enabled: boolean) => {
    const current = openaiProviders[index];
    if (!current) return;

    const switchingKey = `openai:${current.name}:${index}`;
    setConfigSwitchingKey(switchingKey);

    const previousList = openaiProviders;
    const nextItem: OpenAIProviderConfig = { ...current, disabled: !enabled };
    const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

    setOpenaiProviders(nextList);
    updateConfigValue('openai-compatibility', nextList);
    clearCache('openai-compatibility');

    try {
      await providersApi.updateOpenAIProviderDisabled(index, !enabled);
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setOpenaiProviders(previousList);
      updateConfigValue('openai-compatibility', previousList);
      clearCache('openai-compatibility');
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setConfigSwitchingKey(null);
    }
  };

  const deleteProviderEntry = async (type: 'codex' | 'claude', index: number) => {
    const source = type === 'codex' ? codexConfigs : claudeConfigs;
    const entry = source[index];
    if (!entry) return;
    showConfirmation({
      title: t(`ai_providers.${type}_delete_title`, {
        defaultValue: `Delete ${type === 'codex' ? 'Codex' : 'Claude'} Config`,
      }),
      message: t(`ai_providers.${type}_delete_confirm`),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          if (type === 'codex') {
            await providersApi.deleteCodexConfig(entry.apiKey, entry.baseUrl);
            const next = codexConfigs.filter((_, idx) => idx !== index);
            setCodexConfigs(next);
            updateConfigValue('codex-api-key', next);
            clearCache('codex-api-key');
            showNotification(t('notification.codex_config_deleted'), 'success');
          } else {
            await providersApi.deleteClaudeConfig(entry.apiKey, entry.baseUrl);
            const next = claudeConfigs.filter((_, idx) => idx !== index);
            setClaudeConfigs(next);
            updateConfigValue('claude-api-key', next);
            clearCache('claude-api-key');
            showNotification(t('notification.claude_config_deleted'), 'success');
          }
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const deleteVertex = async (index: number) => {
    const entry = vertexConfigs[index];
    if (!entry) return;
    showConfirmation({
      title: t('ai_providers.vertex_delete_title', { defaultValue: 'Delete Vertex Config' }),
      message: t('ai_providers.vertex_delete_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteVertexConfig(entry.apiKey, entry.baseUrl);
          const next = vertexConfigs.filter((_, idx) => idx !== index);
          setVertexConfigs(next);
          updateConfigValue('vertex-api-key', next);
          clearCache('vertex-api-key');
          showNotification(t('notification.vertex_config_deleted'), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  const deleteOpenai = async (index: number, providerKind: OpenAIProviderKind = 'openai') => {
    const entry = openaiProviders[index];
    if (!entry) return;
    const deleteTitleDefaults: Record<OpenAIProviderKind, string> = {
      openai: 'Delete OpenAI Provider',
      zai: 'Delete Z.AI Provider',
      openrouter: 'Delete OpenRouter Provider',
      ollama: 'Delete Ollama Cloud Provider',
    };
    showConfirmation({
      title: t(`ai_providers.${providerKind}_delete_title`, {
        defaultValue: deleteTitleDefaults[providerKind],
      }),
      message: t(`ai_providers.${providerKind}_delete_confirm`),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        try {
          await providersApi.deleteOpenAIProvider(entry.name);
          const next = openaiProviders.filter((_, idx) => idx !== index);
          setOpenaiProviders(next);
          updateConfigValue('openai-compatibility', next);
          clearCache('openai-compatibility');
          showNotification(t(`notification.${providerKind}_provider_deleted`), 'success');
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
        }
      },
    });
  };

  return (
    <WorkspacePage title={t('ai_providers.title')}>
      <div className={styles.content}>
        {error && <div className="error-box">{error}</div>}

        <div id="provider-gemini">
          <GeminiSection
            configs={geminiKeys}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onAdd={() => openEditor('/ai-providers/gemini/new')}
            onEdit={(index) => openEditor(`/ai-providers/gemini/${index}`)}
            onDelete={deleteGemini}
            onToggle={(index, enabled) => void setConfigEnabled('gemini', index, enabled)}
          />
        </div>

        <div id="provider-interactions">
          <CodexSection
            configs={interactionsConfigs}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            providerKey="interactions"
            title="Google Interactions"
            addButtonLabel="Add Interactions API Key"
            emptyTitle="No Interactions API keys"
            emptyDescription="Add a native Google Interactions API credential."
            itemTitle="Interactions API Key"
            modelsCountLabel="Models"
            iconSrc={iconGemini}
            showWebsockets={false}
            onAdd={() => openEditor('/ai-providers/interactions/new')}
            onEdit={(index) => openEditor(`/ai-providers/interactions/${index}`)}
            onDelete={(index) => void deleteNativeProvider('interactions', index)}
            onToggle={(index, enabled) =>
              void setNativeConfigEnabled('interactions', index, enabled)
            }
          />
        </div>

        <div id="provider-codex">
          <CodexSection
            configs={codexConfigs}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onAdd={() => openEditor('/ai-providers/codex/new')}
            onEdit={(index) => openEditor(`/ai-providers/codex/${index}`)}
            onDelete={(index) => void deleteProviderEntry('codex', index)}
            onToggle={(index, enabled) => void setConfigEnabled('codex', index, enabled)}
          />
        </div>

        <div id="provider-xai">
          <CodexSection
            configs={xaiConfigs}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            providerKey="xai"
            title="xAI"
            addButtonLabel="Add xAI API Key"
            emptyTitle="No xAI API keys"
            emptyDescription="Add a native xAI API credential."
            itemTitle="xAI API Key"
            modelsCountLabel="Models"
            iconSrc={iconOpenaiLight}
            onAdd={() => openEditor('/ai-providers/xai/new')}
            onEdit={(index) => openEditor(`/ai-providers/xai/${index}`)}
            onDelete={(index) => void deleteNativeProvider('xai', index)}
            onToggle={(index, enabled) => void setNativeConfigEnabled('xai', index, enabled)}
          />
        </div>

        <div id="provider-claude">
          <ClaudeSection
            configs={claudeConfigs}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onAdd={() => openEditor('/ai-providers/claude/new')}
            onEdit={(index) => openEditor(`/ai-providers/claude/${index}`)}
            onDelete={(index) => void deleteProviderEntry('claude', index)}
            onToggle={(index, enabled) => void setConfigEnabled('claude', index, enabled)}
          />
        </div>

        <div id="provider-vertex">
          <VertexSection
            configs={vertexConfigs}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onAdd={() => openEditor('/ai-providers/vertex/new')}
            onEdit={(index) => openEditor(`/ai-providers/vertex/${index}`)}
            onDelete={deleteVertex}
            onToggle={(index, enabled) => void setConfigEnabled('vertex', index, enabled)}
          />
        </div>

        <div id="provider-zai">
          <ZaiSection
            providers={zaiProviders}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onAdd={() => openEditor('/ai-providers/zai/new')}
            onEdit={(index) => openEditor(`/ai-providers/zai/${index}`)}
            onDelete={(index) => void deleteOpenai(index, 'zai')}
            onToggle={(index, enabled) => void setOpenAIProviderEnabled(index, enabled)}
          />
        </div>

        <div id="provider-openrouter">
          <OpenRouterSection
            providers={openrouterProviders}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onAdd={() => openEditor('/ai-providers/openrouter/new')}
            onEdit={(index) => openEditor(`/ai-providers/openrouter/${index}`)}
            onDelete={(index) => void deleteOpenai(index, 'openrouter')}
            onToggle={(index, enabled) => void setOpenAIProviderEnabled(index, enabled)}
          />
        </div>

        <div id="provider-ollama">
          <OllamaCloudSection
            providers={ollamaCloudProviders}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onAdd={() => openEditor('/ai-providers/ollama/new')}
            onEdit={(index) => openEditor(`/ai-providers/ollama/${index}`)}
            onDelete={(index) => void deleteOpenai(index, 'ollama')}
            onToggle={(index, enabled) => void setOpenAIProviderEnabled(index, enabled)}
          />
        </div>

        <div id="provider-openai">
          <OpenAISection
            configs={openaiProviders}
            upstreamConcurrency={config?.upstreamConcurrency}
            usageByProvider={usageByProvider}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            resolvedTheme={resolvedTheme}
            filterProvider={isGenericOpenAIProvider}
            onAdd={() => openEditor('/ai-providers/openai/new')}
            onEdit={(index) => openEditor(`/ai-providers/openai/${index}`)}
            onDelete={(index) => void deleteOpenai(index)}
            onToggle={(index, enabled) => void setOpenAIProviderEnabled(index, enabled)}
          />
        </div>
      </div>

      <ProviderNav />
    </WorkspacePage>
  );
}
