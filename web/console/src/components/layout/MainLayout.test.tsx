import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, renderWithRouter, screen, waitFor, userEvent, within } from '@/test/utils';
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
  PageTransition: ({
    render,
    getRouteOrder,
    getTransitionVariant,
  }: {
    render: (location: never) => ReactNode;
    getRouteOrder: (pathname: string) => number | null;
    getTransitionVariant: (from: string, to: string) => string;
  }) => (
    <div
      data-testid="page-content"
      data-order={getRouteOrder('/') ?? ''}
      data-variant={[
        getTransitionVariant('/', '/operations'),
        getTransitionVariant('/auth-files', '/auth-files/a'),
        getTransitionVariant('/ai-providers/openai', '/ai-providers/openai/models'),
      ].join(',')}
    >
      {render({ pathname: '/', key: 'test' } as never)}
    </div>
  ),
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
type MediaRecord = {
  matches: boolean;
  listeners: Set<() => void>;
};

function installMatchMedia(initial: (query: string) => boolean) {
  const records = new Map<string, MediaRecord>();
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    let record = records.get(query);
    if (!record) {
      record = { matches: initial(query), listeners: new Set() };
      records.set(query, record);
    }
    return {
      media: query,
      get matches() {
        return record!.matches;
      },
      onchange: null,
      addEventListener: (_name: string, listener: () => void) => record!.listeners.add(listener),
      removeEventListener: (_name: string, listener: () => void) =>
        record!.listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as MediaQueryList;
  });
  return {
    set(query: string, matches: boolean) {
      const record = records.get(query);
      if (!record) throw new Error(`Unobserved media query: ${query}`);
      record.matches = matches;
      record.listeners.forEach((listener) => listener());
    },
    records,
  };
}

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

describe('MainLayout route foundry navigation', () => {
  it('renders the AIPROXY mark in the module rail', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.getByRole('img', { name: 'AIPROXY' })).toBeInTheDocument();
  });

  it('renders only the active module destinations', () => {
    renderWithRouter(<MainLayout />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('navigates to a module first destination when its rail button is selected', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MainLayout />);

    await user.click(screen.getByRole('button', { name: 'Control' }));

    expect(screen.getByRole('link', { name: 'Budgets' })).toBeInTheDocument();
  });

  it('renders four module controls', () => {
    renderWithRouter(<MainLayout />);

    expect(
      ['Monitor', 'Providers', 'Automate', 'Control'].map((name) =>
        screen.getByRole('button', { name })
      )
    ).toHaveLength(4);
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
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(mockedTriggerHeaderRefresh).toHaveBeenCalledTimes(1);
    });
    expect(fetchConfig).toHaveBeenCalledWith(undefined, true);
  });

  it('shows a success notification after a successful refresh', async () => {
    const user = userEvent.setup();

    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

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
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

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
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

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
    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
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
    await user.click(screen.getByRole('img', { name: 'AIPROXY' }));

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

describe('MainLayout responsive navigation', () => {
  it('locks and restores the mobile viewport, traps focus, and closes on Escape', async () => {
    installMatchMedia((query) => query === '(max-width: 768px)');
    const user = userEvent.setup();
    renderWithRouter(<MainLayout />);
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(trigger);
    const drawer = document.querySelector<HTMLElement>('#mobile-primary-navigation')!;
    expect(drawer).toBeInTheDocument();
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
    const targets = [
      ...drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ];
    expect(targets[0]).toHaveFocus();
    targets[0].focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(targets.at(-1)).toHaveFocus();
    targets.at(-1)!.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(targets[0]).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(targets[0]).toHaveFocus();
    Object.defineProperty(drawer, 'querySelectorAll', { configurable: true, value: () => [] });
    fireEvent.keyDown(document, { key: 'Tab' });
    await user.keyboard('{Escape}');
    expect(document.querySelector('#mobile-primary-navigation')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });

  it('closes the mobile drawer from its scrim and close button', async () => {
    installMatchMedia((query) => query === '(max-width: 768px)');
    const user = userEvent.setup();
    renderWithRouter(<MainLayout />);
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(trigger);
    const closers = screen.getAllByRole('button', { name: 'Close navigation' });
    await user.click(closers[0]);
    expect(document.querySelector('#mobile-primary-navigation')).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getAllByRole('button', { name: 'Close navigation' }).at(-1)!);
    expect(document.querySelector('#mobile-primary-navigation')).not.toBeInTheDocument();
    await user.click(trigger);
    const drawer = document.querySelector<HTMLElement>('#mobile-primary-navigation')!;
    await user.click(within(drawer).getByRole('link', { name: 'Live Operations' }));
    expect(document.querySelector('#mobile-primary-navigation')).not.toBeInTheDocument();
  });

  it('opens tablet context navigation, closes on Escape and scrim, and follows a destination', async () => {
    installMatchMedia((query) => query.includes('min-width: 769px'));
    const user = userEvent.setup();
    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('button', { name: 'Control' }));
    expect(document.querySelector('#tablet-context-navigation')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(document.querySelector('#tablet-context-navigation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Control' }));
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(document.querySelector('#tablet-context-navigation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Control' }));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(document.querySelector('#tablet-context-navigation')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(document.querySelector('#tablet-context-navigation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Control' }));
    const overlay = document.querySelector<HTMLElement>('#tablet-context-navigation')!;
    await user.click(within(overlay).getByRole('link', { name: 'Budgets' }));
    expect(document.querySelector('#tablet-context-navigation')).not.toBeInTheDocument();
  });

  it('reacts to media-query changes and unregisters both listeners', () => {
    const media = installMatchMedia(() => false);
    const rendered = renderWithRouter(<MainLayout />);
    act(() => media.set('(max-width: 768px)', true));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    rendered.unmount();
    expect([...media.records.values()].every((record) => record.listeners.size === 0)).toBe(true);
  });
});

