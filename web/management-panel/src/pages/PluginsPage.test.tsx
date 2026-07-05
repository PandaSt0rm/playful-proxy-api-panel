import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { PluginsPage } from './PluginsPage';
import { pluginsApi } from '@/services/api/plugins';
import { configFileApi } from '@/services/api/configFile';
import { pluginStoreApi } from '@/services/api/pluginStore';
import { useNotificationStore } from '@/stores';
import type { PluginListEntry, PluginListResponse } from '@/types/plugins';

vi.mock('@/services/api/plugins', () => ({
  pluginsApi: { list: vi.fn(), setEnabled: vi.fn(), putConfig: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/services/api/configFile', () => ({
  configFileApi: { fetchConfigYaml: vi.fn() },
}));
vi.mock('@/services/api/pluginStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/pluginStore')>();
  return {
    ...actual,
    pluginStoreApi: { list: vi.fn(), install: vi.fn() },
  };
});

const mockedList = vi.mocked(pluginsApi.list);
const mockedSetEnabled = vi.mocked(pluginsApi.setEnabled);
const mockedPutConfig = vi.mocked(pluginsApi.putConfig);
const mockedRemove = vi.mocked(pluginsApi.remove);
const mockedFetchConfigYaml = vi.mocked(configFileApi.fetchConfigYaml);
const mockedStoreList = vi.mocked(pluginStoreApi.list);

const entry = (overrides: Partial<PluginListEntry> = {}): PluginListEntry => ({
  id: 'example',
  path: 'plugins/example.so',
  configured: true,
  registered: true,
  enabled: true,
  effective_enabled: true,
  supports_oauth: false,
  oauth_provider: '',
  logo: '',
  config_fields: [],
  menus: [],
  metadata: {
    name: 'Example Plugin',
    version: '1.0.0',
    author: 'Author',
    github_repository: '',
    logo: '',
    config_fields: [],
  },
  ...overrides,
});

const listResponse = (overrides: Partial<PluginListResponse> = {}): PluginListResponse => ({
  plugins_enabled: true,
  plugins_dir: 'plugins',
  plugins: [entry()],
  ...overrides,
});

beforeEach(() => {
  mockedList.mockReset();
  mockedSetEnabled.mockReset();
  mockedPutConfig.mockReset();
  mockedRemove.mockReset();
  mockedFetchConfigYaml.mockReset();
  mockedStoreList.mockReset();
  mockedList.mockResolvedValue(listResponse());
  mockedFetchConfigYaml.mockResolvedValue('plugins:\n  enabled: true\n');
  mockedStoreList.mockResolvedValue({
    plugins_enabled: true,
    plugins_dir: 'plugins',
    sources: [],
    source_errors: [],
    plugins: [],
  });
  useNotificationStore.setState({ notifications: [] });
});

describe('PluginsPage rendering', () => {
  it('renders plugin entries after loading', async () => {
    renderWithRouter(<PluginsPage />);

    expect(await screen.findByText('Example Plugin')).toBeInTheDocument();
    expect(screen.getByText('example')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('shows the global plugin system state', async () => {
    renderWithRouter(<PluginsPage />);

    const badge = await screen.findByTestId('plugins-global-state');
    expect(badge).toHaveTextContent('enabled');
  });

  it('shows OAuth provider names when available', async () => {
    mockedList.mockResolvedValue(
      listResponse({
        plugins: [entry({ supports_oauth: true, oauth_provider: 'anthropic' })],
      })
    );

    renderWithRouter(<PluginsPage />);

    expect(await screen.findByText('OAuth: anthropic')).toBeInTheDocument();
  });

  it('shows an empty state when no plugins exist', async () => {
    mockedList.mockResolvedValue(listResponse({ plugins: [] }));

    renderWithRouter(<PluginsPage />);

    expect(await screen.findByText('No plugins found')).toBeInTheDocument();
  });

  it('shows an error state with retry when loading fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'));

    renderWithRouter(<PluginsPage />);

    expect(await screen.findByText('boom')).toBeInTheDocument();
    mockedList.mockResolvedValue(listResponse());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Example Plugin')).toBeInTheDocument();
  });
});

describe('PluginsPage toggle', () => {
  it('patches the plugin enabled flag', async () => {
    mockedSetEnabled.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithRouter(<PluginsPage />);
    const toggle = await screen.findByRole('checkbox', { name: 'Toggle plugin example' });
    await user.click(toggle);

    await waitFor(() => {
      expect(mockedSetEnabled).toHaveBeenCalledWith('example', false);
    });
    expect(
      useNotificationStore.getState().notifications.some((n) => n.type === 'success')
    ).toBe(true);
  });

  it('reports an error when toggling fails', async () => {
    mockedSetEnabled.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();

    renderWithRouter(<PluginsPage />);
    const toggle = await screen.findByRole('checkbox', { name: 'Toggle plugin example' });
    await user.click(toggle);

    await waitFor(() => {
      expect(
        useNotificationStore.getState().notifications.some((n) => n.type === 'error')
      ).toBe(true);
    });
  });
});

describe('PluginsPage delete', () => {
  it('deletes a plugin after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedRemove.mockResolvedValue({ status: 'deleted', restart_required: false });
    const user = userEvent.setup();

    renderWithRouter(<PluginsPage />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockedRemove).toHaveBeenCalledWith('example');
    });
    expect(useNotificationStore.getState().notifications.some((n) => n.type === 'success')).toBe(
      true
    );
    confirmSpy.mockRestore();
  });

  it('does not delete when confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderWithRouter(<PluginsPage />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(mockedRemove).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows a restart notice when deleting a loaded plugin (409)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedRemove.mockRejectedValue(
      Object.assign(new Error('loaded'), { status: 409, data: { restart_required: true } })
    );
    const user = userEvent.setup();

    renderWithRouter(<PluginsPage />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(
        useNotificationStore.getState().notifications.some((n) =>
          n.message.toLowerCase().includes('restart')
        )
      ).toBe(true);
    });
    confirmSpy.mockRestore();
  });
});

describe('PluginsPage config editor', () => {
  it('saves metadata-declared fields merged over the existing config', async () => {
    mockedList.mockResolvedValue(
      listResponse({
        plugins: [
          entry({
            config_fields: [
              { name: 'mode', type: 'enum', enum_values: ['safe', 'fast'], description: '' },
              { name: 'verbose', type: 'boolean', enum_values: [], description: '' },
            ],
          }),
        ],
      })
    );
    mockedFetchConfigYaml.mockResolvedValue(
      'plugins:\n  enabled: true\n  configs:\n    example:\n      enabled: true\n      priority: 3\n      mode: safe\n      keep-me: kept\n'
    );
    mockedPutConfig.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithRouter(<PluginsPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    expect(await screen.findByText('Configure plugin "example"')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'verbose' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedPutConfig).toHaveBeenCalledWith('example', {
        enabled: true,
        priority: 3,
        mode: 'safe',
        'keep-me': 'kept',
        verbose: true,
      });
    });
  });

  it('rejects non-integer priority values', async () => {
    mockedPutConfig.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithRouter(<PluginsPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    const priority = await screen.findByLabelText('Priority');
    await user.clear(priority);
    await user.type(priority, '1.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        useNotificationStore.getState().notifications.some((n) => n.type === 'error')
      ).toBe(true);
    });
    expect(mockedPutConfig).not.toHaveBeenCalled();
  });
});
