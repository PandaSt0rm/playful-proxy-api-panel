import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Config } from '@/types';

// --- Boundary mocks -------------------------------------------------------

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const headerRefreshSpy = vi.fn();
vi.mock('@/hooks/useHeaderRefresh', () => ({
  useHeaderRefresh: (handler: () => void) => headerRefreshSpy(handler),
}));

const loadRecentRequests = vi.fn(async () => new Map());
const refreshRecentRequests = vi.fn(async () => new Map());

// Replace each provider section with a lightweight stub that surfaces the
// props the page wires up (loading, the onAdd/onEdit navigation callbacks),
// so we test page behaviour without each section's internals.
type StubSectionProps = {
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (index: number) => void;
};

vi.mock('@/components/providers', () => {
  const makeStub = (testid: string) =>
    function StubSection({ loading, onAdd, onEdit }: StubSectionProps) {
      return (
        <div data-testid={testid} data-loading={String(Boolean(loading))}>
          <button type="button" onClick={onAdd}>
            add-{testid}
          </button>
          <button type="button" onClick={() => onEdit?.(2)}>
            edit-{testid}
          </button>
        </div>
      );
    };

  return {
    GeminiSection: makeStub('gemini-section'),
    CodexSection: makeStub('codex-section'),
    ClaudeSection: makeStub('claude-section'),
    VertexSection: makeStub('vertex-section'),
    AmpcodeSection: makeStub('ampcode-section'),
    ZaiSection: makeStub('zai-section'),
    OpenRouterSection: makeStub('openrouter-section'),
    OpenAISection: makeStub('openai-section'),
    ProviderNav: () => <nav data-testid="provider-nav" />,
    useProviderRecentRequests: () => ({
      usageByProvider: new Map(),
      loadRecentRequests,
      refreshRecentRequests,
    }),
  };
});

const getVertexConfigs = vi.fn(async () => []);
const getAmpcode = vi.fn(async () => undefined);
const getOpenAIProviders = vi.fn(async () => []);

vi.mock('@/services/api', () => ({
  providersApi: {
    getVertexConfigs: (...args: unknown[]) => getVertexConfigs(...args),
    getOpenAIProviders: (...args: unknown[]) => getOpenAIProviders(...args),
  },
  ampcodeApi: {
    getAmpcode: (...args: unknown[]) => getAmpcode(...args),
  },
}));

// usePageTransitionLayer returns null outside a provider -> treated as current.
vi.mock('@/components/common/PageTransitionLayer', () => ({
  usePageTransitionLayer: () => null,
}));

import { AiProvidersPage } from './AiProvidersPage';

const baseConfig: Config = {
  geminiApiKeys: [],
  codexApiKeys: [],
  claudeApiKeys: [],
  vertexApiKeys: [],
  openaiCompatibility: [],
} as unknown as Config;

