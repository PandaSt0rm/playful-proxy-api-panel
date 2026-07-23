import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { ConfigPage } from './ConfigPage';
import { useAuthStore } from '@/stores/useAuthStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { configFileApi } from '@/services/api/configFile';

// Mock the YAML file API boundary so load/save behave deterministically.
vi.mock('@/services/api/configFile', () => ({
  configFileApi: {
    fetchConfigYaml: vi.fn(),
    saveConfigYaml: vi.fn(),
  },
}));

// Replace the heavy visual editor with a stub that surfaces the disabled state
// and lets a test drive a visual change through the page's onChange.
vi.mock('@/components/config/VisualConfigEditor', () => ({
  VisualConfigEditor: ({
    disabled,
    onChange,
  }: {
    disabled: boolean;
    onChange: (patch: { host: string }) => void;
  }) => (
    <div data-testid="visual-editor" data-disabled={String(disabled)}>
      <button type="button" onClick={() => onChange({ host: 'changed-host' })}>
        edit-visual
      </button>
    </div>
  ),
}));

// Replace the lazy CodeMirror editor with a plain textarea wired to onChange.
vi.mock('@/components/config/ConfigSourceEditor', () => ({
  default: ({
    value,
    onChange,
    editable,
  }: {
    value: string;
    onChange: (value: string) => void;
    editable: boolean;
  }) => (
    <textarea
      aria-label="source-editor"
      value={value}
      disabled={!editable}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const mockedFetch = vi.mocked(configFileApi.fetchConfigYaml);
const mockedSave = vi.mocked(configFileApi.saveConfigYaml);

const INITIAL_YAML = 'port: 8317\n';

beforeEach(() => {
  localStorage.clear();
  // Default both tab and auto-save to deterministic values: source tab keeps the
  // real CodeMirror replacement simple; auto-save off keeps save flows explicit.
  localStorage.setItem('config-management:tab', 'source');
  localStorage.setItem('config-management:auto-save', 'off');

  mockedFetch.mockResolvedValue(INITIAL_YAML);
  mockedSave.mockResolvedValue(undefined);

  useAuthStore.setState({ connectionStatus: 'connected', apiBase: 'http://localhost:8317' });
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });

  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
  vi.spyOn(useConfigStore.getState(), 'clearCache').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConfigPage load', () => {
  it('fetches the config yaml on mount', async () => {
    renderWithRouter(<ConfigPage />);

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the loaded status once the fetch resolves', async () => {
    renderWithRouter(<ConfigPage />);

    // Status renders in both the header badge and the floating action bar.
    expect((await screen.findAllByText('Configuration loaded')).length).toBeGreaterThan(0);
  });

  it('renders the fetched yaml into the source editor', async () => {
    renderWithRouter(<ConfigPage />);

    const editor = await screen.findByLabelText<HTMLTextAreaElement>('source-editor');
    expect(editor.value).toBe(INITIAL_YAML);
  });

  it('shows the load error message when the fetch rejects', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('cannot read config'));

    renderWithRouter(<ConfigPage />);

    expect(await screen.findByText('cannot read config')).toBeInTheDocument();
  });

  it('shows the disconnected status when not connected', async () => {
    useAuthStore.setState({ connectionStatus: 'disconnected' });

    renderWithRouter(<ConfigPage />);

    expect(
      (await screen.findAllByText('Connect to the server to load the configuration')).length
    ).toBeGreaterThan(0);
  });
});

