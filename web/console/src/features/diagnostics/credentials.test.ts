import { describe, expect, it } from 'vitest';
import { buildDiagnosticCredentialOptions } from './credentials';

describe('buildDiagnosticCredentialOptions', () => {
  it('maps every backend target kind without exposing secret key values', () => {
    const options = buildDiagnosticCredentialOptions({
      gemini: [{ apiKey: 'gemini-secret', prefix: 'Gemini prod', authIndex: 'g1' }],
      interactions: [{ apiKey: 'interactions-secret', authIndex: 'i1' }],
      claude: [{ apiKey: 'claude-secret', authIndex: 'c1' }],
      xai: [{ apiKey: 'xai-secret', authIndex: 'x1' }],
      codex: [{ apiKey: 'codex-secret', authIndex: 'cx1' }],
      vertex: [{ apiKey: 'vertex-secret', authIndex: 'v1' }],
      openai: [
        {
          name: 'Local gateway',
          baseUrl: 'https://example.test',
          apiKeyEntries: [{ apiKey: 'openai-secret' }],
          authIndex: 'o1',
        },
      ],
      authFiles: [{ name: 'account.json', authIndex: 'a1' }],
    });

    expect(new Set(options.map((option) => option.kind))).toEqual(
      new Set([
        'gemini-api-key',
        'interactions-api-key',
        'claude-api-key',
        'xai-api-key',
        'codex',
        'vertex-api-key',
        'openai-compatibility',
        'auth-file',
      ])
    );
    expect(JSON.stringify(options)).not.toContain('secret');
    expect(options.find((option) => option.kind === 'auth-file')).toMatchObject({
      label: 'account.json · a1',
      setupPath: '/auth-files',
    });
  });

  it('uses safe public fallbacks when optional labels and indexes are absent', () => {
    expect(buildDiagnosticCredentialOptions({})).toEqual([]);

    const options = buildDiagnosticCredentialOptions({
      gemini: [{ apiKey: 'hidden', prefix: '  ' }],
      openai: [{ name: '', baseUrl: '', apiKeyEntries: [] }],
      authFiles: [{ name: 'fallback.json' }],
    });

    expect(options).toEqual([
      { kind: 'auth-file', authIndex: '0', label: 'fallback.json · 0', setupPath: '/auth-files' },
      { kind: 'gemini-api-key', authIndex: '0', label: 'Gemini · 0', setupPath: '/ai-providers' },
      {
        kind: 'openai-compatibility',
        authIndex: '0',
        label: 'OpenAI-compatible · 0',
        setupPath: '/ai-providers',
      },
    ]);
  });
});
