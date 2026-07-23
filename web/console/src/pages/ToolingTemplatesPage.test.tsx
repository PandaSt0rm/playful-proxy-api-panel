import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent, within } from '@/test/utils';
import { ToolingTemplatesPage } from './ToolingTemplatesPage';
import { apiKeysApi } from '@/services/api/apiKeys';
import { modelsApi } from '@/services/api/models';
import { toolingTemplatesApi } from '@/services/api/toolingTemplates';
import { syncApi } from '@/services/api/sync';
import { copyToClipboard } from '@/utils/clipboard';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ModelInfo } from '@/utils/models';
import type {
  ManualConfigBlock,
  RenderedToolTemplate,
  ToolTemplateMetadata,
  ToolingTemplatesRenderResponse,
} from '@/utils/toolingTemplates';

// Mock the typed API boundaries the page (and its embedded SyncProfilesSection)
// own. The page under test, the i18n layer, and pure helpers stay real.
vi.mock('@/services/api/apiKeys', () => ({ apiKeysApi: { list: vi.fn() } }));
vi.mock('@/services/api/models', () => ({ modelsApi: { fetchModels: vi.fn() } }));
vi.mock('@/services/api/toolingTemplates', () => ({
  toolingTemplatesApi: { list: vi.fn(), render: vi.fn() },
}));
vi.mock('@/services/api/sync', () => ({
  syncApi: { getSyncProfiles: vi.fn(), getSyncState: vi.fn() },
}));
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: vi.fn() }));

const mockedApiKeysList = vi.mocked(apiKeysApi.list);
const mockedFetchModels = vi.mocked(modelsApi.fetchModels);
const mockedTemplatesList = vi.mocked(toolingTemplatesApi.list);
const mockedTemplatesRender = vi.mocked(toolingTemplatesApi.render);
const mockedGetSyncProfiles = vi.mocked(syncApi.getSyncProfiles);
const mockedGetSyncState = vi.mocked(syncApi.getSyncState);
const mockedCopy = vi.mocked(copyToClipboard);

const metadata = (overrides: Partial<ToolTemplateMetadata> = {}): ToolTemplateMetadata => ({
  id: 'factory-droid',
  kind: 'config',
  language: 'json',
  multi_model: false,
  ...overrides,
});

const rendered = (overrides: Partial<RenderedToolTemplate> = {}): RenderedToolTemplate => ({
  id: 'factory-droid',
  kind: 'config',
  language: 'json',
  multi_model: false,
  content: '{ "factory": true }',
  ...overrides,
});

const manualBlock = (overrides: Partial<ManualConfigBlock> = {}): ManualConfigBlock => ({
  id: 'openai',
  title_key: 'tooling_templates.manual_config.openai.title',
  markdown: '# OpenAI-Compatible Endpoint\n',
  lines: [
    {
      id: 'base-url',
      label_key: 'tooling_templates.manual_config.openai.base_url',
      value: 'http://localhost:8317/v1',
    },
  ],
  ...overrides,
});

const renderResponse = (
  overrides: Partial<ToolingTemplatesRenderResponse> = {}
): ToolingTemplatesRenderResponse => ({
  templates: [rendered()],
  manual_config: [],
  ...overrides,
});

const models = (...names: string[]): ModelInfo[] => names.map((name) => ({ name }));

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ apiBase: 'http://proxy.test:8317' });
  useNotificationStore.setState({ notifications: [] });

  mockedApiKeysList.mockResolvedValue([]);
  mockedFetchModels.mockResolvedValue([]);
  mockedTemplatesList.mockResolvedValue([metadata()]);
  mockedTemplatesRender.mockResolvedValue(renderResponse());
  mockedGetSyncProfiles.mockResolvedValue([]);
  mockedGetSyncState.mockResolvedValue({ hosts: {} });
  mockedCopy.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToolingTemplatesPage base URL input', () => {
  it('initializes the base URL field from the auth store apiBase', async () => {
    renderWithRouter(<ToolingTemplatesPage />);

    const input = await screen.findByLabelText('Base URL');

    expect(input).toHaveValue('http://proxy.test:8317');
  });

  it('resets a manually edited base URL back to the auth store apiBase', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ToolingTemplatesPage />);
    const input = await screen.findByLabelText('Base URL');

    await user.clear(input);
    await user.type(input, 'http://elsewhere:9000');
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(input).toHaveValue('http://proxy.test:8317');
  });
});

