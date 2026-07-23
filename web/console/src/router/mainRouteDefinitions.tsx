import { Navigate } from 'react-router-dom';
import { LegacyWorkspaceRoute } from '@/components/workspace/LegacyWorkspaceRoute';
import { DashboardPage } from '@/pages/DashboardPage';
import { AiProvidersPage } from '@/pages/AiProvidersPage';
import { AiProvidersClaudeEditLayout } from '@/pages/AiProvidersClaudeEditLayout';
import { AiProvidersClaudeEditPage } from '@/pages/AiProvidersClaudeEditPage';
import { AiProvidersClaudeModelsPage } from '@/pages/AiProvidersClaudeModelsPage';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { AiProvidersGeminiEditPage } from '@/pages/AiProvidersGeminiEditPage';
import { AiProvidersNativeKeyEditPage } from '@/pages/AiProvidersNativeKeyEditPage';
import { AiProvidersOpenAIEditLayout } from '@/pages/AiProvidersOpenAIEditLayout';
import { AiProvidersOpenAIEditPage } from '@/pages/AiProvidersOpenAIEditPage';
import { AiProvidersOpenAIModelsPage } from '@/pages/AiProvidersOpenAIModelsPage';
import { AiProvidersVertexEditPage } from '@/pages/AiProvidersVertexEditPage';
import { AuthFilesPage } from '@/pages/AuthFilesPage';
import { AuthFilesOAuthExcludedEditPage } from '@/pages/AuthFilesOAuthExcludedEditPage';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { OAuthPage } from '@/pages/OAuthPage';
import { QuotaPage } from '@/pages/QuotaPage';
import { UsagePage } from '@/pages/UsagePage';
import { ConfigPage } from '@/pages/ConfigPage';
import { LogsPage } from '@/pages/LogsPage';
import { SystemPage } from '@/pages/SystemPage';
import { ToolingTemplatesPage } from '@/pages/ToolingTemplatesPage';
import { PluginsPage } from '@/pages/PluginsPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { OperationsPage } from '@/pages/OperationsPage';
import { DiagnosticsPage } from '@/pages/DiagnosticsPage';
import { ChangesPage } from '@/pages/ChangesPage';
import { BudgetsPage } from '@/pages/BudgetsPage';

export const mainRoutes = [
  { path: '/', element: <DashboardPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },
  { path: '/operations', element: <OperationsPage /> },
  { path: '/diagnostics', element: <DiagnosticsPage /> },
  { path: '/changes', element: <ChangesPage /> },
  { path: '/budgets', element: <BudgetsPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/settings', element: <Navigate to="/config" replace /> },
  { path: '/api-keys', element: <Navigate to="/config" replace /> },
  {
    path: '/ai-providers/gemini/new',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
        <AiProvidersGeminiEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/ai-providers/gemini/:index',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
        <AiProvidersGeminiEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/ai-providers/codex/new',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
        <AiProvidersCodexEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/ai-providers/codex/:index',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
        <AiProvidersCodexEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/ai-providers/interactions/new',
    element: <AiProvidersNativeKeyEditPage kind="interactions" />,
  },
  {
    path: '/ai-providers/interactions/:index',
    element: <AiProvidersNativeKeyEditPage kind="interactions" />,
  },
  { path: '/ai-providers/xai/new', element: <AiProvidersNativeKeyEditPage kind="xai" /> },
  { path: '/ai-providers/xai/:index', element: <AiProvidersNativeKeyEditPage kind="xai" /> },
  {
    path: '/ai-providers/claude/new',
    element: <AiProvidersClaudeEditLayout />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersClaudeEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersClaudeModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/claude/:index',
    element: <AiProvidersClaudeEditLayout />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersClaudeEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersClaudeModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/vertex/new',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
        <AiProvidersVertexEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/ai-providers/vertex/:index',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
        <AiProvidersVertexEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/ai-providers/openai/new',
    element: <AiProvidersOpenAIEditLayout />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/openai/:index',
    element: <AiProvidersOpenAIEditLayout />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/zai/new',
    element: <AiProvidersOpenAIEditLayout providerMode="zai" />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/zai/:index',
    element: <AiProvidersOpenAIEditLayout providerMode="zai" />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/openrouter/new',
    element: <AiProvidersOpenAIEditLayout providerMode="openrouter" />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/openrouter/:index',
    element: <AiProvidersOpenAIEditLayout providerMode="openrouter" />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/ollama/new',
    element: <AiProvidersOpenAIEditLayout providerMode="ollama" />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers/ollama/:index',
    element: <AiProvidersOpenAIEditLayout providerMode="ollama" />,
    children: [
      {
        index: true,
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIEditPage />
          </LegacyWorkspaceRoute>
        ),
      },
      {
        path: 'models',
        element: (
          <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders" width="reading">
            <AiProvidersOpenAIModelsPage />
          </LegacyWorkspaceRoute>
        ),
      },
    ],
  },
  {
    path: '/ai-providers',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders">
        <AiProvidersPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/ai-providers/*',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.aiProviders">
        <AiProvidersPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/auth-files',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.authFiles">
        <AuthFilesPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/auth-files/oauth-excluded',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.authFiles" width="reading">
        <AuthFilesOAuthExcludedEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/auth-files/oauth-model-alias',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.authFiles" width="reading">
        <AuthFilesOAuthModelAliasEditPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/oauth',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.oauth">
        <OAuthPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/tooling-templates',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.toolingTemplates">
        <ToolingTemplatesPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/plugins',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.plugins">
        <PluginsPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/quota',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.quota" width="full">
        <QuotaPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/usage',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.usage" width="full">
        <UsagePage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/config',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.config" width="full">
        <ConfigPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/logs',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.logs" width="full">
        <LogsPage />
      </LegacyWorkspaceRoute>
    ),
  },
  {
    path: '/system',
    element: (
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.system">
        <SystemPage />
      </LegacyWorkspaceRoute>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
