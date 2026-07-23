import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/utils';
import { DiagnosticsPage } from './DiagnosticsPage';
import { providersApi } from '@/services/api/providers';
import { authFilesApi } from '@/services/api/authFiles';
import { aiproxyApi, type DiagnosticResult } from '@/services/api/aiproxy';

vi.mock('@/services/api/providers', () => ({
  providersApi: {
    getGeminiKeys: vi.fn(),
    getInteractionsConfigs: vi.fn(),
    getClaudeConfigs: vi.fn(),
    getXAIConfigs: vi.fn(),
    getCodexConfigs: vi.fn(),
    getVertexConfigs: vi.fn(),
    getOpenAIProviders: vi.fn(),
  },
}));
vi.mock('@/services/api/authFiles', () => ({ authFilesApi: { list: vi.fn() } }));
vi.mock('@/services/api/aiproxy', () => ({
  aiproxyApi: { diagnostics: vi.fn(), diagnosticHistory: vi.fn() },
}));

const result: DiagnosticResult = {
  id: 'result-1',
  checked_at: '2026-07-23T12:00:00Z',
  target: { kind: 'gemini-api-key', auth_index: 'g1', label: 'Gemini prod' },
  check: 'models',
  status: 'pass',
  latency_ms: 120,
  category: 'ok',
  message: 'Catalog loaded',
  http_status: 200,
  model_count: 2,
  detail: { models: ['gemini-pro', 'gemini-flash'], api_key: 'must-not-render' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(providersApi.getGeminiKeys).mockResolvedValue([
    { apiKey: 'secret', prefix: 'Gemini prod', authIndex: 'g1' },
  ]);
  vi.mocked(providersApi.getInteractionsConfigs).mockResolvedValue([]);
  vi.mocked(providersApi.getClaudeConfigs).mockResolvedValue([]);
  vi.mocked(providersApi.getXAIConfigs).mockResolvedValue([]);
  vi.mocked(providersApi.getCodexConfigs).mockResolvedValue([]);
  vi.mocked(providersApi.getVertexConfigs).mockResolvedValue([]);
  vi.mocked(providersApi.getOpenAIProviders).mockResolvedValue([]);
  vi.mocked(authFilesApi.list).mockResolvedValue({ files: [] });
  vi.mocked(aiproxyApi.diagnosticHistory).mockResolvedValue({ results: [] });
  vi.mocked(aiproxyApi.diagnostics).mockResolvedValue(result);
});

