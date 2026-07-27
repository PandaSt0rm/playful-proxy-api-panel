import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { render, screen, userEvent } from '@/test/utils';
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
  getApiErrorDetail: (err: unknown) => {
    const details = (err as { details?: { detail?: unknown } } | null)?.details;
    return typeof details?.detail === 'string' ? details.detail : '';
  },
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

  it('shows the OpenRouter add-modal title when provider mode is openrouter', () => {
    renderPage(buildContext({ providerMode: 'openrouter', hasIndexParam: false }));

    expect(screen.getByText('Add OpenRouter Provider')).toBeInTheDocument();
  });

  it('shows the Ollama Cloud add-modal title when provider mode is ollama', () => {
    renderPage(buildContext({ providerMode: 'ollama', hasIndexParam: false }));

    expect(screen.getByText('Add Ollama Cloud Provider')).toBeInTheDocument();
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

  it('offers the debug bench in place of the old connection test', async () => {
    const user = userEvent.setup();
    renderPage(testableContext());

    // The single-prompt "Test All Keys" control is gone; its slot is the bench entry.
    expect(screen.queryByRole('button', { name: /Test All Keys/ })).not.toBeInTheDocument();
    expect(screen.getByText('Provider debug')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Debug' }));
    expect(screen.getByRole('dialog', { name: /Provider debug/ })).toBeInTheDocument();
  });

  it('keeps the persisted default debug model selectable', () => {
    // testModel round-trips to the `test-model` config key and is shown in the provider
    // list, so the picker outlives the connection test it used to belong to.
    renderPage(testableContext());
    expect(screen.getByLabelText('Default debug model')).toBeInTheDocument();
  });

  it('disables the per-row delete button when only one key entry exists', () => {
    renderPage(
      buildContext({ form: buildForm({ apiKeyEntries: [buildKeyEntry({ apiKey: 'a' })] }) })
    );

    // The key-row delete button carries the visible "Delete" text; the model
    // remove control is an icon-only button (aria-label only, empty text).
    const keyRowDelete = screen
      .getAllByRole('button', { name: 'Delete' })
      .find((button) => button.textContent === 'Delete');

    expect(keyRowDelete).toBeDisabled();
  });

  it('opens the effort payloads editor and applies the GLM preset to the model entry', async () => {
    const user = userEvent.setup();
    const setForm = vi.fn();
    const context = buildContext({
      form: buildForm({ modelEntries: [{ name: 'glm-4.6', alias: '' }] }),
      setForm,
    });
    renderPage(context);

    await user.click(screen.getByRole('button', { name: 'effort payloads' }));
    await user.click(screen.getByRole('button', { name: 'GLM thinking.type' }));

    const updater = setForm.mock.calls.at(-1)?.[0] as (prev: OpenAIFormState) => OpenAIFormState;
    expect(typeof updater).toBe('function');
    const next = updater(context.form);
    expect(next.modelEntries[0].thinkingPayloads).toEqual({
      none: { thinking: { type: 'disabled' } },
      high: { thinking: { type: 'enabled' } },
    });
  });

  it('shows the active label count on the toggle and seeds the JSON view from the entry', async () => {
    const user = userEvent.setup();
    const context = buildContext({
      form: buildForm({
        modelEntries: [
          {
            name: 'glm-4.6',
            alias: '',
            thinkingPayloads: { high: { thinking: { type: 'enabled' } } },
          },
        ],
      }),
    });
    renderPage(context);

    const toggle = screen.getByRole('button', { name: 'effort payloads (1)' });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const textarea = screen.getByRole('textbox', { name: 'effort payloads' });
    expect(textarea).toHaveValue(
      JSON.stringify({ high: { thinking: { type: 'enabled' } } }, null, 2)
    );
  });

  it('toggles a reasoning level chip inside the effort payloads panel', async () => {
    const user = userEvent.setup();
    const setForm = vi.fn();
    const context = buildContext({
      form: buildForm({ modelEntries: [{ name: 'glm-4.6', alias: '' }] }),
      setForm,
    });
    renderPage(context);

    await user.click(screen.getByRole('button', { name: 'effort payloads' }));
    await user.click(screen.getByRole('button', { name: 'high' }));

    const updater = setForm.mock.calls.at(-1)?.[0] as (prev: OpenAIFormState) => OpenAIFormState;
    expect(typeof updater).toBe('function');
    const next = updater(context.form);
    expect(next.modelEntries[0].thinkingLevels).toEqual(['high']);
  });

  it('flags invalid payload JSON without updating the entry', async () => {
    const user = userEvent.setup();
    const setForm = vi.fn();
    renderPage(
      buildContext({
        form: buildForm({ modelEntries: [{ name: 'glm-4.6', alias: '' }] }),
        setForm,
      })
    );

    await user.click(screen.getByRole('button', { name: 'effort payloads' }));
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const textarea = screen.getByRole('textbox', { name: 'effort payloads' });
    await user.type(textarea, '{{not json');

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Invalid payloads/)).toBeInTheDocument();
    expect(setForm).not.toHaveBeenCalled();
  });

  it('rejects payload maps with unknown level keys', async () => {
    const user = userEvent.setup();
    const setForm = vi.fn();
    renderPage(
      buildContext({
        form: buildForm({ modelEntries: [{ name: 'glm-4.6', alias: '' }] }),
        setForm,
      })
    );

    await user.click(screen.getByRole('button', { name: 'effort payloads' }));
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const textarea = screen.getByRole('textbox', { name: 'effort payloads' });
    await user.click(textarea);
    await user.paste('{"turbo": {"x": 1}}');

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(setForm).not.toHaveBeenCalled();
  });
});
