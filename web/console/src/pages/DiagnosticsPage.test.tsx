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
});