describe('ToolingTemplatesPage API keys', () => {
  it('shows the no-keys hint when the server returns an empty key list', async () => {
    mockedApiKeysList.mockResolvedValue([]);
    renderWithRouter(<ToolingTemplatesPage />);

    const hint = await screen.findByText(/No API keys configured/);

    expect(hint).toBeInTheDocument();
  });

  it('reports the available key count when keys are returned', async () => {
    // NOTE: the en locale ships `api_key_count_plural`, but i18next v25 uses
    // Intl plural categories (`_one`/`_other`), so the legacy `_plural` suffix
    // is never matched and the singular form renders even for count > 1.
    mockedApiKeysList.mockResolvedValue(['key-one', 'key-two']);
    renderWithRouter(<ToolingTemplatesPage />);

    const status = await screen.findByText('2 key available');

    expect(status).toBeInTheDocument();
  });

  it('trims and drops blank keys before counting them', async () => {
    mockedApiKeysList.mockResolvedValue(['  alpha  ', '   ', '']);
    renderWithRouter(<ToolingTemplatesPage />);

    const status = await screen.findByText('1 key available');

    expect(status).toBeInTheDocument();
  });

  it('shows the API keys error message when listing fails', async () => {
    mockedApiKeysList.mockRejectedValue(new Error('keys boom'));
    renderWithRouter(<ToolingTemplatesPage />);

    const error = await screen.findByText('keys boom');

    expect(error).toBeInTheDocument();
  });
});

describe('ToolingTemplatesPage model auto-selection', () => {
  it('auto-selects the first discovered model as a chip on initial load', async () => {
    mockedFetchModels.mockResolvedValue(models('gpt-5', 'gpt-5-mini'));
    renderWithRouter(<ToolingTemplatesPage />);

    const modelsList = await screen.findByRole('list', { name: 'Models' });

    expect(within(modelsList).getByText('gpt-5')).toBeInTheDocument();
  });

  it('marks the first selected model as primary with a filled star', async () => {
    mockedFetchModels.mockResolvedValue(models('gpt-5', 'gpt-5-mini'));
    renderWithRouter(<ToolingTemplatesPage />);
    const modelsList = await screen.findByRole('list', { name: 'Models' });

    const primaryButton = within(modelsList).getByLabelText('Primary model: gpt-5');

    expect(primaryButton).toHaveTextContent('★');
  });

  it('shows the empty-chips hint when no models are discovered', async () => {
    mockedFetchModels.mockResolvedValue([]);
    renderWithRouter(<ToolingTemplatesPage />);

    const hint = await screen.findByText(/No models selected\./);

    expect(hint).toBeInTheDocument();
  });

  it('reports the discovered model count', async () => {
    // Singular phrasing renders even for count = 3 (see plural note above).
    mockedFetchModels.mockResolvedValue(models('gpt-5', 'gpt-5-mini', 'gpt-5-nano'));
    renderWithRouter(<ToolingTemplatesPage />);

    const status = await screen.findByText(/3 model loaded from \/v1\/models/);

    expect(status).toBeInTheDocument();
  });
});

describe('ToolingTemplatesPage manual model entry', () => {
  it('adds a manually typed model as a chip', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText(/No models selected\./);

    const manualInput = screen.getByPlaceholderText(/Type a model id/);
    await user.type(manualInput, 'custom-model');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const modelsList = await screen.findByRole('list', { name: 'Models' });
    expect(within(modelsList).getByText('custom-model')).toBeInTheDocument();
  });

  it('does not add a duplicate model that is already selected', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText(/No models selected\./);
    const manualInput = screen.getByPlaceholderText(/Type a model id/);
    const addButton = screen.getByRole('button', { name: 'Add' });

    await user.type(manualInput, 'dup-model');
    await user.click(addButton);
    await user.type(manualInput, 'dup-model');
    await user.click(addButton);

    const modelsList = await screen.findByRole('list', { name: 'Models' });
    expect(within(modelsList).getAllByText('dup-model')).toHaveLength(1);
  });

  it('disables the Add button when the manual input is only whitespace', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText(/No models selected\./);

    const manualInput = screen.getByPlaceholderText(/Type a model id/);
    await user.type(manualInput, '   ');

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});

