import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { render, screen, waitFor, userEvent } from '@/test/utils';
import type { OpenAIEditOutletContext } from './AiProvidersOpenAIEditLayout';
import type { OpenAIFormState } from '@/components/providers/types';
import type { ApiKeyEntry } from '@/types';
import type { ModelInfo } from '@/utils/models';
import { AiProvidersOpenAIModelsPage } from './AiProvidersOpenAIModelsPage';

// --- Boundary mocks -------------------------------------------------------

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const fetchModelsViaApiCall = vi.fn(async () => [] as ModelInfo[]);
vi.mock('@/services/api', () => ({
  modelsApi: {
    fetchModelsViaApiCall: (...args: unknown[]) => fetchModelsViaApiCall(...args),
  },
}));

// --- Test harness ---------------------------------------------------------

const buildKeyEntry = (overrides: Partial<ApiKeyEntry> = {}): ApiKeyEntry => ({
  apiKey: '',
  proxyUrl: '',
  headers: {},
  ...overrides,
});

const buildForm = (overrides: Partial<OpenAIFormState> = {}): OpenAIFormState => ({
  name: '',
  priority: undefined,
  prefix: '',
  baseUrl: 'https://api.example.com/v1',
  headers: [],
  testModel: undefined,
  disableCooling: undefined,
  modelEntries: [{ name: '', alias: '' }],
  apiKeyEntries: [buildKeyEntry({ apiKey: 'sk-1' })],
  ...overrides,
});

const mergeDiscoveredModels = vi.fn();
const handleBack = vi.fn();

const buildContext = (
  overrides: Partial<OpenAIEditOutletContext> = {}
): OpenAIEditOutletContext =>
  ({
    providerMode: 'openai',
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
    keyTestStatuses: [],
    setDraftKeyTestStatus: vi.fn(),
    resetDraftKeyTestStatuses: vi.fn(),
    availableModels: [],
    concurrencyLimit: '',
    setConcurrencyLimit: vi.fn(),
    concurrencyLimitError: undefined,
    handleBack,
    handleSave: vi.fn(async () => {}),
    mergeDiscoveredModels,
    ...overrides,
  }) as OpenAIEditOutletContext;

const renderPage = (context: OpenAIEditOutletContext) =>
  render(
    <MemoryRouter initialEntries={['/ai-providers/openai/new/models']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route
            path="/ai-providers/:mode/new/models"
            element={<AiProvidersOpenAIModelsPage />}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );

const sampleModels: ModelInfo[] = [
  { name: 'gpt-4o', alias: '', description: 'Omni model' },
  { name: 'gpt-4o-mini', alias: '', description: 'Smaller omni model' },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvidersOpenAIModelsPage', () => {
  it('renders the discovery title from i18n', async () => {
    renderPage(buildContext());

    expect(await screen.findByText('Pick Models from /models')).toBeInTheDocument();
  });

  it('shows the /models endpoint built from the base URL', async () => {
    renderPage(buildContext({ form: buildForm({ baseUrl: 'https://api.example.com/v1' }) }));

    await waitFor(() =>
      expect(screen.getByDisplayValue('https://api.example.com/v1/models')).toBeInTheDocument()
    );
  });

  it('auto-fetches models on mount with the base URL and first api key', async () => {
    renderPage(buildContext());

    await waitFor(() => expect(fetchModelsViaApiCall).toHaveBeenCalled());
    expect(fetchModelsViaApiCall.mock.calls[0][0]).toBe('https://api.example.com/v1');
    expect(fetchModelsViaApiCall.mock.calls[0][1]).toBe('sk-1');
  });

  it('renders each discovered model row', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    renderPage(buildContext());

    expect(await screen.findByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
  });

  it('shows the empty hint when the discovery returns no models', async () => {
    fetchModelsViaApiCall.mockResolvedValue([]);
    renderPage(buildContext());

    expect(
      await screen.findByText('No models returned. Please check the endpoint or auth.')
    ).toBeInTheDocument();
  });

  it('filters the visible models by the search term', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('gpt-4o-mini');

    await user.type(screen.getByLabelText('Search models'), 'mini');

    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
  });

  it('shows the no-match hint when the search excludes all models', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('gpt-4o');

    await user.type(screen.getByLabelText('Search models'), 'no-such-model');

    expect(
      screen.getByText('No models match your search. Try a different keyword.')
    ).toBeInTheDocument();
  });

  it('disables Add selected models until at least one model is selected', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    renderPage(buildContext());
    await screen.findByText('gpt-4o');

    expect(screen.getByRole('button', { name: 'Add selected models' })).toBeDisabled();
  });

  it('enables Add selected models after a model is checked', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('gpt-4o');

    await user.click(screen.getByRole('checkbox', { name: 'gpt-4o' }));

    expect(screen.getByRole('button', { name: 'Add selected models' })).toBeEnabled();
  });

  it('applies only the selected models and navigates back when Add is clicked', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('gpt-4o');

    await user.click(screen.getByRole('checkbox', { name: 'gpt-4o-mini' }));
    await user.click(screen.getByRole('button', { name: 'Add selected models' }));

    expect(mergeDiscoveredModels).toHaveBeenCalledWith([
      { name: 'gpt-4o-mini', alias: '', description: 'Smaller omni model' },
    ]);
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it('selects all visible models when Select current list is clicked', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('gpt-4o');

    await user.click(screen.getByRole('button', { name: 'Select current list' }));

    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('clears the selection when Clear selection is clicked', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('gpt-4o');
    await user.click(screen.getByRole('button', { name: 'Select current list' }));

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('re-fetches when the Refresh button is clicked', async () => {
    fetchModelsViaApiCall.mockResolvedValue(sampleModels);
    const user = userEvent.setup();
    renderPage(buildContext());
    await screen.findByText('gpt-4o');
    fetchModelsViaApiCall.mockClear();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchModelsViaApiCall).toHaveBeenCalledTimes(1));
  });

  it('shows the proxy toggle when the first key entry has a proxy URL', async () => {
    renderPage(
      buildContext({
        form: buildForm({ apiKeyEntries: [buildKeyEntry({ apiKey: 'sk-1', proxyUrl: 'http://proxy:8080' })] }),
      })
    );

    expect(await screen.findByText('Use key proxy')).toBeInTheDocument();
  });

  it('hides the proxy toggle when no key entry has a proxy URL', async () => {
    renderPage(buildContext());
    await waitFor(() => expect(fetchModelsViaApiCall).toHaveBeenCalled());

    expect(screen.queryByText('Use key proxy')).not.toBeInTheDocument();
  });
});
