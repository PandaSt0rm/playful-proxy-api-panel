import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { MemoryRouter, Routes, Route, useOutletContext } from 'react-router-dom';
import { render, waitFor } from '@/test/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOpenAIEditDraftStore } from '@/stores/useOpenAIEditDraftStore';
import type { OpenAIProviderConfig } from '@/types';
import type { OpenAIEditOutletContext } from './AiProvidersOpenAIEditLayout';
import {
  AiProvidersOpenAIEditLayout,
  type OpenAIProviderEditorMode,
} from './AiProvidersOpenAIEditLayout';

// --- Boundary mocks -------------------------------------------------------

const allowNextNavigation = vi.fn();
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation }),
}));

const saveOpenAIProviders = vi.fn(async () => {});
const getOpenAIProviders = vi.fn(async () => [] as OpenAIProviderConfig[]);
const saveProviderConcurrencyDraft = vi.fn(async () => {});
vi.mock('@/services/api', () => ({
  providersApi: {
    saveOpenAIProviders: (...args: unknown[]) => saveOpenAIProviders(...args),
    getOpenAIProviders: (...args: unknown[]) => getOpenAIProviders(...args),
  },
  saveProviderConcurrencyDraft: (...args: unknown[]) => saveProviderConcurrencyDraft(...args),
}));

const showNotification = vi.fn();
vi.mock('@/stores/useNotificationStore', () => ({
  useNotificationStore: () => ({ showNotification }),
}));

// --- Context capture child ------------------------------------------------

let captured: OpenAIEditOutletContext | null = null;

function ContextProbe() {
  const context = useOutletContext<OpenAIEditOutletContext>();
  useEffect(() => {
    captured = context;
  });
  return <div data-testid="probe">probe</div>;
}