describe('MainLayout compact utilities and route context', () => {
  it('selects language and theme and logs out through the compact utility menu', async () => {
    const setLanguage = vi
      .spyOn(useLanguageStore.getState(), 'setLanguage')
      .mockImplementation(() => {});
    const setTheme = vi.spyOn(useThemeStore.getState(), 'setTheme').mockImplementation(() => {});
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');
    const user = userEvent.setup();
    renderWithRouter(<MainLayout />);
    const utilities = screen.getByRole('button', { name: 'Utilities' });
    await user.click(utilities);
    await user.click(
      within(screen.getByRole('menu', { name: 'Utilities' })).getByRole('menuitemradio', {
        name: /Русский/,
      })
    );
    expect(setLanguage).toHaveBeenCalledWith('ru');
    await user.click(utilities);
    await user.click(
      within(screen.getByRole('menu', { name: 'Utilities' })).getByRole('menuitemradio', {
        name: 'Dark',
      })
    );
    expect(setTheme).toHaveBeenCalledWith('dark');
    await user.click(utilities);
    await user.click(
      within(screen.getByRole('menu', { name: 'Utilities' })).getByRole('menuitem', {
        name: 'Logout',
      })
    );
    expect(logout).toHaveBeenCalled();
  });

  it('toggles desktop menus closed and closes utilities on an outside event', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MainLayout />);
    const language = screen.getByRole('button', { name: 'Language' });
    await user.click(language);
    await user.click(language);
    expect(screen.queryByRole('menu', { name: 'Language' })).not.toBeInTheDocument();
    const theme = screen.getByRole('button', { name: 'Theme' });
    await user.click(theme);
    await user.click(theme);
    expect(screen.queryByRole('menu', { name: 'Theme' })).not.toBeInTheDocument();
    const utilities = screen.getByRole('button', { name: 'Utilities' });
    await user.click(utilities);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu', { name: 'Utilities' })).not.toBeInTheDocument();
  });

  it('renders readiness, fallback, and nested breadcrumb route labels', () => {
    const readiness = renderWithRouter(<MainLayout />, { route: '/onboarding' });
    expect(screen.getAllByText('Readiness')).not.toHaveLength(0);
    readiness.unmount();
    const fallback = renderWithRouter(<MainLayout />, { route: '/not-a-route' });
    expect(screen.getAllByText('Overview')).not.toHaveLength(0);
    fallback.unmount();
    renderWithRouter(<MainLayout />, { route: '/ai-providers/gemini/new' });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('executes the desktop destination close callback', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MainLayout />);
    await user.click(screen.getByRole('link', { name: 'Live Operations' }));
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });
});

describe('MainLayout refresh failure forms', () => {
  it.each([
    ['plain failure', 'Refresh failed: plain failure'],
    [{ reason: 'opaque' }, 'Refresh failed'],
  ])('formats refresh rejection %#', async (reason, expected) => {
    mockedTriggerHeaderRefresh.mockRejectedValueOnce(reason);
    renderWithRouter(<MainLayout />);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications[0]?.message).toBe(expected)
    );
  });

  it('absorbs an initial config fetch rejection and clears cache during manual refresh', async () => {
    const fetchConfig = vi
      .spyOn(useConfigStore.getState(), 'fetchConfig')
      .mockRejectedValueOnce(new Error('startup'))
      .mockResolvedValue({} as never);
    const clearCache = vi.spyOn(useConfigStore.getState(), 'clearCache');
    renderWithRouter(<MainLayout />);
    await waitFor(() => expect(fetchConfig).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(clearCache).toHaveBeenCalled());
  });
});
