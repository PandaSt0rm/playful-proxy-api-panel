/**
 * Behaviour tests for DashboardPage.
 *
 * The dashboard reads connection/server state, config, and models from the real
 * stores and fetches counts through the typed api modules. We mock the api
 * boundary we own (apiKeysApi / authFilesApi / providersApi) and the models
 * store's fetchModels action (a spy, so no network), and drive the rest through
 * real store state. Time is frozen with a Date-only fake clock so greetings and
 * the formatted date/time are deterministic and the 60s refresh interval never
 * fires during a test.
 *
 * Stat values are read by scoping to the card whose label is unique, since the
 * '-' placeholder appears in several cards.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithRouter, screen, within, waitFor } from '@/test/utils';
import type { Config } from '@/types';

const apiKeysList = vi.fn();
const authFilesList = vi.fn();
const getGeminiKeys = vi.fn();
const getCodexConfigs = vi.fn();
const getClaudeConfigs = vi.fn();
const getOpenAIProviders = vi.fn();

vi.mock('@/services/api', () => ({
  apiKeysApi: { list: () => apiKeysList() },
  authFilesApi: { list: () => authFilesList() },
  providersApi: {
    getGeminiKeys: () => getGeminiKeys(),
    getCodexConfigs: () => getCodexConfigs(),
    getClaudeConfigs: () => getClaudeConfigs(),
    getOpenAIProviders: () => getOpenAIProviders(),
  },
}));

import { DashboardPage } from './DashboardPage';
import { useAuthStore, useConfigStore, useModelsStore } from '@/stores';

const fetchModelsSpy = vi.fn().mockResolvedValue([]);

const cardValue = (label: string): string => {
  const link = screen.getByText(label).closest('a');
  if (!link) throw new Error(`No card link found for label "${label}"`);
  // The value span is the first child of the content block.
  const value = link.querySelector('span');
  return value?.textContent ?? '';
};

const renderDashboard = () => renderWithRouter(<DashboardPage />);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 2026-06-03 14:30 local time -> afternoon greeting.
  vi.setSystemTime(new Date(2026, 5, 3, 14, 30, 0));

  apiKeysList.mockReset().mockResolvedValue([]);
  authFilesList.mockReset().mockResolvedValue({ files: [] });
  getGeminiKeys.mockReset().mockResolvedValue([]);
  getCodexConfigs.mockReset().mockResolvedValue([]);
  getClaudeConfigs.mockReset().mockResolvedValue([]);
  getOpenAIProviders.mockReset().mockResolvedValue([]);

  fetchModelsSpy.mockReset().mockResolvedValue([]);

  useAuthStore.setState({
    connectionStatus: 'disconnected',
    serverVersion: null,
    serverBuildDate: null,
    apiBase: 'http://localhost:8317',
  });
  useConfigStore.setState({ config: null });
  useModelsStore.setState({ models: [], loading: false, fetchModels: fetchModelsSpy });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage greeting', () => {
  it('shows the afternoon greeting at 14:30', () => {
    renderDashboard();

    expect(screen.getByText('Good Afternoon')).toBeInTheDocument();
  });

  it('shows the morning greeting at 08:00', () => {
    vi.setSystemTime(new Date(2026, 5, 3, 8, 0, 0));

    renderDashboard();

    expect(screen.getByText('Good Morning')).toBeInTheDocument();
  });

  it('shows the night greeting at 23:00', () => {
    vi.setSystemTime(new Date(2026, 5, 3, 23, 0, 0));

    renderDashboard();

    expect(screen.getByText('Good Night')).toBeInTheDocument();
  });

  it('renders the welcome heading', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
  });
});

describe('DashboardPage connection pill', () => {
  it('shows the connected label when connected and no server version is known', () => {
    useAuthStore.setState({ connectionStatus: 'connected', serverVersion: null });

    renderDashboard();

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows the disconnected label when disconnected and no server version is known', () => {
    useAuthStore.setState({ connectionStatus: 'disconnected', serverVersion: null });

    renderDashboard();

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders the server version with a single leading v when one is present', () => {
    useAuthStore.setState({ connectionStatus: 'connected', serverVersion: 'v7.1.39' });

    renderDashboard();

    expect(screen.getByText('v7.1.39')).toBeInTheDocument();
  });

  it('strips leading v characters before re-adding a single v', () => {
    useAuthStore.setState({ connectionStatus: 'connected', serverVersion: 'vv2.0.0' });

    renderDashboard();

    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });
});

describe('DashboardPage stats when disconnected', () => {
  it('does not call the api-keys endpoint when disconnected', () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderDashboard();

    expect(apiKeysList).not.toHaveBeenCalled();
  });

  it('shows a placeholder for the management-keys count when disconnected', () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderDashboard();

    expect(cardValue('Management Keys')).toBe('-');
  });
});

describe('DashboardPage stats when connected', () => {
  it('shows the management-keys count from the api-keys list length', async () => {
    useAuthStore.setState({ connectionStatus: 'connected' });
    apiKeysList.mockResolvedValue(['k1', 'k2', 'k3']);

    renderDashboard();

    await waitFor(() => expect(cardValue('Management Keys')).toBe('3'));
  });

  it('shows the auth-files count from the files list length', async () => {
    useAuthStore.setState({ connectionStatus: 'connected' });
    authFilesList.mockResolvedValue({ files: [{ name: 'a' }, { name: 'b' }] });

    renderDashboard();

    await waitFor(() => expect(cardValue('Auth Files')).toBe('2'));
  });

  it('shows the summed provider key total when every provider request resolves', async () => {
    useAuthStore.setState({ connectionStatus: 'connected' });
    getGeminiKeys.mockResolvedValue([{}, {}]); // 2
    getCodexConfigs.mockResolvedValue([{}]); // 1
    getClaudeConfigs.mockResolvedValue([{}, {}, {}]); // 3
    getOpenAIProviders.mockResolvedValue([{}, {}, {}, {}]); // 4

    renderDashboard();

    // 2 + 1 + 3 + 4 = 10
    await waitFor(() => expect(cardValue('AI Providers')).toBe('10'));
  });

  it('shows a placeholder for the provider total when one provider request fails', async () => {
    useAuthStore.setState({ connectionStatus: 'connected' });
    getGeminiKeys.mockResolvedValue([{}, {}]);
    getCodexConfigs.mockResolvedValue([{}]);
    getClaudeConfigs.mockResolvedValue([{}]);
    getOpenAIProviders.mockRejectedValue(new Error('openai down'));

    renderDashboard();

    await waitFor(() => expect(cardValue('AI Providers')).toBe('-'));
  });

  it('shows a placeholder for the management-keys count when the api-keys request fails', async () => {
    useAuthStore.setState({ connectionStatus: 'connected' });
    apiKeysList.mockRejectedValue(new Error('keys down'));

    renderDashboard();

    await waitFor(() => expect(cardValue('Management Keys')).toBe('-'));
  });
});

describe('DashboardPage available models', () => {
  it('shows the number of models from the models store', () => {
    useModelsStore.setState({ models: [{ name: 'a' }, { name: 'b' }], loading: false, fetchModels: fetchModelsSpy });

    renderDashboard();

    expect(cardValue('Available Models')).toBe('2');
  });

  it('shows zero models when the store has none', () => {
    useModelsStore.setState({ models: [], loading: false, fetchModels: fetchModelsSpy });

    renderDashboard();

    expect(cardValue('Available Models')).toBe('0');
  });

  it('shows the loading placeholder while models are loading', () => {
    useModelsStore.setState({ models: [], loading: true, fetchModels: fetchModelsSpy });

    renderDashboard();

    expect(cardValue('Available Models')).toBe('...');
  });
});

describe('DashboardPage config section', () => {
  it('does not render the configuration section when config is null', () => {
    useConfigStore.setState({ config: null });

    renderDashboard();

    expect(screen.queryByText('Current Configuration')).not.toBeInTheDocument();
  });

  it('renders the configuration section when config is present', () => {
    useConfigStore.setState({ config: {} as Config });

    renderDashboard();

    expect(screen.getByText('Current Configuration')).toBeInTheDocument();
  });

  it('maps the round-robin routing strategy to its localized label', () => {
    useConfigStore.setState({ config: { routingStrategy: 'round-robin' } as Config });

    renderDashboard();

    expect(screen.getByText('round-robin (cycle)')).toBeInTheDocument();
  });

  it('maps the fill-first routing strategy to its localized label', () => {
    useConfigStore.setState({ config: { routingStrategy: 'fill-first' } as Config });

    renderDashboard();

    expect(screen.getByText('fill-first (prioritize)')).toBeInTheDocument();
  });

  it('shows an unknown routing strategy value verbatim', () => {
    useConfigStore.setState({ config: { routingStrategy: 'custom-strategy' } as Config });

    renderDashboard();

    expect(screen.getByText('custom-strategy')).toBeInTheDocument();
  });

  it('shows the retry count value from config', () => {
    useConfigStore.setState({ config: { requestRetry: 5 } as Config });

    renderDashboard();

    const pill = screen.getByText('Retry Count:').parentElement;
    expect(within(pill as HTMLElement).getByText('5')).toBeInTheDocument();
  });

  it('shows a zero retry count when request retry is unset', () => {
    useConfigStore.setState({ config: {} as Config });

    renderDashboard();

    const pill = screen.getByText('Retry Count:').parentElement;
    expect(within(pill as HTMLElement).getByText('0')).toBeInTheDocument();
  });

  it('shows the image-generation off label when image generation is disabled', () => {
    useConfigStore.setState({ config: { disableImageGeneration: true } as Config });

    renderDashboard();

    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('shows the image-generation chat-only label when set to chat', () => {
    useConfigStore.setState({ config: { disableImageGeneration: 'chat' } as Config });

    renderDashboard();

    expect(screen.getByText('Chat only')).toBeInTheDocument();
  });

  it('shows the image-generation on label when image generation is not disabled', () => {
    useConfigStore.setState({ config: { disableImageGeneration: false } as Config });

    renderDashboard();

    expect(screen.getByText('On')).toBeInTheDocument();
  });

  it('shows the default concurrency limit when a positive default is configured', () => {
    useConfigStore.setState({ config: { upstreamConcurrency: { default: 8 } } as Config });

    renderDashboard();

    expect(screen.getByText('8 default')).toBeInTheDocument();
  });

  it('shows the override count when no default but provider overrides exist', () => {
    useConfigStore.setState({
      config: { upstreamConcurrency: { providers: { gemini: 2, codex: 3 } } } as Config,
    });

    renderDashboard();

    expect(screen.getByText('2 overrides')).toBeInTheDocument();
  });

  it('shows the unlimited label when concurrency is unconfigured', () => {
    useConfigStore.setState({ config: { upstreamConcurrency: {} } as Config });

    renderDashboard();

    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('renders the proxy url pill only when a proxy url is configured', () => {
    useConfigStore.setState({ config: { proxyUrl: 'http://proxy:9000' } as Config });

    renderDashboard();

    expect(screen.getByText('http://proxy:9000')).toBeInTheDocument();
  });
});
