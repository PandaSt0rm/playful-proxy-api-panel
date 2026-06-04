import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { render, screen, waitFor, userEvent } from '@/test/utils';
import type { OpenAIEditOutletContext } from './AiProvidersOpenAIEditLayout';
import type { OpenAIFormState } from '@/components/providers/types';
import type { ApiKeyEntry } from '@/types';
import { AiProvidersOpenAIEditPage } from './AiProvidersOpenAIEditPage';

// --- Boundary mocks -------------------------------------------------------

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

const apiCallRequest = vi.fn();
vi.mock('@/services/api', () => ({
  apiCallApi: { request: (...args: unknown[]) => apiCallRequest(...args) },
  getApiCallErrorMessage: (result: { statusCode: number }) => `api error ${result.statusCode}`,
}));

const showNotification = vi.fn();
vi.mock('@/stores', () => ({
  useNotificationStore: () => ({ showNotification }),
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
  baseUrl: '',
  headers: [],
  testModel: undefined,
  disableCooling: undefined,
  modelEntries: [{ name: '', alias: '' }],
  apiKeyEntries: [buildKeyEntry()],
  ...overrides,
});

const buildContext = (
  overrides: Partial<OpenAIEditOutletContext> = {}
): OpenAIEditOutletContext => ({
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
  handleBack: vi.fn(),
  handleSave: vi.fn(async () => {}),
  mergeDiscoveredModels: vi.fn(),
  ...overrides,
});

const renderPage = (context: OpenAIEditOutletContext, route = '/ai-providers/openai/new') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/ai-providers/:mode/new" element={<AiProvidersOpenAIEditPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

// A fully configured context where testing/saving is possible.
const testableContext = (overrides: Partial<OpenAIEditOutletContext> = {}) =>
  buildContext({
    form: buildForm({
      name: 'My Provider',
      baseUrl: 'https://api.example.com/v1',
      modelEntries: [{ name: 'gpt-4o', alias: '' }],
      apiKeyEntries: [buildKeyEntry({ apiKey: 'sk-key-1' })],
    }),
    testModel: 'gpt-4o',
    availableModels: ['gpt-4o'],
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvidersOpenAIEditPage', () => {
  it('shows the OpenAI add-modal title when no index param is present', () => {
    renderPage(buildContext({ providerMode: 'openai', hasIndexParam: false }));

    expect(screen.getByText('Add OpenAI Compatible Provider')).toBeInTheDocument();
  });

  it('shows the OpenAI edit-modal title when an index param is present', () => {
    renderPage(buildContext({ providerMode: 'openai', hasIndexParam: true }));

    expect(screen.getByText('Edit OpenAI Compatible Provider')).toBeInTheDocument();
  });

  it('shows the Z.AI add-modal title when provider mode is zai', () => {
    renderPage(buildContext({ providerMode: 'zai', hasIndexParam: false }));

    expect(screen.getByText('Add Z.AI Provider')).toBeInTheDocument();
  });

  it('renders the invalid-index hint instead of the form when invalidIndexParam is set', () => {
    renderPage(buildContext({ invalidIndexParam: true }));

    expect(screen.getByText('Invalid provider index.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Provider Name:')).not.toBeInTheDocument();
  });

  it('seeds the provider name input from the form value', () => {
    renderPage(buildContext({ form: buildForm({ name: 'Acme OpenAI' }) }));

    expect(screen.getByDisplayValue('Acme OpenAI')).toBeInTheDocument();
  });

  it('reports the configured key count in the toolbar', () => {
    renderPage(
      buildContext({
        form: buildForm({
          apiKeyEntries: [buildKeyEntry({ apiKey: 'a' }), buildKeyEntry({ apiKey: 'b' })],
        }),
      })
    );

    expect(screen.getByText('Keys Count: 2')).toBeInTheDocument();
  });

  it('invokes handleSave when the Save button is clicked', async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn(async () => {});
    renderPage(buildContext({ handleSave }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(handleSave).toHaveBeenCalledTimes(1);
  });

  it('disables Save when controls are disabled (not connected)', () => {
    renderPage(buildContext({ disableControls: true }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables Save when a concurrency limit error is present', () => {
    renderPage(buildContext({ concurrencyLimitError: 'Enter a non-negative whole number' }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('enables Save on a connected, valid, non-loading editor', () => {
    renderPage(buildContext());

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('navigates to the models screen when fetch is clicked with a base URL', async () => {
    const user = userEvent.setup();
    renderPage(buildContext({ form: buildForm({ baseUrl: 'https://api.example.com' }) }));

    await user.click(screen.getByRole('button', { name: 'Fetch via /models' }));

    expect(navigateSpy).toHaveBeenCalledWith('models');
  });

  it('shows an invalid-url error and does not navigate when fetch is clicked without a base URL', async () => {
    const user = userEvent.setup();
    renderPage(buildContext({ form: buildForm({ baseUrl: '' }) }));

    await user.click(screen.getByRole('button', { name: 'Fetch via /models' }));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith('Please enter a valid Base URL first', 'error');
  });

  it('disables Test All Keys when no models are configured', () => {
    renderPage(
      buildContext({
        form: buildForm({
          baseUrl: 'https://api.example.com/v1',
          modelEntries: [{ name: '', alias: '' }],
          apiKeyEntries: [buildKeyEntry({ apiKey: 'sk-key-1' })],
        }),
        availableModels: [],
      })
    );

    expect(screen.getByRole('button', { name: 'Test All Keys' })).toBeDisabled();
  });

  it('disables Test All Keys when no testable api key is present', () => {
    renderPage(
      buildContext({
        form: buildForm({
          baseUrl: 'https://api.example.com/v1',
          modelEntries: [{ name: 'gpt-4o', alias: '' }],
          apiKeyEntries: [buildKeyEntry({ apiKey: '' })],
        }),
        testModel: 'gpt-4o',
        availableModels: ['gpt-4o'],
      })
    );

    expect(screen.getByRole('button', { name: 'Test All Keys' })).toBeDisabled();
  });

  it('sends one POST per valid key to the chat/completions endpoint on Test All Keys', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(testableContext());

    await user.click(screen.getByRole('button', { name: 'Test All Keys' }));

    await waitFor(() => expect(apiCallRequest).toHaveBeenCalledTimes(1));
    const [request] = apiCallRequest.mock.calls[0];
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.example.com/v1/chat/completions');
  });

  it('builds the chat-completion request body with the test model and 5 max_tokens', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(testableContext());

    await user.click(screen.getByRole('button', { name: 'Test All Keys' }));

    await waitFor(() => expect(apiCallRequest).toHaveBeenCalledTimes(1));
    const [request] = apiCallRequest.mock.calls[0];
    expect(JSON.parse(request.data)).toEqual({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
      max_tokens: 5,
    });
  });

  it('sets the Authorization header from the api key when no custom auth header exists', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(testableContext());

    await user.click(screen.getByRole('button', { name: 'Test All Keys' }));

    await waitFor(() => expect(apiCallRequest).toHaveBeenCalledTimes(1));
    const [request] = apiCallRequest.mock.calls[0];
    expect(request.header.Authorization).toBe('Bearer sk-key-1');
  });

  it('forwards the entry authIndex to the api call when set', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(
      testableContext({
        form: buildForm({
          name: 'My Provider',
          baseUrl: 'https://api.example.com/v1',
          modelEntries: [{ name: 'gpt-4o', alias: '' }],
          apiKeyEntries: [buildKeyEntry({ apiKey: 'sk-key-1', authIndex: '7' })],
        }),
        testModel: 'gpt-4o',
        availableModels: ['gpt-4o'],
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test All Keys' }));

    await waitFor(() => expect(apiCallRequest).toHaveBeenCalledTimes(1));
    const [request] = apiCallRequest.mock.calls[0];
    expect(request.authIndex).toBe('7');
  });

  it('shows the all-keys-passed notification when every key test succeeds', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(testableContext());

    await user.click(screen.getByRole('button', { name: 'Test All Keys' }));

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith('All 1 keys passed the test', 'success')
    );
  });

  it('shows the all-keys-failed notification when every key test fails', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 500, header: {}, bodyText: '', body: null });
    renderPage(testableContext());

    await user.click(screen.getByRole('button', { name: 'Test All Keys' }));

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith('All 1 keys failed the test', 'error')
    );
  });

  it('runs a single-key test and sends exactly one request when the per-row Test is clicked', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(testableContext());

    await user.click(screen.getByRole('button', { name: 'Test', exact: true }));

    await waitFor(() => expect(apiCallRequest).toHaveBeenCalledTimes(1));
    const [request] = apiCallRequest.mock.calls[0];
    expect(request.url).toBe('https://api.example.com/v1/chat/completions');
  });

  it('disables the per-row Test button when the row has no api key', () => {
    renderPage(
      buildContext({
        form: buildForm({
          baseUrl: 'https://api.example.com/v1',
          modelEntries: [{ name: 'gpt-4o', alias: '' }],
          apiKeyEntries: [buildKeyEntry({ apiKey: '' })],
        }),
        availableModels: ['gpt-4o'],
      })
    );

    expect(screen.getByRole('button', { name: 'Test', exact: true })).toBeDisabled();
  });

  it('renders the test message status badge text from the context', () => {
    renderPage(buildContext({ testMessage: 'All 3 keys passed the test', testStatus: 'success' }));

    expect(screen.getByText('All 3 keys passed the test')).toBeInTheDocument();
  });

  it('disables the per-row delete button when only one key entry exists', () => {
    renderPage(buildContext({ form: buildForm({ apiKeyEntries: [buildKeyEntry({ apiKey: 'a' })] }) }));

    // The key-row delete button carries the visible "Delete" text; the model
    // remove control is an icon-only button (aria-label only, empty text).
    const keyRowDelete = screen
      .getAllByRole('button', { name: 'Delete' })
      .find((button) => button.textContent === 'Delete');

    expect(keyRowDelete).toBeDisabled();
  });
});