const renderLayout = (
  route: string,
  childPath: string,
  providerMode: OpenAIProviderEditorMode = 'openai'
) => {
  const rootPath = `/ai-providers/${providerMode}`;
  const element =
    providerMode === 'openai' ? (
      <AiProvidersOpenAIEditLayout />
    ) : (
      <AiProvidersOpenAIEditLayout providerMode={providerMode} />
    );

  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={rootPath} element={element}>
          <Route path={childPath} element={<ContextProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
};

const seedConfig = (openaiCompatibility: OpenAIProviderConfig[]) => {
  const now = Date.now();
  const config = { openaiCompatibility } as never;
  const cache = new Map<string, { data: unknown; timestamp: number }>();
  cache.set('openai-compatibility', { data: openaiCompatibility, timestamp: now });
  cache.set('__full__', { data: config, timestamp: now });
  useConfigStore.setState({ config, cache });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  captured = null;
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  useAuthStore.setState({ connectionStatus: 'connected' });
  useOpenAIEditDraftStore.setState({ drafts: {}, refCounts: {} });
  getOpenAIProviders.mockResolvedValue([]);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvidersOpenAIEditLayout', () => {
  it('provides an empty form for the "new" route', async () => {
    seedConfig([]);

    renderLayout('/ai-providers/openai/new', 'new');

    await waitFor(() => expect(captured?.loading).toBe(false));
    expect(captured?.form.name).toBe('');
    expect(captured?.editIndex).toBeNull();
    expect(captured?.hasIndexParam).toBe(false);
    expect(captured?.providerMode).toBe('openai');
  });

  it('provides Ollama Cloud defaults for the ollama "new" route', async () => {
    seedConfig([]);

    renderLayout('/ai-providers/ollama/new', 'new', 'ollama');

    await waitFor(() => expect(captured?.loading).toBe(false));
    expect(captured?.providerMode).toBe('ollama');
    expect(captured?.form.name).toBe('Ollama Cloud');
    expect(captured?.form.prefix).toBe('ollama');
    expect(captured?.form.baseUrl).toBe('https://ollama.com/v1');
    expect(captured?.form.modelEntries.map((entry) => entry.name)).toEqual([
      'gpt-oss:120b',
      'gpt-oss:20b',
      'qwen3.5:397b',
    ]);
  });

  it('loads the form from the provider entry at the edit index', async () => {
    const provider: OpenAIProviderConfig = {
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-1' }],
      models: [{ name: 'gpt-4o' }],
    };
    seedConfig([provider]);
    getOpenAIProviders.mockResolvedValue([provider]);

    renderLayout('/ai-providers/openai/0', ':index');

    await waitFor(() => expect(captured?.form.name).toBe('Acme'));
    expect(captured?.form.baseUrl).toBe('https://api.example.com/v1');
    expect(captured?.editIndex).toBe(0);
    expect(captured?.hasIndexParam).toBe(true);
  });

  it('flags an invalid index param for a non-numeric index', async () => {
    seedConfig([]);

    renderLayout('/ai-providers/openai/abc', ':index');

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured?.invalidIndexParam).toBe(true);
    expect(captured?.editIndex).toBeNull();
  });

  it('flags an invalid index when the edit index is out of range', async () => {
    const provider: OpenAIProviderConfig = {
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [],
    };
    seedConfig([provider]);
    getOpenAIProviders.mockResolvedValue([provider]);

    renderLayout('/ai-providers/openai/9', ':index');

    await waitFor(() => expect(captured?.invalidIndex).toBe(true));
  });

  it('exposes availableModels from the trimmed model entry names', async () => {
    const provider: OpenAIProviderConfig = {
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-1' }],
      models: [{ name: 'gpt-4o' }, { name: '' }, { name: 'gpt-4o-mini' }],
    };
    seedConfig([provider]);
    getOpenAIProviders.mockResolvedValue([provider]);

    renderLayout('/ai-providers/openai/0', ':index');

    await waitFor(() => expect(captured?.availableModels).toEqual(['gpt-4o', 'gpt-4o-mini']));
  });

  it('disables controls when the connection status is not connected', async () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });
    seedConfig([]);

    renderLayout('/ai-providers/openai/new', 'new');

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured?.disableControls).toBe(true);
  });

  it('blocks saving and warns when name or baseUrl is missing', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({ ...prev, name: '', baseUrl: '' }));
    await waitFor(() => expect(captured?.form.name).toBe(''));
    await captured?.handleSave();

    expect(saveOpenAIProviders).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith(
      'Please fill in provider name and Base URL',
      'error'
    );
  });

  it('saves a new provider by appending the trimmed payload to the list', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      name: '  Acme  ',
      baseUrl: ' https://api.example.com/v1 ',
      apiKeyEntries: [{ apiKey: ' sk-1 ', proxyUrl: '', headers: {} }],
      modelEntries: [{ name: 'gpt-4o', alias: '' }],
    }));
    await waitFor(() => expect(captured?.form.name).toBe('  Acme  '));
    await captured?.handleSave();

    await waitFor(() => expect(saveOpenAIProviders).toHaveBeenCalledTimes(1));
    const [savedList] = saveOpenAIProviders.mock.calls[0];
    expect(savedList).toHaveLength(1);
    expect(savedList[0].name).toBe('Acme');
    expect(savedList[0].baseUrl).toBe('https://api.example.com/v1');
  });

  it('trims the api key in the saved apiKeyEntries payload', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: '  sk-trim  ', weight: 0, proxyUrl: '', headers: {} }],
    }));
    await waitFor(() => expect(captured?.form.name).toBe('Acme'));
    await captured?.handleSave();

    await waitFor(() => expect(saveOpenAIProviders).toHaveBeenCalledTimes(1));
    const [savedList] = saveOpenAIProviders.mock.calls[0];
    expect(savedList[0].apiKeyEntries[0].apiKey).toBe('sk-trim');
    expect(savedList[0].apiKeyEntries[0].weight).toBe(0);
  });

  it('normalizes the saved models from the model entries (alias dropped when equal to name)', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-1', proxyUrl: '', headers: {} }],
      modelEntries: [
        { name: 'gpt-4o', alias: 'gpt-4o' },
        { name: 'kimi', alias: 'k2' },
      ],
    }));
    await waitFor(() => expect(captured?.form.modelEntries).toHaveLength(2));
    await captured?.handleSave();

    await waitFor(() => expect(saveOpenAIProviders).toHaveBeenCalledTimes(1));
    const [savedList] = saveOpenAIProviders.mock.calls[0];
    expect(savedList[0].models).toEqual([{ name: 'gpt-4o' }, { name: 'kimi', alias: 'k2' }]);
  });

  it('replaces the entry at the edit index when saving an existing provider', async () => {
    const provider: OpenAIProviderConfig = {
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-old' }],
    };
    seedConfig([provider]);
    getOpenAIProviders.mockResolvedValue([provider]);
    renderLayout('/ai-providers/openai/0', ':index');
    await waitFor(() => expect(captured?.form.name).toBe('Acme'));

    captured?.setForm((prev) => ({ ...prev, name: 'Acme Renamed' }));
    await waitFor(() => expect(captured?.form.name).toBe('Acme Renamed'));
    await captured?.handleSave();

    await waitFor(() => expect(saveOpenAIProviders).toHaveBeenCalledTimes(1));
    const [savedList] = saveOpenAIProviders.mock.calls[0];
    expect(savedList).toHaveLength(1);
    expect(savedList[0].name).toBe('Acme Renamed');
  });

  it('preserves the disabled flag from the existing provider when saving an edit', async () => {
    const provider: OpenAIProviderConfig = {
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-old' }],
      disabled: true,
    };
    seedConfig([provider]);
    getOpenAIProviders.mockResolvedValue([provider]);
    renderLayout('/ai-providers/openai/0', ':index');
    await waitFor(() => expect(captured?.form.name).toBe('Acme'));

    captured?.setForm((prev) => ({ ...prev, baseUrl: 'https://api.example.com/v2' }));
    await waitFor(() => expect(captured?.form.baseUrl).toBe('https://api.example.com/v2'));
    await captured?.handleSave();

    await waitFor(() => expect(saveOpenAIProviders).toHaveBeenCalledTimes(1));
    const [savedList] = saveOpenAIProviders.mock.calls[0];
    expect(savedList[0].disabled).toBe(true);
  });

  it('shows the added-success notification after saving a new provider', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-1', proxyUrl: '', headers: {} }],
    }));
    await waitFor(() => expect(captured?.form.name).toBe('Acme'));
    await captured?.handleSave();

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith('OpenAI provider added successfully', 'success')
    );
  });

  it('shows the update-failed notification when saving rejects', async () => {
    seedConfig([]);
    saveOpenAIProviders.mockRejectedValueOnce(new Error('save boom'));
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-1', proxyUrl: '', headers: {} }],
    }));
    await waitFor(() => expect(captured?.form.name).toBe('Acme'));
    await captured?.handleSave();

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith('Update failed: save boom', 'error')
    );
  });

  it('persists the concurrency draft keyed by the provider name on save', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      name: 'Acme',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEntries: [{ apiKey: 'sk-1', proxyUrl: '', headers: {} }],
    }));
    captured?.setConcurrencyLimit('3');
    await waitFor(() => expect(captured?.concurrencyLimit).toBe('3'));
    await waitFor(() => expect(captured?.form.name).toBe('Acme'));
    await captured?.handleSave();

    await waitFor(() => expect(saveProviderConcurrencyDraft).toHaveBeenCalledTimes(1));
    expect(saveProviderConcurrencyDraft.mock.calls[0][0]).toMatchObject({
      providerKey: 'Acme',
      draftLimit: '3',
    });
  });

  it('reports an invalid concurrency limit error for a non-numeric draft', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setConcurrencyLimit('xx');

    await waitFor(() =>
      expect(captured?.concurrencyLimitError).toBe('Enter a non-negative whole number')
    );
  });

  it('merges discovered models into the form, skipping duplicates', async () => {
    seedConfig([]);
    renderLayout('/ai-providers/openai/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));
    captured?.setForm((prev) => ({ ...prev, modelEntries: [{ name: 'gpt-4o', alias: '' }] }));
    await waitFor(() => expect(captured?.form.modelEntries[0].name).toBe('gpt-4o'));

    captured?.mergeDiscoveredModels([
      { name: 'gpt-4o', alias: '' },
      { name: 'gpt-4o-mini', alias: '' },
    ]);

    await waitFor(() =>
      expect(captured?.form.modelEntries.map((entry) => entry.name)).toEqual([
        'gpt-4o',
        'gpt-4o-mini',
      ])
    );
  });
});
