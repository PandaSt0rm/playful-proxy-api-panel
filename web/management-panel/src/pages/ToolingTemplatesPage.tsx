import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAuthStore, useNotificationStore } from '@/stores';
import { apiKeysApi } from '@/services/api/apiKeys';
import { modelsApi } from '@/services/api/models';
import { toolingTemplatesApi } from '@/services/api/toolingTemplates';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';
import { copyToClipboard } from '@/utils/clipboard';
import {
  type ApiKeyMode,
  type ManualConfigBlock,
  type RenderedToolTemplate,
  type ToolTemplateMetadata,
  type ToolTemplateId,
} from '@/utils/toolingTemplates';
import { SyncProfilesSection } from '@/components/sync';
import type { ModelInfo } from '@/utils/models';
import styles from './ToolingTemplatesPage.module.scss';

const PLACEHOLDER_KEY_VALUE = '__placeholder__';

type TFunction = ReturnType<typeof useTranslation>['t'];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
};

interface ToolCardConfig {
  id: ToolTemplateId;
  titleKey: string;
  hintKey: string;
  tabLabelKey: string;
}

const TAB_CARDS: ReadonlyArray<ToolCardConfig> = [
  {
    id: 'factory-droid',
    titleKey: 'tooling_templates.factory_droid_title',
    hintKey: 'tooling_templates.factory_droid_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.factory_droid',
  },
  {
    id: 'opencode',
    titleKey: 'tooling_templates.opencode_title',
    hintKey: 'tooling_templates.opencode_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.opencode',
  },
  {
    id: 'claude-code-env',
    titleKey: 'tooling_templates.claude_code_env_title',
    hintKey: 'tooling_templates.claude_code_env_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.claude_code_env',
  },
  {
    id: 'claude-code-settings',
    titleKey: 'tooling_templates.claude_code_settings_title',
    hintKey: 'tooling_templates.claude_code_settings_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.claude_code_settings',
  },
  {
    id: 'codex',
    titleKey: 'tooling_templates.codex_title',
    hintKey: 'tooling_templates.codex_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.codex',
  },
  {
    id: 'cursor',
    titleKey: 'tooling_templates.cursor_title',
    hintKey: 'tooling_templates.cursor_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.cursor',
  },
  {
    id: 'continue',
    titleKey: 'tooling_templates.continue_title',
    hintKey: 'tooling_templates.continue_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.continue_dev',
  },
  {
    id: 'aider',
    titleKey: 'tooling_templates.aider_title',
    hintKey: 'tooling_templates.aider_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.aider',
  },
  {
    id: 'forgecode',
    titleKey: 'tooling_templates.forgecode_title',
    hintKey: 'tooling_templates.forgecode_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.forgecode',
  },
  {
    id: 'hermes',
    titleKey: 'tooling_templates.hermes_title',
    hintKey: 'tooling_templates.hermes_hint',
    tabLabelKey: 'tooling_templates.tool_tabs.hermes',
  },
];

interface CurlCardConfig {
  id: 'curl-openai' | 'curl-anthropic';
  subtitleKey: string;
}

const CURL_CARDS: ReadonlyArray<CurlCardConfig> = [
  { id: 'curl-openai', subtitleKey: 'tooling_templates.curl_card.openai_subtitle' },
  { id: 'curl-anthropic', subtitleKey: 'tooling_templates.curl_card.anthropic_subtitle' },
];

const DEFAULT_TAB: ToolTemplateId = TAB_CARDS[0].id;

const truncateKey = (key: string): string => {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
};

const dedupeOrdered = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  });
  return out;
};

interface ModelMultiPickerProps {
  discoveredModels: ModelInfo[];
  selectedModels: string[];
  onAdd: (model: string) => void;
  onRemove: (model: string) => void;
  onAddMany: (models: string[]) => void;
  onRemoveMany: (models: string[]) => void;
  loading: boolean;
  t: TFunction;
}

