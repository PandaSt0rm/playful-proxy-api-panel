import { describe, expect, it } from 'vitest';
import {
  CONSOLE_DESTINATIONS,
  CONSOLE_MODULES,
  getConsoleRouteOrder,
  resolveConsoleDestination,
} from './consoleRoutes';
import { mainRoutes } from './mainRouteDefinitions';

function routePaths(routes: typeof mainRoutes): string[] {
  return routes.flatMap((route) => [
    route.path,
    ...('children' in route && route.children
      ? route.children.map((child) => child.path).filter((path): path is string => Boolean(path))
      : []),
  ]);
}

describe('console route registry', () => {
  it('defines the exact destination groups in stable transition order', () => {
    expect(
      CONSOLE_MODULES.map((module) => [
        module.id,
        module.destinations.map((destination) => destination.id),
      ])
    ).toEqual([
      ['monitor', ['overview', 'operations', 'usage', 'quota', 'logs']],
      ['providers', ['ai-providers', 'auth-files', 'oauth', 'diagnostics']],
      ['automate', ['tooling-templates', 'plugins']],
      ['control', ['budgets', 'config', 'changes', 'system']],
    ]);
    expect(CONSOLE_DESTINATIONS.map((destination) => destination.order)).toEqual(
      CONSOLE_DESTINATIONS.map((_, index) => index)
    );
  });

  it('resolves aliases, nested owners, breadcrumbs, and unknown routes', () => {
    expect(resolveConsoleDestination('/dashboard')?.id).toBe('overview');
    expect(resolveConsoleDestination('/settings')?.id).toBe('config');
    expect(resolveConsoleDestination('/api-keys')?.id).toBe('config');
    expect(resolveConsoleDestination('/ai-providers/claude/2/models')?.id).toBe('ai-providers');
    expect(
      resolveConsoleDestination('/ai-providers/claude/2/models')?.breadcrumb?.(
        '/ai-providers/claude/2/models'
      )
    ).toEqual(['routeFoundry.breadcrumb.models']);
    expect(
      resolveConsoleDestination('/auth-files/oauth-excluded')?.breadcrumb?.(
        '/auth-files/oauth-excluded'
      )
    ).toEqual(['routeFoundry.breadcrumb.edit']);
    expect(
      resolveConsoleDestination('/ai-providers/gemini/new')?.breadcrumb?.(
        '/ai-providers/gemini/new'
      )
    ).toEqual(['routeFoundry.breadcrumb.new']);
    expect(resolveConsoleDestination('/ai-providers')?.breadcrumb?.('/ai-providers')).toEqual([]);
    expect(resolveConsoleDestination('/unknown')).toBeNull();
    expect(getConsoleRouteOrder('/unknown')).toBe(-1);
  });

  it('keeps every canonical destination represented in the route-element table', () => {
    const paths = new Set(routePaths(mainRoutes));
    for (const destination of CONSOLE_DESTINATIONS) expect(paths.has(destination.path)).toBe(true);
    expect(paths.has('/onboarding')).toBe(true);
    expect(paths.has('/settings')).toBe(true);
    expect(paths.has('/api-keys')).toBe(true);
    expect(paths.has('*')).toBe(true);
  });
});