describe('ToolingTemplatesPage model chip actions', () => {
  it('promotes a non-primary model to primary when its star is clicked', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('gpt-5'));
    renderWithRouter(<ToolingTemplatesPage />);
    const manualInput = await screen.findByPlaceholderText(/Type a model id/);
    await user.type(manualInput, 'second-model');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await user.click(await screen.findByLabelText('Set second-model as primary'));

    const modelsList = screen.getByRole('list', { name: 'Models' });
    const chips = within(modelsList).getAllByRole('listitem');
    expect(within(chips[0]).getByText('second-model')).toBeInTheDocument();
  });

  it('removes a model chip when its remove button is clicked', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('gpt-5'));
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText('gpt-5');

    await user.click(screen.getByLabelText('Remove gpt-5'));

    expect(await screen.findByText(/No models selected\./)).toBeInTheDocument();
  });

  it('clears all selected models when Clear is clicked', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('gpt-5', 'gpt-5-mini'));
    renderWithRouter(<ToolingTemplatesPage />);
    const manualInput = await screen.findByPlaceholderText(/Type a model id/);
    await user.type(manualInput, 'extra-model');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(await screen.findByText(/No models selected\./)).toBeInTheDocument();
  });

  it('disables Clear when there are no selected models', async () => {
    mockedFetchModels.mockResolvedValue([]);
    renderWithRouter(<ToolingTemplatesPage />);

    await screen.findByText(/No models selected\./);

    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('adds every discovered model when Select all is clicked', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('alpha', 'beta', 'gamma'));
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText('alpha');

    await user.click(screen.getByRole('button', { name: 'Select all' }));

    const modelsList = screen.getByRole('list', { name: 'Models' });
    expect(within(modelsList).getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('ToolingTemplatesPage model picker', () => {
  it('disables the picker trigger when no models are discovered', async () => {
    mockedFetchModels.mockResolvedValue([]);
    renderWithRouter(<ToolingTemplatesPage />);

    const trigger = await screen.findByRole('button', { name: /Add models/ });

    expect(trigger).toBeDisabled();
  });

  it('opens a dialog listing the discovered models when the picker is clicked', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('gpt-5', 'gpt-5-mini'));
    renderWithRouter(<ToolingTemplatesPage />);

    await user.click(await screen.findByRole('button', { name: /Add models/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Pick models' });
    expect(within(dialog).getByText('gpt-5-mini')).toBeInTheDocument();
  });

  it('filters the picker list to the typed search term', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('gpt-5', 'claude-opus'));
    renderWithRouter(<ToolingTemplatesPage />);
    await user.click(await screen.findByRole('button', { name: /Add models/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Pick models' });

    await user.type(within(dialog).getByLabelText('Search models'), 'claude');

    expect(within(dialog).getByText('claude-opus')).toBeInTheDocument();
    expect(within(dialog).queryByText('gpt-5')).not.toBeInTheDocument();
  });

  it('shows the no-match message when the search excludes every model', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('gpt-5'));
    renderWithRouter(<ToolingTemplatesPage />);
    await user.click(await screen.findByRole('button', { name: /Add models/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Pick models' });

    await user.type(within(dialog).getByLabelText('Search models'), 'zzz-nope');

    expect(within(dialog).getByText('No models match your search.')).toBeInTheDocument();
  });
});

describe('ToolingTemplatesPage embed toggle', () => {
  it('disables the embed toggle in placeholder mode when no key is selected', async () => {
    mockedApiKeysList.mockResolvedValue([]);
    renderWithRouter(<ToolingTemplatesPage />);

    const toggle = await screen.findByLabelText('Embed selected key in snippets');

    expect(toggle).toBeDisabled();
  });

  it('enables the embed toggle once a key is auto-selected', async () => {
    mockedApiKeysList.mockResolvedValue(['real-key-value-1234']);
    renderWithRouter(<ToolingTemplatesPage />);

    const toggle = await screen.findByLabelText('Embed selected key in snippets');

    await waitFor(() => expect(toggle).toBeEnabled());
  });
});

describe('ToolingTemplatesPage rendered templates and split error states', () => {
  it('renders the active tab snippet content from the render response', async () => {
    mockedTemplatesRender.mockResolvedValue(
      renderResponse({ templates: [rendered({ content: 'SNIPPET-BODY-XYZ' })] })
    );
    renderWithRouter(<ToolingTemplatesPage />);

    const snippet = await screen.findByText('SNIPPET-BODY-XYZ');

    expect(snippet).toBeInTheDocument();
  });

  it('shows the render error inside the tool snippet block when render() fails', async () => {
    mockedTemplatesRender.mockRejectedValue(new Error('render failed badly'));
    renderWithRouter(<ToolingTemplatesPage />);

    const errors = await screen.findAllByText('render failed badly');

    expect(errors.length).toBeGreaterThan(0);
  });

  it('shows the metadata error when only the template list fails to load', async () => {
    mockedTemplatesList.mockRejectedValue(new Error('list metadata failed'));
    renderWithRouter(<ToolingTemplatesPage />);

    const errors = await screen.findAllByText('list metadata failed');

    expect(errors.length).toBeGreaterThan(0);
  });

  it('renders the manual config block values returned by render()', async () => {
    mockedTemplatesRender.mockResolvedValue(renderResponse({ manual_config: [manualBlock()] }));
    renderWithRouter(<ToolingTemplatesPage />);

    const value = await screen.findByText('http://localhost:8317/v1');

    expect(value.tagName).toBe('CODE');
  });
});

describe('ToolingTemplatesPage copy actions', () => {
  it('notifies success after copying the active snippet succeeds', async () => {
    const user = userEvent.setup();
    mockedCopy.mockResolvedValue(true);
    mockedTemplatesRender.mockResolvedValue(
      renderResponse({ templates: [rendered({ content: 'copyable-snippet' })] })
    );
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText('copyable-snippet');

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    await user.click(copyButtons[copyButtons.length - 1]);

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications.some((n) => n.type === 'success')).toBe(
        true
      )
    );
  });

  it('passes the rendered snippet content to the clipboard helper', async () => {
    const user = userEvent.setup();
    mockedTemplatesRender.mockResolvedValue(
      renderResponse({ templates: [rendered({ content: 'exact-clipboard-payload' })] })
    );
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText('exact-clipboard-payload');

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    await user.click(copyButtons[copyButtons.length - 1]);

    await waitFor(() => expect(mockedCopy).toHaveBeenCalledWith('exact-clipboard-payload'));
  });

  it('copies the manual config block markdown when Copy template is clicked', async () => {
    const user = userEvent.setup();
    mockedTemplatesRender.mockResolvedValue(
      renderResponse({
        manual_config: [manualBlock({ markdown: '# OpenAI-Compatible Endpoint\n\n- `model-x`\n' })],
      })
    );
    renderWithRouter(<ToolingTemplatesPage />);

    const copyButton = await screen.findByRole('button', {
      name: 'Copy OpenAI-compatible markdown template',
    });
    await user.click(copyButton);

    await waitFor(() =>
      expect(mockedCopy).toHaveBeenCalledWith('# OpenAI-Compatible Endpoint\n\n- `model-x`\n')
    );
  });

  it('notifies failure when the clipboard helper reports failure', async () => {
    const user = userEvent.setup();
    mockedCopy.mockResolvedValue(false);
    mockedTemplatesRender.mockResolvedValue(
      renderResponse({ templates: [rendered({ content: 'will-fail-copy' })] })
    );
    renderWithRouter(<ToolingTemplatesPage />);
    await screen.findByText('will-fail-copy');

    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    await user.click(copyButtons[copyButtons.length - 1]);

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications.some((n) => n.type === 'error')).toBe(
        true
      )
    );
  });
});

describe('ToolingTemplatesPage render request payload', () => {
  it('sends placeholder mode and selected models to the render endpoint', async () => {
    const user = userEvent.setup();
    mockedFetchModels.mockResolvedValue(models('gpt-5'));
    renderWithRouter(<ToolingTemplatesPage />);
    const manualInput = await screen.findByPlaceholderText(/Type a model id/);
    await user.type(manualInput, 'second-model');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      const lastCall = mockedTemplatesRender.mock.calls.at(-1)?.[0];
      expect(lastCall?.models).toEqual(['gpt-5', 'second-model']);
    });
    expect(mockedTemplatesRender.mock.calls.at(-1)?.[0].api_key_mode).toBe('placeholder');
  });
});
