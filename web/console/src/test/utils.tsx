/**
 * Shared test utilities.
 *
 * Usage in a test:
 *   import { renderWithRouter, screen, userEvent } from '@/test/utils';
 *
 * For components that read route params / use navigation, pass `path` so a
 * matching <Route> is mounted:
 *   renderWithRouter(<ProviderEditPage />, { route: '/providers/openai/2', path: '/providers/:type/:index' });
 *
 * i18n is initialized globally in src/test/setup.ts (pinned to English), so no
 * provider wrapper is needed for useTranslation.
 *
 * Mock API/network at the boundary you own (the typed api modules):
 *   vi.mock('@/services/api/config', () => ({ configApi: { getConfig: vi.fn() } }));
 *
 * Zustand stores are module singletons — reset relevant slices in beforeEach,
 * e.g. `useConfigStore.setState({ config: null, cache: new Map() });` and
 * clear persisted storage with `localStorage.clear()`.
 */
import type { ReactElement } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, type RenderOptions } from '@testing-library/react';

interface RouterRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial URL the router starts at. */
  route?: string;
  /** Route pattern to mount `ui` under (enables `useParams`). Defaults to a catch-all. */
  path?: string;
}

export function renderWithRouter(
  ui: ReactElement,
  { route = '/', path, ...options }: RouterRenderOptions = {}
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {path ? (
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      ) : (
        ui
      )}
    </MemoryRouter>,
    options
  );
}

// Re-export RTL surface so tests need a single import.
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
