import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { render, screen, waitFor, userEvent } from '@/test/utils';
import type { ClaudeEditOutletContext } from './AiProvidersClaudeEditLayout';
import type { ProviderFormState } from '@/components/providers/types';
import { AiProvidersClaudeEditPage } from './AiProvidersClaudeEditPage';

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
  useConfigStore: (selector: (state: { config: undefined }) => unknown) =>
    selector({ config: undefined }),
}));

// --- Test harness ---------------------------------------------------------

const buildForm = (overrides: Partial<ProviderFormState> = {}): ProviderFormState => ({
  apiKey: '',
  priority: undefined,
  prefix: '',
  baseUrl: '',
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

const buildContext = (
  overrides: Partial<ClaudeEditOutletContext> = {}
): ClaudeEditOutletContext => ({
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
  testResult: null,
  setTestResult: vi.fn(),
  availableModels: [],
  concurrencyLimit: '',
  setConcurrencyLimit: vi.fn(),
  concurrencyLimitError: undefined,
  handleBack: vi.fn(),
  handleSave: vi.fn(async () => {}),
  mergeDiscoveredModels: vi.fn(),
  ...overrides,
});

const renderPage = (context: ClaudeEditOutletContext) =>
  render(
    <MemoryRouter initialEntries={['/ai-providers/claude/new']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/ai-providers/claude/new" element={<AiProvidersClaudeEditPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

// Stateful harness that lets setForm actually update the controlled form, so
// typed input round-trips through the real onChange handler and re-render.
function StatefulHarness({ initial }: { initial?: Partial<ProviderFormState> }) {
  const [form, setForm] = useState<ProviderFormState>(() => buildForm(initial));
  const context = buildContext({ form, setForm });
  return (
    <MemoryRouter initialEntries={['/ai-providers/claude/new']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/ai-providers/claude/new" element={<AiProvidersClaudeEditPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AiProvidersClaudeEditPage', () => {
  it('shows the add-modal title when no index param is present', () => {
    renderPage(buildContext({ hasIndexParam: false }));

    expect(screen.getByText('Add Claude API Configuration')).toBeInTheDocument();
  });

  it('shows the edit-modal title when an index param is present', () => {
    renderPage(buildContext({ hasIndexParam: true }));

    expect(screen.getByText('Edit Claude API Configuration')).toBeInTheDocument();
  });

  it('renders the invalid-index hint instead of the form when invalidIndexParam is set', () => {
    renderPage(buildContext({ invalidIndexParam: true }));

    expect(screen.getByText('Invalid provider index.')).toBeInTheDocument();
    expect(screen.queryByLabelText('API Key:')).not.toBeInTheDocument();
  });

  it('renders the invalid-index hint when invalidIndex is set', () => {
    renderPage(buildContext({ invalidIndex: true }));

    expect(screen.getByText('Invalid provider index.')).toBeInTheDocument();
  });

  it('seeds the API key input from the form value', () => {
    renderPage(buildContext({ form: buildForm({ apiKey: 'sk-claude-123' }) }));

    expect(screen.getByDisplayValue('sk-claude-123')).toBeInTheDocument();
  });

  it('updates the API key input value as the user types', async () => {
    const user = userEvent.setup();
    render(<StatefulHarness />);

    await user.type(screen.getByLabelText('API Key:'), 'sk-abc');

    expect(screen.getByLabelText('API Key:')).toHaveValue('sk-abc');
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

  it('navigates to the models discovery screen when Fetch via /v1/models is clicked', async () => {
    const user = userEvent.setup();
    renderPage(buildContext());

    await user.click(screen.getByRole('button', { name: 'Fetch via /v1/models' }));

    expect(navigateSpy).toHaveBeenCalledWith('models');
  });

  it('disables the Test button when no models are configured', () => {
    renderPage(
      buildContext({
        form: buildForm({ apiKey: 'sk-1', baseUrl: 'https://api.anthropic.com' }),
        availableModels: [],
      })
    );

    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
  });

  it('reports a key-required error when neither apiKey nor x-api-key header is present', async () => {
    const user = userEvent.setup();
    renderPage(
      buildContext({
        form: buildForm({ apiKey: '', baseUrl: 'https://api.anthropic.com' }),
        testModel: 'claude-3-5-sonnet',
        availableModels: ['claude-3-5-sonnet'],
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test' }));

    expect(apiCallRequest).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith(
      'Please provide a Claude API key or set x-api-key in custom headers',
      'error'
    );
  });

  it('sends a POST to the /v1/messages endpoint with the configured model on a successful test', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(
      buildContext({
        form: buildForm({ apiKey: 'sk-key', baseUrl: 'https://api.anthropic.com' }),
        testModel: 'claude-3-5-sonnet',
        availableModels: ['claude-3-5-sonnet'],
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() => expect(apiCallRequest).toHaveBeenCalledTimes(1));
    const [request] = apiCallRequest.mock.calls[0];
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(request.data)).toEqual({
      model: 'claude-3-5-sonnet',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('sends the api key as the x-api-key header and the default anthropic-version on a test', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(
      buildContext({
        form: buildForm({ apiKey: 'sk-key', baseUrl: 'https://api.anthropic.com' }),
        testModel: 'claude-3-5-sonnet',
        availableModels: ['claude-3-5-sonnet'],
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() => expect(apiCallRequest).toHaveBeenCalledTimes(1));
    const [request] = apiCallRequest.mock.calls[0];
    expect(request.header['x-api-key']).toBe('sk-key');
    expect(request.header['anthropic-version']).toBe('2023-06-01');
  });

  it('shows the success notification when the test returns a 2xx status', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 200, header: {}, bodyText: '', body: null });
    renderPage(
      buildContext({
        form: buildForm({ apiKey: 'sk-key', baseUrl: 'https://api.anthropic.com' }),
        testModel: 'claude-3-5-sonnet',
        availableModels: ['claude-3-5-sonnet'],
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        'Test succeeded. Claude model responded.',
        'success'
      )
    );
  });

  it('shows a failure notification when the test returns a non-2xx status', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockResolvedValue({ statusCode: 401, header: {}, bodyText: '', body: null });
    renderPage(
      buildContext({
        form: buildForm({ apiKey: 'sk-key', baseUrl: 'https://api.anthropic.com' }),
        testModel: 'claude-3-5-sonnet',
        availableModels: ['claude-3-5-sonnet'],
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith('Test failed: api error 401', 'error')
    );
  });

  it('shows the timeout message when the request rejects with ECONNABORTED', async () => {
    const user = userEvent.setup();
    apiCallRequest.mockRejectedValue({ code: 'ECONNABORTED', message: 'aborted' });
    renderPage(
      buildContext({
        form: buildForm({ apiKey: 'sk-key', baseUrl: 'https://api.anthropic.com' }),
        testModel: 'claude-3-5-sonnet',
        availableModels: ['claude-3-5-sonnet'],
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        'Test request timed out after 30 seconds.',
        'error'
      )
    );
  });

  it('stores the full response detail when the connectivity test completes', async () => {
    const user = userEvent.setup();
    const setTestResult = vi.fn();
    const responseBody = { content: [{ type: 'text', text: 'Hi there!' }] };
    apiCallRequest.mockResolvedValue({
      statusCode: 200,
      header: {},
      bodyText: JSON.stringify(responseBody),
      body: responseBody,
    });
    renderPage(
      buildContext({
        form: buildForm({ apiKey: 'sk-key', baseUrl: 'https://api.anthropic.com' }),
        testModel: 'claude-3-5-sonnet',
        availableModels: ['claude-3-5-sonnet'],
        setTestResult,
      })
    );

    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() =>
      expect(setTestResult).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: JSON.stringify(responseBody, null, 2),
          statusCode: 200,
          model: 'claude-3-5-sonnet',
          durationMs: expect.any(Number),
        })
      )
    );
  });

  it('renders the test results box with the full response from the context', () => {
    renderPage(
      buildContext({
        testStatus: 'success',
        testMessage: 'Test succeeded. Claude model responded.',
        testResult: {
          detail: '{\n  "content": "Hi there!"\n}',
          statusCode: 200,
          durationMs: 318,
          model: 'claude-3-5-sonnet',
        },
      })
    );

    expect(screen.getByText('Test Results')).toBeInTheDocument();
    expect(screen.getByText('HTTP 200 · 318 ms · claude-3-5-sonnet')).toBeInTheDocument();
    expect(screen.getByText('Test succeeded. Claude model responded.')).toBeInTheDocument();
    expect(screen.getByText(/"content": "Hi there!"/)).toBeInTheDocument();
  });

  it('falls back to the status badge when no HTTP result is available', () => {
    renderPage(buildContext({ testStatus: 'error', testMessage: 'Please select a model to test' }));

    expect(screen.queryByText('Test Results')).not.toBeInTheDocument();
    expect(screen.getByText('Please select a model to test')).toBeInTheDocument();
  });

  it('renders the cloak mode controls only after cloaking is enabled in the form', () => {
    renderPage(buildContext({ form: buildForm({ cloak: { mode: 'auto' } }) }));

    expect(screen.getByText('Mode:')).toBeInTheDocument();
  });

  it('does not render the cloak mode controls when cloak is undefined', () => {
    renderPage(buildContext({ form: buildForm({ cloak: undefined }) }));

    expect(screen.queryByText('Mode:')).not.toBeInTheDocument();
  });

  it('seeds the excluded-models textarea from the form excludedText', () => {
    renderPage(buildContext({ form: buildForm({ excludedText: 'model-a\nmodel-b' }) }));

    expect(
      screen.getByPlaceholderText('Comma or newline separated, e.g. gemini-1.5-pro, gemini-1.5-flash')
    ).toHaveValue('model-a\nmodel-b');
  });
});
