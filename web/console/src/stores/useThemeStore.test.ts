import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useThemeStore } from './useThemeStore';

/**
 * Installs a deterministic window.matchMedia whose '(prefers-color-scheme: dark)'
 * query reports `prefersDark`. Returns the captured change listeners and the
 * removeEventListener spy so tests can assert listener registration/cleanup and
 * simulate a system theme change.
 */
function installMatchMedia(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const removeEventListener = vi.fn((_event: string, cb: () => void) => {
    listeners.delete(cb);
  });
  const addEventListener = vi.fn((_event: string, cb: () => void) => {
    listeners.add(cb);
  });

  const matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
        media: query,
        onchange: null,
        addEventListener,
        removeEventListener,
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );

  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;

  return { listeners, addEventListener, removeEventListener, matchMedia };
}

const getDataTheme = () => document.documentElement.getAttribute('data-theme');

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useThemeStore.setState({ theme: 'auto', resolvedTheme: 'light' });
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setTheme', () => {
    it('applies data-theme="dark" and resolves to dark for the dark theme', () => {
      useThemeStore.getState().setTheme('dark');

      const { theme, resolvedTheme } = useThemeStore.getState();
      expect(theme).toBe('dark');
      expect(resolvedTheme).toBe('dark');
      expect(getDataTheme()).toBe('dark');
    });

    it('applies data-theme="white" and resolves to light for the white theme', () => {
      useThemeStore.getState().setTheme('white');

      const { theme, resolvedTheme } = useThemeStore.getState();
      expect(theme).toBe('white');
      expect(resolvedTheme).toBe('light');
      expect(getDataTheme()).toBe('white');
    });

    it('removes the data-theme attribute and resolves to light for the light theme', () => {
      document.documentElement.setAttribute('data-theme', 'dark');

      useThemeStore.getState().setTheme('light');

      const { theme, resolvedTheme } = useThemeStore.getState();
      expect(theme).toBe('light');
      expect(resolvedTheme).toBe('light');
      expect(getDataTheme()).toBeNull();
    });

    it('resolves auto to dark and applies data-theme="dark" when the system prefers dark', () => {
      installMatchMedia(true);

      useThemeStore.getState().setTheme('auto');

      const { theme, resolvedTheme } = useThemeStore.getState();
      expect(theme).toBe('auto');
      expect(resolvedTheme).toBe('dark');
      expect(getDataTheme()).toBe('dark');
    });

    it('resolves auto to white-applied/light-resolved when the system prefers light', () => {
      installMatchMedia(false);

      useThemeStore.getState().setTheme('auto');

      const { theme, resolvedTheme } = useThemeStore.getState();
      expect(theme).toBe('auto');
      expect(resolvedTheme).toBe('light');
      expect(getDataTheme()).toBe('white');
    });
  });

  describe('cycleTheme', () => {
    it('advances from light to white', () => {
      useThemeStore.getState().setTheme('light');

      useThemeStore.getState().cycleTheme();

      expect(useThemeStore.getState().theme).toBe('white');
    });

    it('advances from white to dark', () => {
      useThemeStore.getState().setTheme('white');

      useThemeStore.getState().cycleTheme();

      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('advances from dark to auto', () => {
      useThemeStore.getState().setTheme('dark');

      useThemeStore.getState().cycleTheme();

      expect(useThemeStore.getState().theme).toBe('auto');
    });

    it('wraps from auto back to light', () => {
      useThemeStore.getState().setTheme('auto');

      useThemeStore.getState().cycleTheme();

      expect(useThemeStore.getState().theme).toBe('light');
    });
  });

  describe('initializeTheme', () => {
    it('applies the currently selected theme on initialization', () => {
      useThemeStore.setState({ theme: 'dark', resolvedTheme: 'light' });

      useThemeStore.getState().initializeTheme();

      expect(getDataTheme()).toBe('dark');
      expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    });

    it('registers a single change listener on the dark color-scheme media query', () => {
      const { addEventListener } = installMatchMedia(false);

      useThemeStore.getState().initializeTheme();

      expect(addEventListener).toHaveBeenCalledTimes(1);
      expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('removes the change listener when the returned cleanup is invoked', () => {
      const { removeEventListener } = installMatchMedia(false);

      const cleanup = useThemeStore.getState().initializeTheme();
      cleanup();

      expect(removeEventListener).toHaveBeenCalledTimes(1);
      expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('updates resolvedTheme to dark when the system switches to dark while in auto mode', () => {
      const env = installMatchMedia(false);
      useThemeStore.setState({ theme: 'auto', resolvedTheme: 'light' });
      useThemeStore.getState().initializeTheme();

      env.matchMedia.mockImplementation(
        (query: string) =>
          ({
            matches: query === '(prefers-color-scheme: dark)',
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
          }) as unknown as MediaQueryList
      );
      env.listeners.forEach((listener) => listener());

      expect(useThemeStore.getState().resolvedTheme).toBe('dark');
      expect(getDataTheme()).toBe('dark');
    });

    it('ignores system theme changes when the selected theme is not auto', () => {
      const env = installMatchMedia(false);
      useThemeStore.getState().setTheme('light');
      useThemeStore.getState().initializeTheme();

      env.matchMedia.mockImplementation(
        (query: string) =>
          ({
            matches: query === '(prefers-color-scheme: dark)',
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
          }) as unknown as MediaQueryList
      );
      env.listeners.forEach((listener) => listener());

      expect(useThemeStore.getState().resolvedTheme).toBe('light');
      expect(getDataTheme()).toBeNull();
    });

    it('returns a no-op cleanup that does not throw when matchMedia is unavailable', () => {
      // @ts-expect-error deliberately removing matchMedia to exercise the guard
      window.matchMedia = undefined;
      useThemeStore.setState({ theme: 'dark', resolvedTheme: 'light' });

      const cleanup = useThemeStore.getState().initializeTheme();

      expect(getDataTheme()).toBe('dark');
      expect(() => cleanup()).not.toThrow();
    });
  });
});
