import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { render, screen, waitFor, userEvent } from '@/test/utils';
import type { ClaudeEditOutletContext } from './AiProvidersClaudeEditLayout';
import type { ProviderFormState } from '@/components/providers/types';
import type { ModelInfo } from '@/utils/models';
import { AiProvidersClaudeModelsPage } from './AiProvidersClaudeModelsPage';

// --- Boundary mocks -------------------------------------------------------

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const fetchClaudeModelsViaApiCall = vi.fn(async () => [] as ModelInfo[]);
const buildClaudeModelsEndpoint = vi.fn((baseUrl: string) =>
  baseUrl ? `${baseUrl.replace(/\/+$/, '')}/v1/models` : 'https://api.anthropic.com/v1/models'
);
vi.mock('@/services/api', () => ({
  modelsApi: {
    fetchClaudeModelsViaApiCall: (...args: unknown[]) => fetchClaudeModelsViaApiCall(...args),
    buildClaudeModelsEndpoint: (baseUrl: string) => buildClaudeModelsEndpoint(baseUrl),
  },
}));

// --- Test harness ---------------------------------------------------------

const buildForm = (overrides: Partial<ProviderFormState> = {}): ProviderFormState => ({
  apiKey: 'sk-claude',
  priority: undefined,
  prefix: '',
  baseUrl: 'https://api.anthropic.com',
  proxyUrl: '',
  headers: [],
  models: [],
  excludedModels: [],
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
  disableCooling: undefined,
  experimentalCCHSigning: undefined,
  ...overrides,
});

const mergeDiscoveredModels = vi.fn();
const handleBack = vi.fn();

const buildContext = (overrides: Partial<ClaudeEditOutletContext> = {}): ClaudeEditOutletContext =>
  ({
    hasIndexParam: false,
    editIndex: null,
    invalidIndexParam: false,
    invalidIndex: false,
    disableControls: false,
    loading: false,
    saving: false,
    form: buildForm(),
    setForm: vi.fn(),
    testModel: '',
    setTestModel: vi.fn(),
    testStatus: 'idle',
    setTestStatus: vi.fn(),
    testMessage: '',
    setTestMessage: vi.fn(),
    availableModels: [],
    concurrencyLimit: '',
    setConcurrencyLimit: vi.fn(),
    concurrencyLimitError: undefined,
    handleBack,
    handleSave: vi.fn(async () => {}),
    mergeDiscoveredModels,
    ...overrides,
  }) as ClaudeEditOutletContext;

const renderPage = (context: ClaudeEditOutletContext) =>
  render(
    <MemoryRouter initialEntries={['/ai-providers/claude/new/models']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/ai-providers/claude/new/models" element={<AiProvidersClaudeModelsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

const sampleModels: ModelInfo[] = [
  { name: 'claude-3-5-sonnet', alias: '', description: 'Sonnet' },
  { name: 'claude-3-5-haiku', alias: '', description: 'Haiku' },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvidersClaudeModelsPage', () => {
  it('renders the Claude discovery title from i18n', async () => {
    renderPage(buildContext());

    expect(await screen.findByText('Pick Models from Claude /v1/models')).toBeInTheDocument();
  });

  it('shows the /v1/models endpoint derived from the base URL', async () => {
    renderPage(buildContext({ form: buildForm({ baseUrl: 'https://api.anthropic.com' }) }));

    await waitFor(() =>
      expect(screen.getByDisplayValue('https://api.anthropic.com/v1/models')).toBeInTheDocument()
    );
  });

  it('auto-fetches Claude models on mount when an api key is present', async () => {
    renderPage(buildContext());

    await waitFor(() => expect(fetchClaudeModelsViaApiCall).toHaveBeenCalledTimes(1));
    expect(fetchClaudeModelsViaApiCall.mock.calls[0][0]).toBe('https://api.anthropic.com');
    expect(fetchClaudeModelsViaApiCall.mock.calls[0][1]).toBe('sk-claude');
  });

  it('does not auto-fetch when no api key, x-api-key, or authorization is available', async () => {
    renderPage(buildContext({ form: buildForm({ apiKey: '', headers: [] }) }));

    // Give the effects a chance to run before asserting no call happened.
    await waitFor(() =>
      expect(
        screen.getByText('No models returned. Please check Base URL, API key, or headers.')
      ).toBeInTheDocument()
    );
    expect(fetchClaudeModelsViaApiCall).not.toHaveBeenCalled();
  });

  it('renders each discovered Claude model row', async () => {
    fetchClaudeModelsViaApiCall.mockResolvedValue(sampleModels);
    renderPage(buildContext());

    expect(await screen.findByText('claude-3-5-sonnet')).toBeInTheDocument();
    expect(screen.getByText('claude-3-5-haiku')).toBeInTheDocument();
  });

  it('shows the empty hint when discovery returns no models', async () => {
    fetchClaudeModelsViaApiCall.mockResolvedValue([]);
    renderPage(buildContext());

    expect(
      await screen.findByText('No models returned. Please check Base URL, API key, or headers.')
    ).toBeInTheDocument();
  });

  it('filters the visible models by the search term', async () => {
    fetchClaudeModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('claude-3-5-haiku');

    await user.type(screen.getByLabelText('Search models'), 'haiku');

    expect(screen.queryByText('claude-3-5-sonnet')).not.toBeInTheDocument();
    expect(screen.getByText('claude-3-5-haiku')).toBeInTheDocument();
  });

  it('applies only the selected model and navigates back when Add is clicked', async () => {
    fetchClaudeModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('claude-3-5-sonnet');

    await user.click(screen.getByRole('checkbox', { name: 'claude-3-5-sonnet' }));
    await user.click(screen.getByRole('button', { name: 'Add selected models' }));

    expect(mergeDiscoveredModels).toHaveBeenCalledWith([
      { name: 'claude-3-5-sonnet', alias: '', description: 'Sonnet' },
    ]);
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it('disables Add selected models until a model is selected', async () => {
    fetchClaudeModelsViaApiCall.mockResolvedValue(sampleModels);
    renderPage(buildContext());
    await screen.findByText('claude-3-5-sonnet');

    expect(screen.getByRole('button', { name: 'Add selected models' })).toBeDisabled();
  });

  it('shows the fetch error with a diagnostic suffix on a 401 failure', async () => {
    fetchClaudeModelsViaApiCall.mockRejectedValue(new Error('401 unauthorized'));
    renderPage(buildContext({ form: buildForm({ apiKey: 'sk-claude' }) }));

    await waitFor(() =>
      expect(screen.getByText(/401 unauthorized \[diag: apiKeyField=yes/)).toBeInTheDocument()
    );
  });

  it('shows the proxy toggle when the form has a proxy URL', async () => {
    renderPage(buildContext({ form: buildForm({ proxyUrl: 'http://proxy:8080' }) }));

    expect(await screen.findByText('Use key proxy')).toBeInTheDocument();
  });

  it('hides the proxy toggle when the form has no proxy URL', async () => {
    renderPage(buildContext());
    await waitFor(() => expect(fetchClaudeModelsViaApiCall).toHaveBeenCalled());

    expect(screen.queryByText('Use key proxy')).not.toBeInTheDocument();
  });

  it('re-fetches when the Refresh button is clicked', async () => {
    fetchClaudeModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('claude-3-5-sonnet');
    fetchClaudeModelsViaApiCall.mockClear();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchClaudeModelsViaApiCall).toHaveBeenCalledTimes(1));
  });
});
