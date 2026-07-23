import type {
  AuthFileItem,
  GeminiKeyConfig,
  OpenAIProviderConfig,
  ProviderKeyConfig,
} from '@/types';

export type DiagnosticCredentialKind =
  | 'gemini-api-key'
  | 'interactions-api-key'
  | 'claude-api-key'
  | 'xai-api-key'
  | 'codex'
  | 'vertex-api-key'
  | 'openai-compatibility'
  | 'auth-file';

export interface DiagnosticCredentialOption {
  kind: DiagnosticCredentialKind;
  authIndex: string;
  label: string;
  setupPath: string;
}

export interface DiagnosticCredentialSources {
  gemini?: GeminiKeyConfig[];
  interactions?: GeminiKeyConfig[];
  claude?: ProviderKeyConfig[];
  xai?: ProviderKeyConfig[];
  codex?: ProviderKeyConfig[];
  vertex?: ProviderKeyConfig[];
  openai?: OpenAIProviderConfig[];
  authFiles?: AuthFileItem[];
}

function safeProviderLabel(name: string, prefix: string | undefined, authIndex: string) {
  const visibleName = prefix?.trim() || name;
  return `${visibleName} · ${authIndex}`;
}

function providerOptions<T extends { prefix?: string; authIndex?: string }>(
  configs: readonly T[] | undefined,
  kind: DiagnosticCredentialKind,
  name: string
): DiagnosticCredentialOption[] {
  return (configs ?? []).map((config, index) => {
    const authIndex = config.authIndex?.trim() || String(index);
    return {
      kind,
      authIndex,
      label: safeProviderLabel(name, config.prefix, authIndex),
      setupPath: '/ai-providers',
    };
  });
}

export function buildDiagnosticCredentialOptions(
  sources: DiagnosticCredentialSources
): DiagnosticCredentialOption[] {
  const options = [
    ...providerOptions(sources.gemini, 'gemini-api-key', 'Gemini'),
    ...providerOptions(sources.interactions, 'interactions-api-key', 'Interactions'),
    ...providerOptions(sources.claude, 'claude-api-key', 'Claude'),
    ...providerOptions(sources.xai, 'xai-api-key', 'xAI'),
    ...providerOptions(sources.codex, 'codex', 'Codex'),
    ...providerOptions(sources.vertex, 'vertex-api-key', 'Vertex'),
    ...(sources.openai ?? []).map((provider, index) => {
      const authIndex = provider.authIndex?.trim() || String(index);
      return {
        kind: 'openai-compatibility' as const,
        authIndex,
        label: safeProviderLabel(provider.name || 'OpenAI-compatible', provider.prefix, authIndex),
        setupPath: '/ai-providers',
      };
    }),
    ...(sources.authFiles ?? []).map((file, index) => {
      const authIndex = String(file.authIndex ?? index);
      return {
        kind: 'auth-file' as const,
        authIndex,
        label: `${file.name} · ${authIndex}`,
        setupPath: '/auth-files',
      };
    }),
  ];

  return options.sort((left, right) => left.label.localeCompare(right.label));
}
