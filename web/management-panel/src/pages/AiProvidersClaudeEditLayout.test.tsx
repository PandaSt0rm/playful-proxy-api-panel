import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { MemoryRouter, Routes, Route, useOutletContext } from 'react-router-dom';
import { render, waitFor } from '@/test/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useClaudeEditDraftStore } from '@/stores/useClaudeEditDraftStore';
import type { ProviderKeyConfig } from '@/types';
import type { ClaudeEditOutletContext } from './AiProvidersClaudeEditLayout';
import { AiProvidersClaudeEditLayout } from './AiProvidersClaudeEditLayout';

// --- Boundary mocks -------------------------------------------------------

const allowNextNavigation = vi.fn();
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation }),
}));

const saveClaudeConfigs = vi.fn(async () => {});
const getClaudeConfigs = vi.fn(async () => [] as ProviderKeyConfig[]);
const saveProviderConcurrencyDraft = vi.fn(async () => {});
vi.mock('@/services/api', () => ({
  providersApi: {
    saveClaudeConfigs: (...args: unknown[]) => saveClaudeConfigs(...args),
    getClaudeConfigs: (...args: unknown[]) => getClaudeConfigs(...args),
  },
  saveProviderConcurrencyDraft: (...args: unknown[]) => saveProviderConcurrencyDraft(...args),
}));

const showNotification = vi.fn();
vi.mock('@/stores/useNotificationStore', () => ({
  useNotificationStore: () => ({ showNotification }),
}));

// --- Context capture child ------------------------------------------------

let captured: ClaudeEditOutletContext | null = null;

function ContextProbe() {
  const context = useOutletContext<ClaudeEditOutletContext>();
  useEffect(() => {
    captured = context;
  });
  return <div data-testid="probe">probe</div>;
}

