export interface PanelManifestEntry {
  id: string;
  path: string;
  heading: string;
  module: 'Monitor' | 'Providers' | 'Automate' | 'Control' | 'Readiness';
  destination: string;
  region: string;
  interaction: { role: 'button' | 'link' | 'textbox'; name: string };
}

export const PANEL_MANIFEST: readonly PanelManifestEntry[] = [
  { id: 'overview', path: '/', heading: 'AIPROXY overview', module: 'Monitor', destination: 'Overview', region: 'Traffic now', interaction: { role: 'button', name: 'Refresh overview' } },
  { id: 'operations', path: '/operations', heading: 'Live Operations', module: 'Monitor', destination: 'Live Operations', region: 'Request activity', interaction: { role: 'button', name: 'Pause' } },
  { id: 'usage', path: '/usage', heading: 'Usage Statistics', module: 'Monitor', destination: 'Usage Statistics', region: 'Usage summary', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'quota', path: '/quota', heading: 'Quota Management', module: 'Monitor', destination: 'Quota Management', region: 'No credentials', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'logs', path: '/logs', heading: 'Logs Viewer', module: 'Monitor', destination: 'Logs Viewer', region: 'No Logs Available', interaction: { role: 'button', name: 'Refresh Logs' } },
  { id: 'providers', path: '/ai-providers', heading: 'AI Providers', module: 'Providers', destination: 'AI Providers', region: 'Gemini API Keys', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'auth-files', path: '/auth-files', heading: 'Auth Files', module: 'Providers', destination: 'Auth Files', region: 'Search configs', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'oauth', path: '/oauth', heading: 'Auth Login', module: 'Providers', destination: 'Auth Login', region: 'Codex OAuth', interaction: { role: 'button', name: 'Start Codex Login' } },
  { id: 'diagnostics', path: '/diagnostics', heading: 'Diagnostics', module: 'Providers', destination: 'Diagnostics', region: 'Target', interaction: { role: 'button', name: 'Run diagnostic' } },
  { id: 'tooling', path: '/tooling-templates', heading: 'Tooling Templates', module: 'Automate', destination: 'Tooling Templates', region: 'No sync profiles configured', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'plugins', path: '/plugins', heading: 'Plugins', module: 'Automate', destination: 'Plugins', region: 'No plugins found', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'budgets', path: '/budgets', heading: 'Budgets', module: 'Control', destination: 'Budgets', region: 'Budget controls', interaction: { role: 'button', name: 'Create budget' } },
  { id: 'config', path: '/config', heading: 'Config', module: 'Control', destination: 'Config', region: 'Server Configuration', interaction: { role: 'button', name: 'Source File Editor' } },
  { id: 'changes', path: '/changes', heading: 'Change History', module: 'Control', destination: 'Change History', region: 'No recorded changes', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'system', path: '/system', heading: 'Management Center Info', module: 'Control', destination: 'Management Center Info', region: 'Available Models', interaction: { role: 'button', name: 'Refresh' } },
  { id: 'readiness', path: '/onboarding', heading: 'Readiness', module: 'Readiness', destination: 'Readiness', region: 'Operator checks', interaction: { role: 'button', name: 'Refresh checks' } },
];

export const NESTED_PANEL_MANIFEST = [
  { path: '/ai-providers/gemini/new', owner: 'AI Providers', breadcrumb: 'New' },
  { path: '/ai-providers/claude/0/models', owner: 'AI Providers', breadcrumb: 'Models' },
  { path: '/auth-files/oauth-excluded', owner: 'Auth Files', breadcrumb: 'Edit' },
  { path: '/auth-files/oauth-model-alias', owner: 'Auth Files', breadcrumb: 'Edit' },
] as const;