describe('DiagnosticsPage', () => {
  it('loads safe credential choices and runs a catalog check without billable acknowledgement', async () => {
    const user = userEvent.setup();
    renderWithRouter(<DiagnosticsPage />);
    await screen.findAllByText('Gemini prod · g1');

    await user.click(screen.getByRole('button', { name: 'Run diagnostic' }));

    await waitFor(() =>
      expect(aiproxyApi.diagnostics).toHaveBeenCalledWith({
        target: { kind: 'gemini-api-key', auth_index: 'g1' },
        check: 'models',
      })
    );
    expect(await screen.findByText('Catalog loaded')).toBeInTheDocument();
    expect(screen.getByText('gemini-pro')).toBeInTheDocument();
    expect(screen.getByText(/\[redacted\]/)).toBeInTheDocument();
    expect(screen.queryByText('must-not-render')).not.toBeInTheDocument();
  });

  it('cancels a connectivity check without sending a request', async () => {
    const user = userEvent.setup();
    renderWithRouter(<DiagnosticsPage />);
    await screen.findAllByText('Gemini prod · g1');
    await user.click(screen.getByRole('radio', { name: /Connectivity/ }));

    await user.click(screen.getByRole('button', { name: 'Run diagnostic' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(aiproxyApi.diagnostics).not.toHaveBeenCalled();
  });

  it('requires fresh confirmation and sends billable acknowledgement for connectivity', async () => {
    const user = userEvent.setup();
    renderWithRouter(<DiagnosticsPage />);
    await screen.findAllByText('Gemini prod · g1');
    await user.click(screen.getByRole('radio', { name: /Connectivity/ }));
    await user.click(screen.getByRole('button', { name: 'Run diagnostic' }));

    expect(screen.getByText(/one-token provider request/)).toHaveTextContent('Gemini prod · g1');
    await user.click(screen.getByRole('button', { name: 'Run connectivity check' }));

    await waitFor(() =>
      expect(aiproxyApi.diagnostics).toHaveBeenCalledWith({
        target: { kind: 'gemini-api-key', auth_index: 'g1' },
        check: 'connectivity',
        acknowledge_billable: true,
      })
    );
  });

  it('loads bounded target history and selects a previous result', async () => {
    vi.mocked(aiproxyApi.diagnosticHistory).mockResolvedValue({ results: [result] });
    renderWithRouter(<DiagnosticsPage />);

    await waitFor(() =>
      expect(aiproxyApi.diagnosticHistory).toHaveBeenCalledWith(
        'kind=gemini-api-key&auth_index=g1&limit=50'
      )
    );
    const historyTime = await screen.findByRole('button', { name: /2026/ });
    await userEvent.setup().click(historyTime);

    expect(screen.getByText('Catalog loaded')).toBeInTheDocument();
  });

  it('keeps a previous result visible when a later run fails', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.diagnosticHistory).mockResolvedValue({ results: [result] });
    renderWithRouter(<DiagnosticsPage />);
    await screen.findByRole('button', { name: /2026/ });
    await user.click(screen.getByRole('button', { name: /2026/ }));
    vi.mocked(aiproxyApi.diagnostics).mockRejectedValue(new Error('timeout'));

    await user.click(screen.getByRole('button', { name: 'Run diagnostic' }));

    expect(await screen.findByText('Previous result')).toBeInTheDocument();
    expect(
      screen.getByText('The diagnostic failed. The last successful result remains below.')
    ).toBeInTheDocument();
  });
  it('reports complete credential failure, retries, and distinguishes partial credential data', async () => {
    const user = userEvent.setup();
    Object.values(providersApi).forEach((loader) =>
      vi.mocked(loader).mockRejectedValue(new Error('offline'))
    );
    vi.mocked(authFilesApi.list).mockRejectedValue(new Error('offline'));
    renderWithRouter(<DiagnosticsPage />);
    expect(await screen.findByText('Credentials are unavailable.')).toBeInTheDocument();
    Object.values(providersApi).forEach((loader) =>
      vi.mocked(loader).mockResolvedValue([] as never)
    );
    vi.mocked(providersApi.getGeminiKeys).mockResolvedValue([{ apiKey: 'x', authIndex: 'g1' }]);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Partial credentials')).toBeInTheDocument();
  });

  it('shows setup destinations for empty provider and auth-file kinds', async () => {
    const user = userEvent.setup();
    Object.values(providersApi).forEach((loader) =>
      vi.mocked(loader).mockResolvedValue([] as never)
    );
    renderWithRouter(<DiagnosticsPage />);
    expect(await screen.findByRole('link', { name: 'Open setup' })).toHaveAttribute(
      'href',
      '/ai-providers'
    );
    await user.click(screen.getByRole('button', { name: 'Provider kind' }));
    await user.click(screen.getByRole('option', { name: 'Auth file' }));
    expect(screen.getByRole('link', { name: 'Open setup' })).toHaveAttribute('href', '/auth-files');
  });

  it('reports history failure, retries, and accepts an absent results array', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.diagnosticHistory)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({} as never)
      .mockResolvedValue({ results: [] });
    renderWithRouter(<DiagnosticsPage />);
    expect(await screen.findByText('Diagnostic history is unavailable.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Retry' }).at(-1)!);
    expect(await screen.findByText('No diagnostic history')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh history' }));
    expect(aiproxyApi.diagnosticHistory).toHaveBeenCalledTimes(3);
  });

  it('renders zero-model caution, mixed model details, tested model, and model search', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.diagnostics).mockResolvedValue({
      ...result,
      status: 'warn',
      category: '',
      http_status: undefined,
      model_count: 0,
      detail: {
        models: ['visible', 7, 'hidden'],
        tested_model: 'visible',
        nested: [{ access_token: 'secret' }, 'plain'],
      },
    } as DiagnosticResult);
    renderWithRouter(<DiagnosticsPage />);
    await screen.findAllByText('Gemini prod · g1');
    await user.click(screen.getByRole('button', { name: 'Run diagnostic' }));
    expect(await screen.findByText('No models returned')).toBeInTheDocument();
    expect(screen.getAllByText('visible')).toHaveLength(2);
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'hidden');
    expect(screen.getAllByText('visible')).toHaveLength(1);
    expect(screen.getByText('hidden')).toBeInTheDocument();
    expect(screen.getAllByText('—')).not.toHaveLength(0);
  });

  it('renders fail and warning history rows, summary fallbacks, and run-again normalization', async () => {
    const user = userEvent.setup();
    const failed = {
      ...result,
      id: 'failed',
      status: 'fail' as const,
      http_status: undefined,
      model_count: undefined,
      category: 'network',
      target: { ...result.target, kind: 'unknown-kind' },
      check: 'connectivity' as const,
      detail: undefined,
    };
    const warning = {
      ...result,
      id: 'warning',
      status: 'warn' as const,
      http_status: undefined,
      model_count: 0,
      category: '',
      detail: { models: 'invalid' },
    };
    vi.mocked(aiproxyApi.diagnosticHistory).mockResolvedValue({
      results: [failed, warning, result],
    });
    renderWithRouter(<DiagnosticsPage />);
    const reruns = await screen.findAllByRole('button', { name: 'Run again' });
    expect(screen.getByText('network')).toBeInTheDocument();
    await user.click(reruns[0]);
    expect(screen.getByRole('radio', { name: /Connectivity/ })).toBeChecked();
    await user.click(reruns[1]);
    expect(screen.getByRole('radio', { name: /Model catalog/ })).toBeChecked();
  });
  it('shows a run error without inventing a previous result when the first diagnostic fails', async () => {
    const user = userEvent.setup();
    vi.mocked(aiproxyApi.diagnostics).mockRejectedValue(new Error('offline'));
    renderWithRouter(<DiagnosticsPage />);
    await screen.findAllByText('Gemini prod · g1');
    await user.click(screen.getByRole('button', { name: 'Run diagnostic' }));
    expect(
      await screen.findByText('The diagnostic failed. The last successful result remains below.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Previous result')).not.toBeInTheDocument();
  });
});
