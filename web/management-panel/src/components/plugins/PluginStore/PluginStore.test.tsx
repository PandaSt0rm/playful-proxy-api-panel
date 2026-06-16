import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { PluginStore } from './PluginStore';
import { pluginStoreApi } from '@/services/api/pluginStore';
import { useNotificationStore } from '@/stores';
import type {
  PluginInstallResult,
  PluginStoreEntry,
  PluginStoreListResponse,
} from '@/types/pluginStore';

vi.mock('@/services/api/pluginStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/pluginStore')>();
  return {
    ...actual,
    pluginStoreApi: { list: vi.fn(), install: vi.fn() },
  };
});

const mockedList = vi.mocked(pluginStoreApi.list);
const mockedInstall = vi.mocked(pluginStoreApi.install);

const storeEntry = (overrides: Partial<PluginStoreEntry> = {}): PluginStoreEntry => ({
  store_id: 'official:example',
  source_id: 'official',
  source_name: 'Official',
  source_url: 'https://example.com/registry.json',
  id: 'example',
  name: 'Example Plugin',
  description: 'An example plugin',
  author: 'Author',
  version: '1.2.0',
  repository: '',
  logo: '',
  homepage: '',
  license: '',
  tags: ['demo'],
  installed: false,
  installed_version: '',
  path: '',
  configured: false,
  registered: false,
  enabled: false,
  effective_enabled: false,
  update_available: false,
  ...overrides,
});

const storeResponse = (
  plugins: PluginStoreEntry[],
  extra: Partial<PluginStoreListResponse> = {}
): PluginStoreListResponse => ({
  plugins_enabled: true,
  plugins_dir: 'plugins',
  sources: [],
  source_errors: [],
  plugins,
  ...extra,
});

const installResult = (overrides: Partial<PluginInstallResult> = {}): PluginInstallResult => ({
  status: 'installed',
  source_id: 'official',
  source_name: 'Official',
  source_url: 'https://example.com/registry.json',
  id: 'example',
  version: '1.2.0',
  path: 'plugins/example.so',
  plugins_enabled: true,
  restart_required: false,
  ...overrides,
});

beforeEach(() => {
  mockedList.mockReset();
  mockedInstall.mockReset();
  mockedList.mockResolvedValue(storeResponse([storeEntry()]));
  useNotificationStore.setState({ notifications: [] });
});

describe('PluginStore', () => {
  it('renders an available plugin with an install button', async () => {
    renderWithRouter(<PluginStore />);

    expect(await screen.findByText('Example Plugin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
  });

  it('installs a plugin and notifies the parent', async () => {
    mockedInstall.mockResolvedValue(installResult());
    const onChanged = vi.fn();
    const user = userEvent.setup();

    renderWithRouter(<PluginStore onChanged={onChanged} />);
    await user.click(await screen.findByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(mockedInstall).toHaveBeenCalledWith('example', 'official');
    });
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });
    expect(useNotificationStore.getState().notifications.some((n) => n.type === 'success')).toBe(
      true
    );
  });

  it('shows a restart notice when the target plugin is loaded (409)', async () => {
    mockedInstall.mockRejectedValue(
      Object.assign(new Error('loaded'), { status: 409, data: { restart_required: true } })
    );
    const user = userEvent.setup();

    renderWithRouter(<PluginStore />);
    await user.click(await screen.findByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(
        useNotificationStore
          .getState()
          .notifications.some((n) => n.message.toLowerCase().includes('restart'))
      ).toBe(true);
    });
  });

  it('offers an update for installed plugins with a newer version', async () => {
    mockedList.mockResolvedValue(
      storeResponse([
        storeEntry({ installed: true, installed_version: '1.1.0', update_available: true }),
      ])
    );

    renderWithRouter(<PluginStore />);

    expect(await screen.findByRole('button', { name: 'Update' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('shows an installed badge with no action when up to date', async () => {
    mockedList.mockResolvedValue(
      storeResponse([storeEntry({ installed: true, installed_version: '1.2.0' })])
    );

    renderWithRouter(<PluginStore />);

    expect(await screen.findByText('Installed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
  });

  it('filters plugins by search text', async () => {
    mockedList.mockResolvedValue(
      storeResponse([
        storeEntry({ store_id: 'a', id: 'alpha', name: 'Alpha' }),
        storeEntry({ store_id: 'b', id: 'beta', name: 'Beta' }),
      ])
    );
    const user = userEvent.setup();

    renderWithRouter(<PluginStore />);
    await screen.findByText('Alpha');
    await user.type(screen.getByRole('searchbox'), 'beta');

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('surfaces registry source errors', async () => {
    mockedList.mockResolvedValue(
      storeResponse([], {
        source_errors: [
          {
            source_id: 'broken',
            source_name: 'Broken Registry',
            source_url: 'https://broken.example/registry.json',
            message: 'connection refused',
          },
        ],
      })
    );

    renderWithRouter(<PluginStore />);

    expect(await screen.findByText(/Broken Registry: connection refused/)).toBeInTheDocument();
  });

  it('shows an empty state when no plugins are available', async () => {
    mockedList.mockResolvedValue(storeResponse([]));

    renderWithRouter(<PluginStore />);

    expect(await screen.findByText('No plugins available')).toBeInTheDocument();
  });

  it('does not render a logo from an unsafe (non-http) URL', async () => {
    mockedList.mockResolvedValue(storeResponse([storeEntry({ logo: 'javascript:alert(1)' })]));

    renderWithRouter(<PluginStore />);
    await screen.findByText('Example Plugin');

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
