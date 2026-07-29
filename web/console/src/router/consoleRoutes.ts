import type { ComponentType } from 'react';
import {
  IconChartLine,
  IconFileText,
  IconKey,
  IconLayoutDashboard,
  IconSettings,
  IconShield,
  IconSidebarAuthFiles,
  IconSidebarConfig,
  IconSidebarLogs,
  IconSidebarOauth,
  IconSidebarPlugins,
  IconSidebarProviders,
  IconSidebarQuota,
  IconSidebarSystem,
  IconSidebarToolingTemplates,
  IconSidebarUsage,
  IconSlidersHorizontal,
  type IconProps,
} from '@/components/ui/icons';

export type ConsoleModuleId = 'monitor' | 'providers' | 'automate' | 'control';

export interface ConsoleDestination {
  id: string;
  module: ConsoleModuleId;
  path: string;
  labelKey: string;
  icon: ComponentType<IconProps>;
  order: number;
  matches(pathname: string): boolean;
  breadcrumb?(pathname: string): string[];
}

export interface ConsoleModule {
  id: ConsoleModuleId;
  labelKey: string;
  icon: ComponentType<IconProps>;
  destinations: readonly ConsoleDestination[];
}

function exactPath(...paths: string[]) {
  const acceptedPaths = new Set(paths);
  return (pathname: string) => acceptedPaths.has(pathname);
}

function pathFamily(path: string) {
  return (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);
}

function editorBreadcrumb(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean);
  const leaf = segments[segments.length - 1];
  if (leaf === 'models') return ['routeFoundry.breadcrumb.models'];
  if (leaf === 'new') return ['routeFoundry.breadcrumb.new'];
  if (segments.length > 1) return ['routeFoundry.breadcrumb.edit'];
  return [];
}

const destinations = [
  {
    id: 'overview',
    module: 'monitor',
    path: '/',
    labelKey: 'routeFoundry.destinations.overview',
    icon: IconLayoutDashboard,
    matches: exactPath('/', '/dashboard'),
  },
  {
    id: 'operations',
    module: 'monitor',
    path: '/operations',
    labelKey: 'routeFoundry.destinations.operations',
    icon: IconChartLine,
    matches: exactPath('/operations'),
  },
  {
    id: 'usage',
    module: 'monitor',
    path: '/usage',
    labelKey: 'routeFoundry.destinations.usage',
    icon: IconSidebarUsage,
    matches: exactPath('/usage'),
  },
  {
    id: 'quota',
    module: 'monitor',
    path: '/quota',
    labelKey: 'routeFoundry.destinations.quota',
    icon: IconSidebarQuota,
    matches: exactPath('/quota'),
  },
  {
    id: 'logs',
    module: 'monitor',
    path: '/logs',
    labelKey: 'routeFoundry.destinations.logs',
    icon: IconSidebarLogs,
    matches: exactPath('/logs'),
  },
  {
    id: 'ai-providers',
    module: 'providers',
    path: '/ai-providers',
    labelKey: 'routeFoundry.destinations.aiProviders',
    icon: IconSidebarProviders,
    matches: pathFamily('/ai-providers'),
    breadcrumb: editorBreadcrumb,
  },
  {
    id: 'auth-files',
    module: 'providers',
    path: '/auth-files',
    labelKey: 'routeFoundry.destinations.authFiles',
    icon: IconSidebarAuthFiles,
    matches: pathFamily('/auth-files'),
    breadcrumb: editorBreadcrumb,
  },
  {
    id: 'oauth',
    module: 'providers',
    path: '/oauth',
    labelKey: 'routeFoundry.destinations.oauth',
    icon: IconSidebarOauth,
    matches: exactPath('/oauth'),
  },
  {
    id: 'tooling-templates',
    module: 'automate',
    path: '/tooling-templates',
    labelKey: 'routeFoundry.destinations.toolingTemplates',
    icon: IconSidebarToolingTemplates,
    matches: exactPath('/tooling-templates'),
  },
  {
    id: 'plugins',
    module: 'automate',
    path: '/plugins',
    labelKey: 'routeFoundry.destinations.plugins',
    icon: IconSidebarPlugins,
    matches: exactPath('/plugins'),
  },
  {
    id: 'budgets',
    module: 'control',
    path: '/budgets',
    labelKey: 'routeFoundry.destinations.budgets',
    icon: IconKey,
    matches: exactPath('/budgets'),
  },
  {
    id: 'config',
    module: 'control',
    path: '/config',
    labelKey: 'routeFoundry.destinations.config',
    icon: IconSidebarConfig,
    matches: exactPath('/config', '/settings', '/api-keys'),
  },
  {
    id: 'changes',
    module: 'control',
    path: '/changes',
    labelKey: 'routeFoundry.destinations.changes',
    icon: IconFileText,
    matches: exactPath('/changes'),
  },
  {
    id: 'system',
    module: 'control',
    path: '/system',
    labelKey: 'routeFoundry.destinations.system',
    icon: IconSidebarSystem,
    matches: exactPath('/system'),
  },
] as const satisfies readonly Omit<ConsoleDestination, 'order'>[];

const orderedDestinations: readonly ConsoleDestination[] = destinations.map(
  (destination, order) => ({
    ...destination,
    order,
  })
);

const moduleDefinitions: ReadonlyArray<{
  id: ConsoleModuleId;
  labelKey: string;
  icon: ComponentType<IconProps>;
}> = [
  { id: 'monitor', labelKey: 'routeFoundry.modules.monitor', icon: IconChartLine },
  { id: 'providers', labelKey: 'routeFoundry.modules.providers', icon: IconShield },
  { id: 'automate', labelKey: 'routeFoundry.modules.automate', icon: IconSlidersHorizontal },
  { id: 'control', labelKey: 'routeFoundry.modules.control', icon: IconSettings },
];

export const CONSOLE_MODULES: readonly ConsoleModule[] = moduleDefinitions.map((module) => ({
  ...module,
  destinations: orderedDestinations.filter((destination) => destination.module === module.id),
}));

export function resolveConsoleDestination(pathname: string): ConsoleDestination | null {
  return orderedDestinations.find((destination) => destination.matches(pathname)) ?? null;
}

export function getConsoleRouteOrder(pathname: string): number {
  return resolveConsoleDestination(pathname)?.order ?? -1;
}

export const CONSOLE_DESTINATIONS = orderedDestinations;