function ModelMultiPicker({
  discoveredModels,
  selectedModels,
  onAdd,
  onRemove,
  onAddMany,
  onRemoveMany,
  loading,
  t,
}: ModelMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [popStyle, setPopStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const computeStyle = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minWidth = Math.min(Math.max(rect.width, 380), Math.max(0, vw - 16));
    const left = Math.min(Math.max(rect.left, 8), Math.max(8, vw - minWidth - 8));
    const spaceBelow = vh - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const targetMaxHeight = 420;
    const preferBelow = spaceBelow >= targetMaxHeight || spaceBelow >= spaceAbove;
    if (preferBelow) {
      setPopStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        minWidth,
        maxHeight: Math.max(240, Math.min(targetMaxHeight, spaceBelow)),
        zIndex: 2010,
      });
    } else {
      setPopStyle({
        position: 'fixed',
        bottom: vh - rect.top + 6,
        left,
        minWidth,
        maxHeight: Math.max(240, Math.min(targetMaxHeight, spaceAbove)),
        zIndex: 2010,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    computeStyle();
    const handleViewportChange = () => computeStyle();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, computeStyle]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closePicker();
    };
    const handleKeydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePicker();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open, closePicker]);

  const selectedSet = useMemo(() => new Set(selectedModels), [selectedModels]);
  const lowerQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!lowerQuery) return discoveredModels;
    return discoveredModels.filter((model) => {
      const haystack = `${model.name} ${model.alias ?? ''}`.toLowerCase();
      return haystack.includes(lowerQuery);
    });
  }, [discoveredModels, lowerQuery]);

  const visibleSelectedCount = filtered.reduce(
    (acc, model) => (selectedSet.has(model.name) ? acc + 1 : acc),
    0,
  );
  const allVisibleSelected = filtered.length > 0 && visibleSelectedCount === filtered.length;

  const handleToggleVisible = () => {
    if (allVisibleSelected) {
      onRemoveMany(filtered.map((model) => model.name));
    } else {
      onAddMany(filtered.map((model) => model.name));
    }
  };

  const disabled = discoveredModels.length === 0 && !loading;
  const triggerLabel =
    selectedModels.length > 0
      ? t('tooling_templates.add_model_with_count', {
          defaultValue: '+ Add models ({{count}} selected)',
          count: selectedModels.length,
        })
      : t('tooling_templates.add_model', { defaultValue: '+ Add models' });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.pickerTrigger}
        onClick={() => {
          if (disabled) return;
          if (open) {
            closePicker();
          } else {
            setOpen(true);
          }
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{triggerLabel}</span>
        <span className={styles.pickerChevron} aria-hidden="true">▾</span>
      </button>
      {open && popStyle &&
        createPortal(
          <div
            ref={popoverRef}
            className={styles.pickerPopover}
            role="dialog"
            aria-label={t('tooling_templates.picker_dialog_label', {
              defaultValue: 'Pick models',
            })}
            style={popStyle}
          >
            <div className={styles.pickerSearchRow}>
              <input
                ref={searchRef}
                type="text"
                className={styles.pickerSearch}
                placeholder={t('tooling_templates.picker_search_placeholder', {
                  defaultValue: 'Search models…',
                })}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t('tooling_templates.picker_search_aria', {
                  defaultValue: 'Search models',
                })}
              />
              {query && (
                <button
                  type="button"
                  className={styles.pickerSearchClear}
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label={t('common.clear', { defaultValue: 'Clear' })}
                >
                  ✕
                </button>
              )}
            </div>
            <div className={styles.pickerHeader}>
              <button
                type="button"
                className={styles.pickerToggleAll}
                onClick={handleToggleVisible}
                disabled={filtered.length === 0}
              >
                {allVisibleSelected
                  ? t('tooling_templates.picker_deselect_visible', {
                      defaultValue: 'Deselect all visible',
                    })
                  : t('tooling_templates.picker_select_visible', {
                      defaultValue: 'Select all visible',
                    })}
              </button>
              <span className={styles.pickerHeaderCounter}>
                {t('tooling_templates.picker_visible_count', {
                  defaultValue: '{{count}} of {{total}} shown',
                  count: filtered.length,
                  total: discoveredModels.length,
                })}
              </span>
            </div>
            <div className={styles.pickerList} role="listbox" aria-multiselectable="true">
              {filtered.length === 0 ? (
                <div className={styles.pickerEmpty}>
                  {t('tooling_templates.picker_no_match', {
                    defaultValue: 'No models match your search.',
                  })}
                </div>
              ) : (
                filtered.map((model) => {
                  const checked = selectedSet.has(model.name);
                  return (
                    <label
                      key={model.name}
                      className={`${styles.pickerRow} ${
                        checked ? styles.pickerRowChecked : ''
                      }`.trim()}
                    >
                      <input
                        type="checkbox"
                        className={styles.pickerCheckbox}
                        checked={checked}
                        onChange={() =>
                          checked ? onRemove(model.name) : onAdd(model.name)
                        }
                      />
                      <span className={styles.pickerRowName}>{model.name}</span>
                      {model.alias && (
                        <span className={styles.pickerRowAlias}>{model.alias}</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function ToolingTemplatesPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const authApiBase = useAuthStore((state) => state.apiBase);

  const [baseUrl, setBaseUrl] = useState<string>(() => authApiBase || detectApiBaseFromLocation());
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [selectedApiKey, setSelectedApiKey] = useState<string>('');
  const [keyMode, setKeyMode] = useState<ApiKeyMode>('placeholder');
  const [discoveredModels, setDiscoveredModels] = useState<ModelInfo[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [activeModels, setActiveModels] = useState<Partial<Record<ToolTemplateId, string>>>({});
  const [curlActiveModel, setCurlActiveModel] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ToolTemplateId>(DEFAULT_TAB);
  const [manualConfigOpen, setManualConfigOpen] = useState<{ openai: boolean; anthropic: boolean }>({
    openai: true,
    anthropic: true,
  });
  const [manualModelInput, setManualModelInput] = useState<string>('');
  const [modelsLoading, setModelsLoading] = useState<boolean>(false);
  const [modelsError, setModelsError] = useState<string>('');
  const [keysLoading, setKeysLoading] = useState<boolean>(false);
  const [keysError, setKeysError] = useState<string>('');
  const [templateMetadata, setTemplateMetadata] = useState<ToolTemplateMetadata[]>([]);
  const [renderedTemplates, setRenderedTemplates] = useState<RenderedToolTemplate[]>([]);
  const [manualBlocks, setManualBlocks] = useState<ManualConfigBlock[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string>('');

  const modelsRequestId = useRef(0);
  const templatesRequestId = useRef(0);
  const hasAutoSelectedRef = useRef(false);

  const defaultBaseUrl = useMemo(
    () => authApiBase || detectApiBaseFromLocation(),
    [authApiBase],
  );

  useEffect(() => {
    let cancelled = false;
    setKeysLoading(true);
    setKeysError('');
    apiKeysApi
      .list()
      .then((list) => {
        if (cancelled) return;
        const trimmed = list.map((key) => key.trim()).filter(Boolean);
        setApiKeys(trimmed);
        setSelectedApiKey((current) => {
          if (current && trimmed.includes(current)) return current;
          return trimmed[0] ?? '';
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setApiKeys([]);
        setSelectedApiKey('');
        setKeysError(getErrorMessage(error) || t('tooling_templates.api_keys_error'));
      })
      .finally(() => {
        if (cancelled) return;
        setKeysLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    toolingTemplatesApi
      .list()
      .then((templates) => {
        if (cancelled) return;
        setTemplateMetadata(templates);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTemplateMetadata([]);
        setTemplatesError(getErrorMessage(error) || t('tooling_templates.templates_error', {
          defaultValue: 'Could not load tooling templates from the server.',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const fetchModels = useCallback(async () => {
    const normalized = normalizeApiBase(baseUrl);
    if (!normalized) {
      setDiscoveredModels([]);
      setModelsError(t('tooling_templates.models_invalid_base'));
      return;
    }
    const requestId = ++modelsRequestId.current;
    setModelsLoading(true);
    setModelsError('');
    try {
      const result = await modelsApi.fetchModels(normalized, selectedApiKey || undefined);
      if (modelsRequestId.current !== requestId) return;
      setDiscoveredModels(result);
      if (!hasAutoSelectedRef.current) {
        const firstName = result[0]?.name?.trim();
        if (firstName) {
          setSelectedModels((current) => (current.length === 0 ? [firstName] : current));
          hasAutoSelectedRef.current = true;
        }
      }
    } catch (error: unknown) {
      if (modelsRequestId.current !== requestId) return;
      setDiscoveredModels([]);
      setModelsError(getErrorMessage(error) || t('tooling_templates.models_error'));
    } finally {
      if (modelsRequestId.current === requestId) {
        setModelsLoading(false);
      }
    }
  }, [baseUrl, selectedApiKey, t]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    setActiveModels((prev) => {
      const next: Partial<Record<ToolTemplateId, string>> = {};
      let changed = false;
      (Object.keys(prev) as ToolTemplateId[]).forEach((cardId) => {
        const value = prev[cardId];
        if (value && selectedModels.includes(value)) {
          next[cardId] = value;
        } else if (value) {
          changed = true;
        }
      });
      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });
  }, [selectedModels]);

  useEffect(() => {
    if (curlActiveModel && !selectedModels.includes(curlActiveModel)) {
      setCurlActiveModel('');
    }
  }, [curlActiveModel, selectedModels]);

  const baseUrlInputId = 'tooling-templates-base-url';
  const apiKeyInputId = 'tooling-templates-api-key';
  const manualModelInputId = 'tooling-templates-manual-model';

  const apiKeyOptions: SelectOption[] = useMemo(() => {
    const options: SelectOption[] = [
      { value: PLACEHOLDER_KEY_VALUE, label: t('tooling_templates.api_key_none_label') },
    ];
    apiKeys.forEach((key) => {
      options.push({ value: key, label: truncateKey(key) });
    });
    return options;
  }, [apiKeys, t]);

  const handleApiKeyChange = (next: string) => {
    if (next === PLACEHOLDER_KEY_VALUE) {
      setSelectedApiKey('');
      return;
    }
    setSelectedApiKey(next);
  };

  const handleAddModel = useCallback((model: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    setSelectedModels((current) =>
      current.includes(trimmed) ? current : dedupeOrdered([...current, trimmed]),
    );
  }, []);

  const handleAddManyModels = useCallback((models: string[]) => {
    setSelectedModels((current) => dedupeOrdered([...current, ...models]));
  }, []);

  const handleRemoveModel = useCallback((model: string) => {
    setSelectedModels((current) => current.filter((value) => value !== model));
  }, []);

  const handleRemoveManyModels = useCallback((models: string[]) => {
    const removeSet = new Set(models);
    setSelectedModels((current) => current.filter((value) => !removeSet.has(value)));
  }, []);

  const handleSelectAllDiscovered = () => {
    setSelectedModels((current) =>
      dedupeOrdered([...current, ...discoveredModels.map((model) => model.name)]),
    );
  };

  const handleClearModels = () => {
    setSelectedModels([]);
    setActiveModels({});
  };

  const handleSetPrimary = (model: string) => {
    setSelectedModels((current) => {
      if (current[0] === model) return current;
      const others = current.filter((value) => value !== model);
      return [model, ...others];
    });
  };

  const handleManualModelSubmit = () => {
    const value = manualModelInput.trim();
    if (!value) return;
    handleAddModel(value);
    setManualModelInput('');
  };

  const handleManualModelKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleManualModelSubmit();
    }
  };

  const handleResetBaseUrl = () => {
    setBaseUrl(defaultBaseUrl);
  };

  const handleCopy = async (snippet: string) => {
    const ok = await copyToClipboard(snippet);
    showNotification(
      t(ok ? 'tooling_templates.copy_success' : 'notification.copy_failed'),
      ok ? 'success' : 'error',
    );
  };

  const handleSetActiveModel = (cardId: ToolTemplateId, model: string) => {
    setActiveModels((prev) => ({ ...prev, [cardId]: model }));
  };

  const apiKeySelectValue = selectedApiKey || PLACEHOLDER_KEY_VALUE;
  const primaryModel = selectedModels[0] ?? '';

  const sharedInputsBase = useMemo(
    () => ({
      baseUrl,
      apiKey: selectedApiKey,
      models: selectedModels,
      mode: keyMode,
    }),
    [baseUrl, selectedApiKey, selectedModels, keyMode],
  );

  const resolveActiveModel = (cardId: ToolTemplateId): string => {
    const override = activeModels[cardId];
    if (override && selectedModels.includes(override)) return override;
    return primaryModel;
  };

  const activeModelOverrides = useMemo(() => {
    const overrides: Partial<Record<ToolTemplateId | string, string>> = {};
    TAB_CARDS.forEach((card) => {
      const override = activeModels[card.id];
      overrides[card.id] = override && selectedModels.includes(override) ? override : primaryModel;
    });
    const curlActive =
      curlActiveModel && selectedModels.includes(curlActiveModel) ? curlActiveModel : primaryModel;
    overrides['curl-openai'] = curlActive;
    overrides['curl-anthropic'] = curlActive;
    return overrides;
  }, [activeModels, curlActiveModel, primaryModel, selectedModels]);

  useEffect(() => {
    const requestId = ++templatesRequestId.current;
    setTemplatesLoading(true);
    setTemplatesError('');
    toolingTemplatesApi
      .render({
        base_url: sharedInputsBase.baseUrl,
        api_key: sharedInputsBase.apiKey,
        api_key_mode: sharedInputsBase.mode,
        models: sharedInputsBase.models,
        active_model: primaryModel,
        active_models: activeModelOverrides,
      })
      .then((response) => {
        if (templatesRequestId.current !== requestId) return;
        setRenderedTemplates(response.templates);
        setManualBlocks(response.manual_config);
      })
      .catch((error: unknown) => {
        if (templatesRequestId.current !== requestId) return;
        setRenderedTemplates([]);
        setManualBlocks([]);
        setTemplatesError(getErrorMessage(error) || t('tooling_templates.templates_error', {
          defaultValue: 'Could not render tooling templates from the server.',
        }));
      })
      .finally(() => {
        if (templatesRequestId.current === requestId) {
          setTemplatesLoading(false);
        }
      });
  }, [activeModelOverrides, primaryModel, sharedInputsBase, t]);

  const renderedById = useMemo(() => {
    const map = new Map<ToolTemplateId, RenderedToolTemplate>();
    renderedTemplates.forEach((template) => {
      map.set(template.id, template);
    });
    return map;
  }, [renderedTemplates]);

  const metadataById = useMemo(() => {
    const map = new Map<ToolTemplateId, ToolTemplateMetadata>();
    templateMetadata.forEach((template) => {
      map.set(template.id, template);
    });
    return map;
  }, [templateMetadata]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>
        {t('nav.tooling_templates', { defaultValue: 'Tooling Templates' })}
      </h1>
      <p className={styles.pageHint}>
        {t('tooling_templates.page_hint', {
          defaultValue:
            'Generate ready-to-paste configs for AI coding tools pointed at this proxy. Pick a base URL, an API key, and one or more models — then copy the snippet that fits your tool.',
        })}
      </p>

      <div className={styles.content}>
        <Card title={t('tooling_templates.inputs_title', { defaultValue: 'Inputs' })}>
          <div className={styles.controls}>
            <div className={styles.controlRow}>
              <label className={styles.controlLabel} htmlFor={baseUrlInputId}>
                {t('tooling_templates.base_url_label', { defaultValue: 'Base URL' })}
              </label>
              <div className={styles.controlField}>
                <Input
                  id={baseUrlInputId}
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="http://localhost:8317"
                  hint={t('tooling_templates.base_url_hint', {
                    defaultValue:
                      'Auto-detected from the current page. Override when sharing a config that targets a different hostname.',
                  })}
                />
              </div>
              <div className={styles.controlAction}>
                <Button variant="secondary" size="sm" onClick={handleResetBaseUrl}>
                  {t('tooling_templates.reset', { defaultValue: 'Reset' })}
                </Button>
              </div>
            </div>

            <div className={styles.controlRow}>
              <label className={styles.controlLabel} htmlFor={apiKeyInputId}>
                {t('tooling_templates.api_key_label', { defaultValue: 'API key' })}
              </label>
              <div className={styles.controlField}>
                <Select
                  id={apiKeyInputId}
                  value={apiKeySelectValue}
                  options={apiKeyOptions}
                  onChange={handleApiKeyChange}
                  ariaLabel={t('tooling_templates.api_key_label', { defaultValue: 'API key' })}
                  disabled={keysLoading}
                  placeholder={t('tooling_templates.api_key_placeholder', {
                    defaultValue: 'Select an API key…',
                  })}
                />
                {keysError && <div className={styles.modelError}>{keysError}</div>}
                {!keysError && (
                  <div className={styles.modelStatus}>
                    {keysLoading
                      ? t('common.loading')
                      : apiKeys.length === 0
                        ? t('tooling_templates.api_key_none_hint', {
                            defaultValue:
                              'No API keys configured. Add one in Config → API Keys to embed a real key.',
                          })
                        : t('tooling_templates.api_key_count', {
                            defaultValue: '{{count}} key available',
                            defaultValue_plural: '{{count}} keys available',
                            count: apiKeys.length,
                          })}
                  </div>
                )}
              </div>
              <div className={styles.controlAction}>
                <div className={styles.modeToggle}>
                  <ToggleSwitch
                    checked={keyMode === 'embed'}
                    onChange={(next) => setKeyMode(next ? 'embed' : 'placeholder')}
                    ariaLabel={t('tooling_templates.embed_toggle', {
                      defaultValue: 'Embed selected key in snippets',
                    })}
                    disabled={keyMode === 'placeholder' && !selectedApiKey}
                  />
                  <span>
                    {keyMode === 'embed'
                      ? t('tooling_templates.mode_embed', { defaultValue: 'Embed in snippet' })
                      : t('tooling_templates.mode_placeholder', {
                          defaultValue: 'Placeholder in snippet',
                        })}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.controlRow}>
              <label className={styles.controlLabel}>
                {t('tooling_templates.models_label', { defaultValue: 'Models' })}
              </label>
              <div className={styles.controlField}>
                {selectedModels.length === 0 ? (
                  <div className={styles.chipsEmpty}>
                    {t('tooling_templates.chips_empty', {
                      defaultValue:
                        'No models selected. Snippets will use a placeholder model id until you add one.',
                    })}
                  </div>
                ) : (
                  <ul
                    className={styles.chipStrip}
                    aria-label={t('tooling_templates.models_label', { defaultValue: 'Models' })}
                  >
                    {selectedModels.map((model, index) => {
                      const isPrimary = index === 0;
                      const ariaLabel = isPrimary
                        ? t('tooling_templates.primary_chip_aria', {
                            defaultValue: 'Primary model: {{model}}',
                            model,
                          })
                        : t('tooling_templates.set_primary_aria', {
                            defaultValue: 'Set {{model}} as primary',
                            model,
                          });
                      return (
                        <li
                          key={model}
                          className={`${styles.chip} ${isPrimary ? styles.chipPrimary : ''}`.trim()}
                        >
                          <button
                            type="button"
                            className={styles.chipLabelButton}
                            onClick={() => handleSetPrimary(model)}
                            aria-label={ariaLabel}
                            title={
                              isPrimary
                                ? t('tooling_templates.primary_chip_title', {
                                    defaultValue: 'Primary model',
                                  })
                                : t('tooling_templates.set_primary', {
                                    defaultValue: 'Set as primary',
                                  })
                            }
                          >
                            <span className={styles.chipPrimaryGlyph} aria-hidden="true">
                              {isPrimary ? '★' : '☆'}
                            </span>
                            <span className={styles.chipLabel}>{model}</span>
                          </button>
                          <button
                            type="button"
                            className={styles.chipRemove}
                            onClick={() => handleRemoveModel(model)}
                            aria-label={t('tooling_templates.remove_model_aria', {
                              defaultValue: 'Remove {{model}}',
                              model,
                            })}
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className={styles.modelActions}>
                  <ModelMultiPicker
                    discoveredModels={discoveredModels}
                    selectedModels={selectedModels}
                    onAdd={handleAddModel}
                    onRemove={handleRemoveModel}
                    onAddMany={handleAddManyModels}
                    onRemoveMany={handleRemoveManyModels}
                    loading={modelsLoading}
                    t={t}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectAllDiscovered}
                    disabled={modelsLoading || discoveredModels.length === 0}
                  >
                    {t('tooling_templates.select_all', { defaultValue: 'Select all' })}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleClearModels}
                    disabled={selectedModels.length === 0}
                  >
                    {t('tooling_templates.clear', { defaultValue: 'Clear' })}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={fetchModels}
                    loading={modelsLoading}
                  >
                    {t('tooling_templates.refresh_models', { defaultValue: 'Refresh' })}
                  </Button>
                </div>
                <div className={styles.manualModelRow}>
                  <Input
                    id={manualModelInputId}
                    value={manualModelInput}
                    onChange={(event) => setManualModelInput(event.target.value)}
                    onKeyDown={handleManualModelKeyDown}
                    placeholder={t('tooling_templates.model_manual_placeholder', {
                      defaultValue: 'Type a model id and press Enter to add manually',
                    })}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleManualModelSubmit}
                    disabled={!manualModelInput.trim()}
                  >
                    {t('tooling_templates.add_manual', { defaultValue: 'Add' })}
                  </Button>
                </div>
                {modelsError ? (
                  <div className={styles.modelError}>
                    {t('tooling_templates.models_error', {
                      defaultValue:
                        'Could not load models from /v1/models. Add a model name manually below.',
                    })}
                    {modelsError && ` (${modelsError})`}
                  </div>
                ) : (
                  <div className={styles.modelStatus}>
                    {modelsLoading
                      ? t('tooling_templates.models_loading', { defaultValue: 'Loading models…' })
                      : discoveredModels.length === 0
                        ? t('tooling_templates.models_empty', {
                            defaultValue:
                              'No models reported by /v1/models. Use the manual input below.',
                          })
                        : t('tooling_templates.models_loaded', {
                            defaultValue: '{{count}} model loaded from /v1/models',
                            defaultValue_plural: '{{count}} models loaded from /v1/models',
                            count: discoveredModels.length,
                          })}
                    {selectedModels.length > 0 && (
                      <>
                        {' · '}
                        {t('tooling_templates.models_selected_count', {
                          defaultValue: '{{count}} selected',
                          defaultValue_plural: '{{count}} selected',
                          count: selectedModels.length,
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {(() => {
          return (
            <Card title={t('tooling_templates.manual_config.title', { defaultValue: 'Manual config' })}>
              <div className={styles.cardContent}>
                <p className={styles.cardHint}>
                  {t('tooling_templates.manual_config.hint', {
                    defaultValue:
                      'Reference values for any tool not in the snippet tabs below. Copy what you need.',
                  })}
                </p>
                {templatesError && <div className={styles.modelError}>{templatesError}</div>}
                {templatesLoading && !templatesError && (
                  <div className={styles.modelStatus}>{t('common.loading')}</div>
                )}
                {manualBlocks.map((block) => {
                  const isOpen = manualConfigOpen[block.id];
                  return (
                    <div key={block.id} className={styles.manualBlock}>
                      <button
                        type="button"
                        className={styles.manualBlockHeader}
                        onClick={() =>
                          setManualConfigOpen((prev) => ({ ...prev, [block.id]: !prev[block.id] }))
                        }
                        aria-expanded={isOpen}
                      >
                        <span className={styles.manualBlockChevron} aria-hidden="true">
                          {isOpen ? '▾' : '▸'}
                        </span>
                        <span className={styles.manualBlockTitle}>{t(block.title_key)}</span>
                      </button>
                      {isOpen && (
                        <div className={styles.manualBlockBody}>
                          {block.lines.map((line) => {
                            const label = t(line.label_key);
                            return (
                              <div key={line.id} className={styles.manualLine}>
                                <span className={styles.manualLineLabel}>{label}</span>
                                <code className={styles.manualLineValue}>{line.value}</code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={styles.manualLineCopy}
                                  onClick={() => handleCopy(line.value)}
                                  aria-label={t('tooling_templates.manual_config.copy_aria', {
                                    defaultValue: 'Copy {{label}}',
                                    label,
                                  })}
                                >
                                  {t('tooling_templates.copy', { defaultValue: 'Copy' })}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {(() => {
          const curlActive =
            curlActiveModel && selectedModels.includes(curlActiveModel)
              ? curlActiveModel
              : primaryModel;
          const showCurlStrip = selectedModels.length > 1;
          return (
            <Card
              title={t('tooling_templates.curl_card.title', { defaultValue: 'curl examples' })}
            >
              <div className={styles.cardContent}>
                <p className={styles.cardHint}>
                  {t('tooling_templates.curl_card.hint', {
                    defaultValue:
                      'Minimal requests for both wire formats. Paste into an AI agent so it can learn the protocol from a worked example.',
                  })}
                </p>
                {showCurlStrip && (
                  <div
                    className={styles.activeModelTabs}
                    role="tablist"
                    aria-label={t('tooling_templates.active_model_label', {
                      defaultValue: 'Active model',
                    })}
                  >
                    <span className={styles.activeModelTabsLabel}>
                      {t('tooling_templates.active_model_label', { defaultValue: 'Active model' })}
                    </span>
                    {selectedModels.map((model) => {
                      const isActive = model === curlActive;
                      return (
                        <button
                          key={model}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`${styles.activeModelTab} ${
                            isActive ? styles.activeModelTabActive : ''
                          }`.trim()}
                          onClick={() => setCurlActiveModel(model)}
                        >
                          {model}
                        </button>
                      );
                    })}
                  </div>
                )}
                {templatesError && <div className={styles.modelError}>{templatesError}</div>}
                {templatesLoading && !templatesError && (
                  <div className={styles.modelStatus}>{t('common.loading')}</div>
                )}
                <div className={styles.curlSnippets}>
                  {CURL_CARDS.map((curlCard) => {
                    const template = renderedById.get(curlCard.id);
                    if (!template) return null;
                    const snippet = template.content;
                    return (
                      <div key={curlCard.id} className={styles.curlSnippetGroup}>
                        <div className={styles.curlSnippetSubtitle}>{t(curlCard.subtitleKey)}</div>
                        <div className={styles.snippetBlock}>
                          <div className={styles.snippetHeader}>
                            <span className={styles.snippetMeta}>{template.language}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(snippet)}
                            >
                              {t('tooling_templates.copy', { defaultValue: 'Copy' })}
                            </Button>
                          </div>
                          <pre className={styles.snippetCode}>{snippet}</pre>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })()}

        {(() => {
          const activeCard =
            TAB_CARDS.find((card) => card.id === activeTab) ?? TAB_CARDS[0];
          const renderedTemplate = renderedById.get(activeCard.id);
          const template = renderedTemplate ?? metadataById.get(activeCard.id);
          if (!template) return null;
          const activeModel = resolveActiveModel(activeCard.id);
          const snippet = renderedTemplate?.content ?? '';
          const showActiveModelStrip = !template.multi_model && selectedModels.length > 1;
          return (
            <Card
              title={t('tooling_templates.tools_card.title', { defaultValue: 'Tool snippets' })}
            >
              <div className={styles.cardContent}>
                <p className={styles.cardHint}>
                  {t('tooling_templates.tools_card.hint', {
                    defaultValue: 'Pick a tool. Snippet updates with your inputs above.',
                  })}
                </p>
                <div
                  className={styles.toolTabs}
                  role="tablist"
                  aria-label={t('tooling_templates.tools_card.title', {
                    defaultValue: 'Tool snippets',
                  })}
                >
                  {TAB_CARDS.map((card) => {
                    const isActive = card.id === activeCard.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`${styles.toolTab} ${
                          isActive ? styles.toolTabActive : ''
                        }`.trim()}
                        onClick={() => setActiveTab(card.id)}
                      >
                        {t(card.tabLabelKey)}
                      </button>
                    );
                  })}
                </div>
                <div className={styles.toolTabBody}>
                  <div className={styles.toolTabHeading}>
                    <span className={styles.cardTitleName}>{t(activeCard.titleKey)}</span>
                    {template.filename && (
                      <span className={styles.cardTitleFilename}>{template.filename}</span>
                    )}
                  </div>
                  <p className={styles.cardHint}>{t(activeCard.hintKey)}</p>
                  {showActiveModelStrip && (
                    <div
                      className={styles.activeModelTabs}
                      role="tablist"
                      aria-label={t('tooling_templates.active_model_label', {
                        defaultValue: 'Active model',
                      })}
                    >
                      <span className={styles.activeModelTabsLabel}>
                        {t('tooling_templates.active_model_label', {
                          defaultValue: 'Active model',
                        })}
                      </span>
                      {selectedModels.map((model) => {
                        const isActive = model === activeModel;
                        return (
                          <button
                            key={model}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`${styles.activeModelTab} ${
                              isActive ? styles.activeModelTabActive : ''
                            }`.trim()}
                            onClick={() => handleSetActiveModel(activeCard.id, model)}
                          >
                            {model}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className={styles.snippetBlock}>
                    <div className={styles.snippetHeader}>
                      <span className={styles.snippetMeta}>{template.language}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(snippet)}
                        disabled={!snippet}
                      >
                        {t('tooling_templates.copy', { defaultValue: 'Copy' })}
                      </Button>
                    </div>
                    {templatesError ? (
                      <div className={styles.modelError}>{templatesError}</div>
                    ) : templatesLoading && !snippet ? (
                      <div className={styles.modelStatus}>{t('common.loading')}</div>
                    ) : (
                      <pre className={styles.snippetCode}>{snippet}</pre>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })()}

        <SyncProfilesSection />
      </div>
    </div>
  );
}
