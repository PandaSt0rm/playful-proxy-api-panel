/**
 * Behaviour tests for ProtectedRoute.
 *
 * ProtectedRoute reads auth state from the real useAuthStore. The only boundary
 * we control is the store's `checkAuth` action (which would otherwise hit the
 * network through configStore/apiClient); we replace it with a spy via
 * setState. We render the guard inside a small <Routes> harness with a sibling
 * /login route so the redirect is observable through the DOM. The store is a
 * module singleton, so we reset the relevant slices and localStorage in
 * beforeEach to keep tests isolated.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, waitFor } from '@/test/utils';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '@/stores';

const Protected = () => <div>protected content</div>;
const LoginScreen = () => <div>login screen</div>;

function renderGuard(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Protected />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    isAuthenticated: false,
    apiBase: '',
    managementKey: '',
    checkAuth: vi.fn().mockResolvedValue(false),
  });
});

describe('ProtectedRoute', () => {
  it('renders its children when the user is authenticated', () => {
    useAuthStore.setState({ isAuthenticated: true });

    renderGuard();

    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('redirects to /login when the user is not authenticated and has no stored credentials', () => {
    useAuthStore.setState({ isAuthenticated: false, apiBase: '', managementKey: '' });

    renderGuard();

    expect(screen.getByText('login screen')).toBeInTheDocument();
  });

  it('does not render the protected content when unauthenticated', () => {
    useAuthStore.setState({ isAuthenticated: false });

    renderGuard();

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('redirects to /login on first render even with stored credentials and an in-flight check', () => {
    // The component renders <Navigate to="/login"> synchronously on the first
    // render because `checking` starts false; the restore effect that would set
    // `checking` runs only after that commit, so the loading spinner is never
    // reached in normal routing. See the bug note in the agent report.
    const pending = new Promise<boolean>(() => {});
    useAuthStore.setState({
      isAuthenticated: false,
      apiBase: 'http://localhost:8317',
      managementKey: 'secret',
      checkAuth: vi.fn().mockReturnValue(pending),
    });

    renderGuard();

    expect(screen.getByText('login screen')).toBeInTheDocument();
  });

  it('does not show the loading spinner while a credential check is in flight', () => {
    const pending = new Promise<boolean>(() => {});
    useAuthStore.setState({
      isAuthenticated: false,
      apiBase: 'http://localhost:8317',
      managementKey: 'secret',
      checkAuth: vi.fn().mockReturnValue(pending),
    });

    renderGuard();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('calls checkAuth when unauthenticated but stored credentials are present', () => {
    const checkAuth = vi.fn().mockResolvedValue(false);
    useAuthStore.setState({
      isAuthenticated: false,
      apiBase: 'http://localhost:8317',
      managementKey: 'secret',
      checkAuth,
    });

    renderGuard();

    expect(checkAuth).toHaveBeenCalledTimes(1);
  });

  it('does not call checkAuth when no stored credentials are present', () => {
    const checkAuth = vi.fn().mockResolvedValue(false);
    useAuthStore.setState({
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      checkAuth,
    });

    renderGuard();

    expect(checkAuth).not.toHaveBeenCalled();
  });

  it('does not call checkAuth when already authenticated', () => {
    const checkAuth = vi.fn().mockResolvedValue(true);
    useAuthStore.setState({
      isAuthenticated: true,
      apiBase: 'http://localhost:8317',
      managementKey: 'secret',
      checkAuth,
    });

    renderGuard();

    expect(checkAuth).not.toHaveBeenCalled();
  });

  it('stays on /login after a successful credential restore because it already redirected', async () => {
    // checkAuth flips isAuthenticated to true, but the synchronous first-render
    // redirect has already unmounted the guard from the protected route, so the
    // protected content is never shown. This documents the genuine restore bug.
    const checkAuth = vi.fn().mockImplementation(async () => {
      useAuthStore.setState({ isAuthenticated: true });
      return true;
    });
    useAuthStore.setState({
      isAuthenticated: false,
      apiBase: 'http://localhost:8317',
      managementKey: 'secret',
      checkAuth,
    });

    renderGuard();
    await waitFor(() => expect(checkAuth).toHaveBeenCalled());

    expect(screen.getByText('login screen')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('redirects to /login after a failed credential restore', async () => {
    const checkAuth = vi.fn().mockResolvedValue(false);
    useAuthStore.setState({
      isAuthenticated: false,
      apiBase: 'http://localhost:8317',
      managementKey: 'secret',
      checkAuth,
    });

    renderGuard();

    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
  });
});