const renderLayout = (route: string, childPath: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/ai-providers/claude" element={<AiProvidersClaudeEditLayout />}>
          <Route path={childPath} element={<ContextProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

const seedConfigCache = (claudeApiKeys: ProviderKeyConfig[], upstreamConcurrency?: unknown) => {
  const now = Date.now();
  const config = { claudeApiKeys, upstreamConcurrency } as never;
  const cache = new Map<string, { data: unknown; timestamp: number }>();
  cache.set('claude-api-key', { data: claudeApiKeys, timestamp: now });
  cache.set('__full__', { data: config, timestamp: now });
  useConfigStore.setState({ config, cache });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  captured = null;
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  useAuthStore.setState({ connectionStatus: 'connected' });
  useClaudeEditDraftStore.setState({ drafts: {}, refCounts: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvidersClaudeEditLayout', () => {
  it('provides an empty form for the "new" route', async () => {
    seedConfigCache([]);
    getClaudeConfigs.mockResolvedValue([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);

    renderLayout('/ai-providers/claude/new', 'new');

    await waitFor(() => expect(captured?.loading).toBe(false));
    expect(captured?.form.apiKey).toBe('');
    expect(captured?.editIndex).toBeNull();
    expect(captured?.hasIndexParam).toBe(false);
  });

  it('loads the form from the config entry at the edit index', async () => {
    const entry: ProviderKeyConfig = {
      apiKey: 'sk-existing',
      baseUrl: 'https://api.anthropic.com',
      prefix: 'pfx',
      models: [{ name: 'claude-3-5-sonnet' }],
    };
    seedConfigCache([entry]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([entry] as never);

    renderLayout('/ai-providers/claude/0', ':index');

    await waitFor(() => expect(captured?.form.apiKey).toBe('sk-existing'));
    expect(captured?.form.baseUrl).toBe('https://api.anthropic.com');
    expect(captured?.form.prefix).toBe('pfx');
    expect(captured?.hasIndexParam).toBe(true);
    expect(captured?.editIndex).toBe(0);
  });

  it('flags an invalid index param for a non-numeric index', async () => {
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);

    renderLayout('/ai-providers/claude/abc', ':index');

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured?.invalidIndexParam).toBe(true);
    expect(captured?.editIndex).toBeNull();
  });

  it('flags an invalid index when the edit index is out of range', async () => {
    const entry: ProviderKeyConfig = { apiKey: 'sk-1' };
    seedConfigCache([entry]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([entry] as never);

    renderLayout('/ai-providers/claude/5', ':index');

    await waitFor(() => expect(captured?.invalidIndex).toBe(true));
  });

  it('exposes availableModels derived from the trimmed model entry names', async () => {
    const entry: ProviderKeyConfig = {
      apiKey: 'sk-1',
      models: [{ name: 'claude-3-5-sonnet' }, { name: '' }, { name: 'claude-3-5-haiku' }],
    };
    seedConfigCache([entry]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([entry] as never);

    renderLayout('/ai-providers/claude/0', ':index');

    await waitFor(() =>
      expect(captured?.availableModels).toEqual(['claude-3-5-sonnet', 'claude-3-5-haiku'])
    );
  });

  it('disables controls when the connection status is not connected', async () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);

    renderLayout('/ai-providers/claude/new', 'new');

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured?.disableControls).toBe(true);
  });

  it('saves a new Claude config by appending the trimmed payload to the list', async () => {
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);
    renderLayout('/ai-providers/claude/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      apiKey: '  sk-new  ',
      baseUrl: ' https://api.anthropic.com ',
      modelEntries: [{ name: 'claude-3-5-sonnet', alias: '' }],
    }));
    await waitFor(() => expect(captured?.form.apiKey).toBe('  sk-new  '));
    await captured?.handleSave();

    await waitFor(() => expect(saveClaudeConfigs).toHaveBeenCalledTimes(1));
    const [savedList] = saveClaudeConfigs.mock.calls[0];
    expect(savedList).toHaveLength(1);
    expect(savedList[0].apiKey).toBe('sk-new');
    expect(savedList[0].baseUrl).toBe('https://api.anthropic.com');
  });

  it('defaults a model alias to the model name in the save payload', async () => {
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);
    renderLayout('/ai-providers/claude/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({
      ...prev,
      apiKey: 'sk-new',
      modelEntries: [{ name: 'claude-3-5-sonnet', alias: '' }],
    }));
    await waitFor(() => expect(captured?.form.modelEntries[0].name).toBe('claude-3-5-sonnet'));
    await captured?.handleSave();

    await waitFor(() => expect(saveClaudeConfigs).toHaveBeenCalledTimes(1));
    const [savedList] = saveClaudeConfigs.mock.calls[0];
    expect(savedList[0].models).toEqual([
      { name: 'claude-3-5-sonnet', alias: 'claude-3-5-sonnet' },
    ]);
  });

  it('replaces the entry at the edit index when saving an existing config', async () => {
    const entry: ProviderKeyConfig = { apiKey: 'sk-old', baseUrl: 'https://api.anthropic.com' };
    seedConfigCache([entry]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([entry] as never);
    renderLayout('/ai-providers/claude/0', ':index');
    await waitFor(() => expect(captured?.form.apiKey).toBe('sk-old'));

    captured?.setForm((prev) => ({ ...prev, apiKey: 'sk-updated' }));
    await waitFor(() => expect(captured?.form.apiKey).toBe('sk-updated'));
    await captured?.handleSave();

    await waitFor(() => expect(saveClaudeConfigs).toHaveBeenCalledTimes(1));
    const [savedList] = saveClaudeConfigs.mock.calls[0];
    expect(savedList).toHaveLength(1);
    expect(savedList[0].apiKey).toBe('sk-updated');
  });

  it('shows the update-failed notification when saving rejects', async () => {
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);
    saveClaudeConfigs.mockRejectedValueOnce(new Error('save boom'));
    renderLayout('/ai-providers/claude/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({ ...prev, apiKey: 'sk-new' }));
    await waitFor(() => expect(captured?.form.apiKey).toBe('sk-new'));
    await captured?.handleSave();

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith('Update failed: save boom', 'error')
    );
  });

  it('shows the added-success notification after saving a new config', async () => {
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);
    renderLayout('/ai-providers/claude/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({ ...prev, apiKey: 'sk-new' }));
    await waitFor(() => expect(captured?.form.apiKey).toBe('sk-new'));
    await captured?.handleSave();

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        'Claude configuration added successfully',
        'success'
      )
    );
  });

  it('also persists the concurrency draft for the claude provider key on save', async () => {
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);
    renderLayout('/ai-providers/claude/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setForm((prev) => ({ ...prev, apiKey: 'sk-new' }));
    captured?.setConcurrencyLimit('4');
    await waitFor(() => expect(captured?.concurrencyLimit).toBe('4'));
    await waitFor(() => expect(captured?.form.apiKey).toBe('sk-new'));
    await captured?.handleSave();

    await waitFor(() => expect(saveProviderConcurrencyDraft).toHaveBeenCalledTimes(1));
    expect(saveProviderConcurrencyDraft.mock.calls[0][0]).toMatchObject({
      providerKey: 'claude',
      draftLimit: '4',
    });
  });

  it('reports an invalid concurrency limit error for a non-numeric draft', async () => {
    seedConfigCache([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([] as never);
    renderLayout('/ai-providers/claude/new', 'new');
    await waitFor(() => expect(captured?.loading).toBe(false));

    captured?.setConcurrencyLimit('abc');

    await waitFor(() =>
      expect(captured?.concurrencyLimitError).toBe('Enter a non-negative whole number')
    );
  });
});
