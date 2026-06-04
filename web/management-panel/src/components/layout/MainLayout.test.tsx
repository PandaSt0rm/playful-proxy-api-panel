import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, waitFor, userEvent } from '@/test/utils';
import { MainLayout } from './MainLayout';
import { useAuthStore } from '@/stores/useAuthStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useLanguageStore } from '@/stores/useLanguageStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import i18n from '@/i18n';

// Replace the routed page tree with a lightweight stand-in. MainLayout's
// chrome (sidebar, header, menus) is the unit under test, not routing.
vi.mock('@/components/common/PageTransition', () => ({
  PageTransition: () => <div data-testid="page-content">routed-content</div>,
}));

vi.mock('@/router/MainRoutes', () => ({
  MainRoutes: () => <div>routes</div>,
}));

// triggerHeaderRefresh is a module-singleton side effect; mock it so refresh-all
// resolves deterministically without a registered page handler.
vi.mock('@/hooks/useHeaderRefresh', () => ({
  triggerHeaderRefresh: vi.fn(() => Promise.resolve()),
  useHeaderRefresh: vi.fn(),
}));

const mockedTriggerHeaderRefresh = vi.mocked(triggerHeaderRefresh);

beforeEach(async () => {
  localStorage.clear();

  // Re-pin English; some selection tests change the language store, which would
  // otherwise leak the i18n locale into later tests.
  await i18n.changeLanguage('en');

  useAuthStore.setState({
    isAuthenticated: true,
    apiBase: 'http://localhost:8317',
    managementKey: 'key',
    connectionStatus: 'connected',
    connectionError: null,
  });
  useConfigStore.setState({ config: null, cache: new Map(), loading: false, error: null });
  useLanguageStore.setState({ language: 'en' });
  useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });

  // The store's fetchConfig hits configApi.getConfig on mount; make it inert.
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
  vi.spyOn(useConfigStore.getState(), 'clearCache').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MainLayout sidebar/nav render', () => {
  it('renders the abbreviated brand name in the sidebar', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.getByText('PPAP')).toBeInTheDocument();
  });

  it('renders the Dashboard navigation link', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders the System Info navigation link pointing at /system', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.getByRole('link', { name: 'Management Center Info' })).toHaveAttribute(
      'href',
      '/system'
    );
  });

  it('renders all ten navigation links', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.getAllByRole('link')).toHaveLength(10);
  });

  it('renders the routed page content via the page transition', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });
});

describe('MainLayout refresh-all', () => {
  it('triggers the header refresh and fetches config when clicked', async () => {
    const fetchConfig = vi.spyOn(useConfigStore.getState(), 'fetchConfig');
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Refresh All' }));

    await waitFor(() => {
      expect(mockedTriggerHeaderRefresh).toHaveBeenCalledTimes(1);
    });
    expect(fetchConfig).toHaveBeenCalledWith(undefined, true);
  });

  it('shows a success notification after a successful refresh', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Refresh All' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'Data refreshed successfully'
      );
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('success');
  });

  it('shows an error notification with the failure reason when refresh rejects', async () => {
    mockedTriggerHeaderRefresh.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Refresh All' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(
        'Refresh failed: offline'
      );
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('error');
  });

  it('does not emit a success notification when refresh fails', async () => {
    mockedTriggerHeaderRefresh.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Refresh All' }));

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
    expect(useNotificationStore.getState().notifications[0]?.type).toBe('error');
  });

  it('disables the refresh button while a refresh is in flight', async () => {
    let resolveRefresh: () => void = () => {};
    mockedTriggerHeaderRefresh.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      })
    );
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    const refreshButton = screen.getByRole('button', { name: 'Refresh All' });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(refreshButton).toBeDisabled();
    });

    resolveRefresh();
  });
});

describe('MainLayout language menu', () => {
  it('is closed by default with no menu rendered', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument();
  });

  it('opens the language menu when the language button is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Language' }));

    expect(screen.getByRole('menu', { name: 'Language' })).toBeInTheDocument();
  });

  it('marks the currently active language option as checked', async () => {
    useLanguageStore.setState({ language: 'en' });
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Language' }));

    expect(screen.getByRole('menuitemradio', { name: /English/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('selects a language and closes the menu when an option is clicked', async () => {
    // Stub the implementation so the real i18n locale is not mutated (which
    // would leak Russian strings into other tests); we only assert the call.
    const setLanguage = vi
      .spyOn(useLanguageStore.getState(), 'setLanguage')
      .mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Русский/ }));

    expect(setLanguage).toHaveBeenCalledWith('ru');
    expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument();
  });

  it('closes the language menu when Escape is pressed', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument();
  });

  it('closes the language menu on an outside pointer-down', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(screen.getByText('PPAP'));

    expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument();
  });
});

describe('MainLayout theme menu', () => {
  it('opens the theme menu when the theme button is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Theme' }));

    expect(screen.getByRole('menu', { name: 'Theme' })).toBeInTheDocument();
  });

  it('selects a theme and closes the menu when a theme card is clicked', async () => {
    const setTheme = vi.spyOn(useThemeStore.getState(), 'setTheme').mockImplementation(() => {});
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Theme' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(screen.queryByRole('menu', { name: 'Theme' })).not.toBeInTheDocument();
  });

  it('closes the theme menu when Escape is pressed', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Theme' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu', { name: 'Theme' })).not.toBeInTheDocument();
  });

  it('closes the language menu when the theme menu is opened', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(screen.getByRole('button', { name: 'Theme' }));

    expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'Theme' })).toBeInTheDocument();
  });
});

describe('MainLayout logout', () => {
  it('invokes the auth store logout when the logout button is clicked', async () => {
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