describe('ConfigPage editor tab toggle', () => {
  it('renders the source editor when the source tab is active', async () => {
    renderWithRouter(<ConfigPage />);

    expect(await screen.findByLabelText('source-editor')).toBeInTheDocument();
  });

  it('switches to the visual editor when the visual tab is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    await screen.findByLabelText('source-editor');
    await user.click(screen.getByRole('button', { name: 'Visual Editor' }));

    expect(screen.getByTestId('visual-editor')).toBeInTheDocument();
  });

  it('persists the selected tab to localStorage', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    await screen.findByLabelText('source-editor');
    await user.click(screen.getByRole('button', { name: 'Visual Editor' }));

    expect(localStorage.getItem('config-management:tab')).toBe('visual');
  });

  it('disables tab buttons while loading the config', async () => {
    let resolveFetch: (value: string) => void = () => {};
    mockedFetch.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      })
    );

    renderWithRouter(<ConfigPage />);

    expect(screen.getByRole('button', { name: 'Visual Editor' })).toBeDisabled();
    resolveFetch(INITIAL_YAML);
    await screen.findByLabelText('source-editor');
  });
});

describe('ConfigPage dirty status', () => {
  it('marks the status as unsaved after editing the source', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    await user.type(editor, 'x');

    expect((await screen.findAllByText('Unsaved changes')).length).toBeGreaterThan(0);
  });
});

describe('ConfigPage save + diff flow (source mode)', () => {
  it('opens the diff modal when the edited content differs from the server', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    await user.clear(editor);
    await user.type(editor, 'port: 9000');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Review Changes')).toBeInTheDocument();
  });

  it('reports no changes without opening the diff when content equals the server yaml', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    // Make it dirty then revert to the exact server value so Save finds no diff.
    await user.type(editor, 'x');
    await user.clear(editor);
    await user.type(editor, INITIAL_YAML);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe('No changes detected');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves the merged yaml to the server when the diff is confirmed', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    await user.clear(editor);
    await user.type(editor, 'port: 9000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Confirm Save' }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledWith('port: 9000');
    });
  });

  it('shows the success notification after confirming the save', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    await user.clear(editor);
    await user.type(editor, 'port: 9000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Confirm Save' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications.map((n) => n.message)).toContain(
        'Configuration saved successfully'
      );
    });
  });

  it('warns that a restart is required when commercial-mode changes during save', async () => {
    mockedFetch.mockReset();
    // Load with commercial-mode off, then the post-save reload reports it on.
    mockedFetch
      .mockResolvedValueOnce('commercial-mode: false\n')
      .mockResolvedValueOnce('commercial-mode: false\n')
      .mockResolvedValue('commercial-mode: true\n');
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    await user.clear(editor);
    await user.type(editor, 'commercial-mode: true');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Confirm Save' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications.map((n) => n.message)).toContain(
        'Commercial mode setting changed. Please restart the service for it to take effect'
      );
    });
  });
});

describe('ConfigPage reload guard', () => {
  it('reloads immediately without confirmation when there are no unsaved changes', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    await screen.findByLabelText('source-editor');
    mockedFetch.mockClear();
    await user.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
    expect(useNotificationStore.getState().confirmation.isOpen).toBe(false);
  });

  it('opens a danger confirmation before reloading when there are unsaved changes', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    await user.type(editor, 'x');
    await user.click(screen.getByRole('button', { name: 'Reload' }));

    const confirmation = useNotificationStore.getState().confirmation;
    expect(confirmation.isOpen).toBe(true);
    expect(confirmation.options?.variant).toBe('danger');
  });

  it('reloads the config from the server when the reload confirmation is accepted', async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConfigPage />);
    const editor = await screen.findByLabelText('source-editor');
    await user.type(editor, 'x');
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    mockedFetch.mockClear();
    await useNotificationStore.getState().confirmation.options?.onConfirm();

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ConfigPage page header', () => {
  it('renders the config panel title', async () => {
    renderWithRouter(<ConfigPage />);

    expect(await screen.findByRole('heading', { name: 'Config Panel' })).toBeInTheDocument();
  });

  it('shows the source-mode eyebrow description when the source tab is active', async () => {
    renderWithRouter(<ConfigPage />);

    expect(
      await screen.findByText('Edit config.yaml via visual editor or source file')
    ).toBeInTheDocument();
  });
});
