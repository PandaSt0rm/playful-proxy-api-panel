import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@/test/utils';
import App from './App';
import { APP_ROUTES, createConsoleRouter } from '@/router/appRouter';
import { useLanguageStore, useThemeStore } from '@/stores';

vi.mock('@/pages/LoginPage', () => ({ LoginPage: () => <div>Login route</div> }));
vi.mock('@/components/layout/MainLayout', () => ({
  MainLayout: () => <div>Authenticated route</div>,
}));
vi.mock('@/components/common/NotificationContainer', () => ({
  NotificationContainer: () => <div>Notifications</div>,
}));
vi.mock('@/components/common/ConfirmationModal', () => ({
  ConfirmationModal: () => <div>Confirmation</div>,
}));
vi.mock('@/router/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  window.location.hash = '#/login';
  useLanguageStore.setState({ language: 'en' });
});

describe('App', () => {
  it('exports authenticated and unauthenticated route boundaries', () => {
    expect(APP_ROUTES[0].children?.map((route) => route.path)).toEqual(['/login', '/*']);
    expect(createConsoleRouter()).toBeDefined();
  });

  it('initializes theme and language while rendering the selected route', () => {
    const cleanup = vi.fn();
    const initializeTheme = vi
      .spyOn(useThemeStore.getState(), 'initializeTheme')
      .mockReturnValue(cleanup);
    const setLanguage = vi
      .spyOn(useLanguageStore.getState(), 'setLanguage')
      .mockImplementation(() => {});

    const view = render(<App />);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Confirmation')).toBeInTheDocument();
    expect(initializeTheme).toHaveBeenCalledTimes(1);
    expect(setLanguage).toHaveBeenCalledWith('en');
    expect(document.documentElement.lang).toBe('en');
    view.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