const seedValidCache = (config: Config) => {
  const now = Date.now();
  const cache = new Map<string, { data: unknown; timestamp: number }>();
  cache.set('__full__', { data: config, timestamp: now });
  useConfigStore.setState({ config, cache });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  useAuthStore.setState({ connectionStatus: 'connected' });
  // Default fetchConfig stub resolves the full config without touching network.
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue(baseConfig as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvidersPage', () => {
  it('renders the page title from i18n', async () => {
    seedValidCache(baseConfig);

    renderWithRouter(<AiProvidersPage />);

    expect(
      await screen.findByRole('heading', { name: 'AI Providers Configuration' })
    ).toBeInTheDocument();
  });

  it('renders every provider section and the provider nav', async () => {
    seedValidCache(baseConfig);

    renderWithRouter(<AiProvidersPage />);

    await waitFor(() => expect(screen.getByTestId('gemini-section')).toBeInTheDocument());
    expect(screen.getByTestId('codex-section')).toBeInTheDocument();
    expect(screen.getByTestId('claude-section')).toBeInTheDocument();
    expect(screen.getByTestId('vertex-section')).toBeInTheDocument();
    expect(screen.getByTestId('ampcode-section')).toBeInTheDocument();
    expect(screen.getByTestId('zai-section')).toBeInTheDocument();
    expect(screen.getByTestId('openrouter-section')).toBeInTheDocument();
    expect(screen.getByTestId('openai-section')).toBeInTheDocument();
    expect(screen.getByTestId('provider-nav')).toBeInTheDocument();
  });

  it('navigates to the openai add route with fromAiProviders state when add is clicked', async () => {
    const user = userEvent.setup();
    seedValidCache(baseConfig);
    renderWithRouter(<AiProvidersPage />);
    await screen.findByTestId('openai-section');

    await user.click(screen.getByRole('button', { name: 'add-openai-section' }));

    expect(navigateSpy).toHaveBeenCalledWith('/ai-providers/openai/new', {
      state: { fromAiProviders: true },
    });
  });

  it('navigates to the claude edit route for the clicked index', async () => {
    const user = userEvent.setup();
    seedValidCache(baseConfig);
    renderWithRouter(<AiProvidersPage />);
    await screen.findByTestId('claude-section');

    await user.click(screen.getByRole('button', { name: 'edit-claude-section' }));

    expect(navigateSpy).toHaveBeenCalledWith('/ai-providers/claude/2', {
      state: { fromAiProviders: true },
    });
  });

  it('navigates to the zai add route from the Z.AI section add button', async () => {
    const user = userEvent.setup();
    seedValidCache(baseConfig);
    renderWithRouter(<AiProvidersPage />);
    await screen.findByTestId('zai-section');

    await user.click(screen.getByRole('button', { name: 'add-zai-section' }));

    expect(navigateSpy).toHaveBeenCalledWith('/ai-providers/zai/new', {
      state: { fromAiProviders: true },
    });
  });

  it('navigates to the openrouter add route from the OpenRouter section add button', async () => {
    const user = userEvent.setup();
    seedValidCache(baseConfig);
    renderWithRouter(<AiProvidersPage />);
    await screen.findByTestId('openrouter-section');

    await user.click(screen.getByRole('button', { name: 'add-openrouter-section' }));

    expect(navigateSpy).toHaveBeenCalledWith('/ai-providers/openrouter/new', {
      state: { fromAiProviders: true },
    });
  });

  it('navigates to the ampcode editor with no index for the ampcode edit button', async () => {
    const user = userEvent.setup();
    seedValidCache(baseConfig);
    renderWithRouter(<AiProvidersPage />);
    await screen.findByTestId('ampcode-section');

    await user.click(screen.getByRole('button', { name: 'edit-ampcode-section' }));

    expect(navigateSpy).toHaveBeenCalledWith('/ai-providers/ampcode', {
      state: { fromAiProviders: true },
    });
  });

  it('registers the recent-requests refresh handler with useHeaderRefresh', async () => {
    seedValidCache(baseConfig);

    renderWithRouter(<AiProvidersPage />);

    await waitFor(() => expect(headerRefreshSpy).toHaveBeenCalled());
    expect(typeof headerRefreshSpy.mock.calls[0][0]).toBe('function');
  });

  it('loads recent requests on mount when the layer is current', async () => {
    seedValidCache(baseConfig);

    renderWithRouter(<AiProvidersPage />);

    await waitFor(() => expect(loadRecentRequests).toHaveBeenCalled());
  });

  it('does not render an error box when loading succeeds', async () => {
    seedValidCache(baseConfig);

    const { container } = renderWithRouter(<AiProvidersPage />);
    await screen.findByTestId('gemini-section');

    expect(container.querySelector('.error-box')).not.toBeInTheDocument();
  });

  it('shows the error box with the failure message when fetchConfig rejects', async () => {
    // No valid cache -> loadConfigs runs and the rejected fetchConfig surfaces.
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockRejectedValue(
      new Error('boom while loading')
    );

    const { container } = renderWithRouter(<AiProvidersPage />);

    await waitFor(() => {
      const errorBox = container.querySelector('.error-box');
      expect(errorBox).toHaveTextContent('boom while loading');
    });
  });

  it('marks sections as loaded (data-loading=false) once the valid cache resolves', async () => {
    seedValidCache(baseConfig);

    renderWithRouter(<AiProvidersPage />);

    await waitFor(() =>
      expect(screen.getByTestId('gemini-section')).toHaveAttribute('data-loading', 'false')
    );
  });

  it('refreshes vertex, ampcode and openai providers from their dedicated endpoints', async () => {
    seedValidCache(baseConfig);

    renderWithRouter(<AiProvidersPage />);

    await waitFor(() => expect(getVertexConfigs).toHaveBeenCalledTimes(1));
    expect(getAmpcode).toHaveBeenCalledTimes(1);
    expect(getOpenAIProviders).toHaveBeenCalledTimes(1);
  });
});
