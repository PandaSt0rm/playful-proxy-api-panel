export interface PanelManifestEntry {
  id: string;
  path: string;
  heading: string;
  module: 'Monitor' | 'Providers' | 'Automate' | 'Control' | 'Readiness';
  destination: string;
  region: string;
  interaction: { role: 'button' | 'link' | 'textbox'; name: string };
}

export interface VisualFamilyManifestEntry {
  id: string;
  path: string;
  heading: string;
  owner: 'AI Providers' | 'Auth Files' | null;
  requiresAuthentication: boolean;
  interaction: { role: 'button' | 'link' | 'textbox'; name: string };
}

export const PANEL_MANIFEST: readonly PanelManifestEntry[] = [
  {
    id: 'overview',
    path: '/',
    heading: 'AIPROXY overview',
    module: 'Monitor',
    destination: 'Overview',
    region: 'Traffic now',
    interaction: { role: 'button', name: 'Refresh overview' },
  },
  {
    id: 'operations',
    path: '/operations',
    heading: 'Live Operations',
    module: 'Monitor',
    destination: 'Live Operations',
    region: 'Request activity',
    interaction: { role: 'button', name: 'Pause' },
  },
  {
    id: 'usage',
    path: '/usage',
    heading: 'Usage Statistics',
    module: 'Monitor',
    destination: 'Usage Statistics',
    region: 'Usage summary',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'quota',
    path: '/quota',
    heading: 'Quota Management',
    module: 'Monitor',
    destination: 'Quota Management',
    region: 'No credentials',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'logs',
    path: '/logs',
    heading: 'Logs Viewer',
    module: 'Monitor',
    destination: 'Logs Viewer',
    region: 'No Logs Available',
    interaction: { role: 'button', name: 'Refresh Logs' },
  },
  {
    id: 'providers',
    path: '/ai-providers',
    heading: 'AI Providers Configuration',
    module: 'Providers',
    destination: 'AI Providers',
    region: 'Gemini API Keys',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'auth-files',
    path: '/auth-files',
    heading: 'Auth Files Management',
    module: 'Providers',
    destination: 'Auth Files',
    region: 'Search configs',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'oauth',
    path: '/oauth',
    heading: 'OAuth Login',
    module: 'Providers',
    destination: 'Auth Login',
    region: 'Codex OAuth',
    interaction: { role: 'button', name: 'Start Codex Login' },
  },
  {
    id: 'diagnostics',
    path: '/diagnostics',
    heading: 'Diagnostics',
    module: 'Providers',
    destination: 'Diagnostics',
    region: 'Target',
    interaction: { role: 'button', name: 'Run diagnostic' },
  },
  {
    id: 'tooling',
    path: '/tooling-templates',
    heading: 'Tooling Templates',
    module: 'Automate',
    destination: 'Tooling Templates',
    region: 'No sync profiles configured',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'plugins',
    path: '/plugins',
    heading: 'Plugins',
    module: 'Automate',
    destination: 'Plugins',
    region: 'No plugins found',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'budgets',
    path: '/budgets',
    heading: 'Budgets',
    module: 'Control',
    destination: 'Budgets',
    region: 'Budget controls',
    interaction: { role: 'button', name: 'Create budget' },
  },
  {
    id: 'config',
    path: '/config',
    heading: 'Config Panel',
    module: 'Control',
    destination: 'Config',
    region: 'Server Configuration',
    interaction: { role: 'button', name: 'Source File Editor' },
  },
  {
    id: 'changes',
    path: '/changes',
    heading: 'Change History',
    module: 'Control',
    destination: 'Change History',
    region: 'No recorded changes',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'system',
    path: '/system',
    heading: 'Management Center Info',
    module: 'Control',
    destination: 'Management Center Info',
    region: 'Available Models',
    interaction: { role: 'button', name: 'Refresh' },
  },
  {
    id: 'readiness',
    path: '/onboarding',
    heading: 'Readiness',
    module: 'Readiness',
    destination: 'Readiness',
    region: 'Operator checks',
    interaction: { role: 'button', name: 'Refresh checks' },
  },
];

export const VISUAL_FAMILY_MANIFEST: readonly VisualFamilyManifestEntry[] = [
  {
    id: 'login',
    path: '/login',
    heading: 'AIPROXY',
    owner: null,
    requiresAuthentication: false,
    interaction: { role: 'textbox', name: 'Management Key:' },
  },
  {
    id: 'gemini-new',
    path: '/ai-providers/gemini/new',
    heading: 'Add Gemini API Key',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'codex-new',
    path: '/ai-providers/codex/new',
    heading: 'Add Codex API Configuration',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'interactions-new',
    path: '/ai-providers/interactions/new',
    heading: 'Add Google Interactions API Key',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'xai-new',
    path: '/ai-providers/xai/new',
    heading: 'Add xAI API Key',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'claude-new',
    path: '/ai-providers/claude/new',
    heading: 'Add Claude API Configuration',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'vertex-new',
    path: '/ai-providers/vertex/new',
    heading: 'Add Vertex API Configuration',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'openai-new',
    path: '/ai-providers/openai/new',
    heading: 'Add OpenAI Compatible Provider',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'zai-new',
    path: '/ai-providers/zai/new',
    heading: 'Add Z.AI Provider',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'openrouter-new',
    path: '/ai-providers/openrouter/new',
    heading: 'Add OpenRouter Provider',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'ollama-new',
    path: '/ai-providers/ollama/new',
    heading: 'Add Ollama Cloud Provider',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'claude-models',
    path: '/ai-providers/claude/new/models',
    heading: 'Pick Models from Claude /v1/models',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'openai-models',
    path: '/ai-providers/openai/new/models',
    heading: 'Pick Models from /models',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'zai-models',
    path: '/ai-providers/zai/new/models',
    heading: 'Pick Models from /models',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'openrouter-models',
    path: '/ai-providers/openrouter/new/models',
    heading: 'Pick Models from /models',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'ollama-models',
    path: '/ai-providers/ollama/new/models',
    heading: 'Pick Models from /models',
    owner: 'AI Providers',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'auth-excluded',
    path: '/auth-files/oauth-excluded',
    heading: 'Add provider model disablement',
    owner: 'Auth Files',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
  {
    id: 'auth-alias',
    path: '/auth-files/oauth-model-alias',
    heading: 'Add provider model aliases',
    owner: 'Auth Files',
    requiresAuthentication: true,
    interaction: { role: 'button', name: 'Back' },
  },
];

export const NESTED_PANEL_MANIFEST = VISUAL_FAMILY_MANIFEST.filter(
  (entry): entry is VisualFamilyManifestEntry & { owner: 'AI Providers' | 'Auth Files' } =>
    entry.owner !== null
);
