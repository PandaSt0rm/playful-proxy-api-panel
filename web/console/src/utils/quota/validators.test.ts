import { describe, it, expect } from 'vitest';
import type { AuthFileItem } from '@/types';
import {
  resolveAuthProvider,
  isAntigravityFile,
  isClaudeFile,
  isClaudeOAuthFile,
  isCodexFile,
  isGeminiCliFile,
  isKimiFile,
  isXaiFile,
  isZaiFile,
  isRuntimeOnlyAuthFile,
  isDisabledAuthFile,
  isIgnoredGeminiCliModel,
} from './validators';

// Minimal AuthFileItem factory; `name` is the only required field on the type.
function makeFile(overrides: Partial<AuthFileItem> = {}): AuthFileItem {
  return { name: 'file.json', ...overrides };
}

describe('resolveAuthProvider', () => {
  it('returns the lowercased trimmed provider field', () => {
    const result = resolveAuthProvider(makeFile({ provider: '  Claude  ' }));

    expect(result).toBe('claude');
  });

  it('falls back to the type field when provider is absent', () => {
    const result = resolveAuthProvider(makeFile({ type: 'Codex' }));

    expect(result).toBe('codex');
  });

  it('prefers provider over type when both are present', () => {
    const result = resolveAuthProvider(makeFile({ provider: 'kimi', type: 'codex' }));

    expect(result).toBe('kimi');
  });

  it('returns an empty string when neither provider nor type is set', () => {
    const result = resolveAuthProvider(makeFile());

    expect(result).toBe('');
  });
});

describe('isAntigravityFile', () => {
  it('returns true when the provider is antigravity', () => {
    const result = isAntigravityFile(makeFile({ provider: 'antigravity' }));

    expect(result).toBe(true);
  });

  it('returns false for a different provider', () => {
    const result = isAntigravityFile(makeFile({ provider: 'claude' }));

    expect(result).toBe(false);
  });
});

describe('isClaudeFile', () => {
  it('returns true for a claude provider regardless of case', () => {
    const result = isClaudeFile(makeFile({ provider: 'CLAUDE' }));

    expect(result).toBe(true);
  });

  it('returns false for a codex provider', () => {
    const result = isClaudeFile(makeFile({ provider: 'codex' }));

    expect(result).toBe(false);
  });
});

describe('isClaudeOAuthFile', () => {
  it('returns true when a claude file has an sk-ant-oat access token', () => {
    const file = makeFile({
      provider: 'claude',
      metadata: { access_token: 'sk-ant-oat-abc123' },
    });

    const result = isClaudeOAuthFile(file);

    expect(result).toBe(true);
  });

  it('returns true when the token has surrounding whitespace', () => {
    const file = makeFile({
      provider: 'claude',
      metadata: { access_token: '  sk-ant-oat-xyz  ' },
    });

    const result = isClaudeOAuthFile(file);

    expect(result).toBe(true);
  });

  it('returns false when the claude token is not an oauth token', () => {
    const file = makeFile({
      provider: 'claude',
      metadata: { access_token: 'sk-ant-api-key' },
    });

    const result = isClaudeOAuthFile(file);

    expect(result).toBe(false);
  });

  it('returns false when the file is not a claude file', () => {
    const file = makeFile({
      provider: 'codex',
      metadata: { access_token: 'sk-ant-oat-abc' },
    });

    const result = isClaudeOAuthFile(file);

    expect(result).toBe(false);
  });

  it('returns false when metadata is missing', () => {
    const file = makeFile({ provider: 'claude' });

    const result = isClaudeOAuthFile(file);

    expect(result).toBe(false);
  });

  it('returns false when metadata is null', () => {
    const file = makeFile({ provider: 'claude', metadata: null });

    const result = isClaudeOAuthFile(file);

    expect(result).toBe(false);
  });

  it('returns false when access_token is not a string', () => {
    const file = makeFile({ provider: 'claude', metadata: { access_token: 12345 } });

    const result = isClaudeOAuthFile(file);

    expect(result).toBe(false);
  });
});

describe('isCodexFile', () => {
  it('returns true for a codex provider', () => {
    const result = isCodexFile(makeFile({ provider: 'codex' }));

    expect(result).toBe(true);
  });

  it('returns false for a non-codex provider', () => {
    const result = isCodexFile(makeFile({ provider: 'kimi' }));

    expect(result).toBe(false);
  });
});

describe('isGeminiCliFile', () => {
  it('returns true for a gemini-cli provider', () => {
    const result = isGeminiCliFile(makeFile({ provider: 'gemini-cli' }));

    expect(result).toBe(true);
  });

  it('returns false for a plain gemini provider', () => {
    const result = isGeminiCliFile(makeFile({ provider: 'gemini' }));

    expect(result).toBe(false);
  });
});

describe('isKimiFile', () => {
  it('returns true for a kimi provider', () => {
    const result = isKimiFile(makeFile({ provider: 'kimi' }));

    expect(result).toBe(true);
  });

  it('returns false for a different provider', () => {
    const result = isKimiFile(makeFile({ provider: 'zai' }));

    expect(result).toBe(false);
  });
});

describe('isXaiFile', () => {
  it('returns true for an xai provider', () => {
    const result = isXaiFile(makeFile({ provider: 'xai' }));

    expect(result).toBe(true);
  });

  it('returns true when type is xai and provider is absent', () => {
    const result = isXaiFile(makeFile({ provider: undefined, type: 'xai' }));

    expect(result).toBe(true);
  });

  it('returns false for a non-xai provider', () => {
    const result = isXaiFile(makeFile({ provider: 'kimi' }));

    expect(result).toBe(false);
  });
});

describe('isZaiFile', () => {
  it('returns true when the provider name is zai', () => {
    const result = isZaiFile(makeFile({ provider: 'zai' }));

    expect(result).toBe(true);
  });

  it('returns true for the z.ai dotted provider name', () => {
    const result = isZaiFile(makeFile({ provider: 'z.ai' }));

    expect(result).toBe(true);
  });

  it('returns true when only the label matches a zai name', () => {
    const result = isZaiFile(makeFile({ provider: 'openai', label: 'Z-AI' }));

    expect(result).toBe(true);
  });

  it('returns true when the base url points at the zai host', () => {
    const result = isZaiFile(
      makeFile({ provider: 'openai', baseUrl: 'https://api.z.ai/api/coding' })
    );

    expect(result).toBe(true);
  });

  it('returns true when the snake_case base_url points at the zai host', () => {
    const result = isZaiFile(makeFile({ provider: 'openai', base_url: 'https://api.z.ai/v4' }));

    expect(result).toBe(true);
  });

  it('returns false for an unrelated provider and base url', () => {
    const result = isZaiFile(
      makeFile({ provider: 'openai', baseUrl: 'https://api.openai.com/v1' })
    );

    expect(result).toBe(false);
  });

  it('returns false for a file with no zai signals', () => {
    const result = isZaiFile(makeFile({ provider: 'claude' }));

    expect(result).toBe(false);
  });
});

describe('isRuntimeOnlyAuthFile', () => {
  it('returns true for the boolean true', () => {
    const result = isRuntimeOnlyAuthFile(makeFile({ runtime_only: true }));

    expect(result).toBe(true);
  });

  it('returns false for the boolean false', () => {
    const result = isRuntimeOnlyAuthFile(makeFile({ runtime_only: false }));

    expect(result).toBe(false);
  });

  it('returns true for the string "true" with surrounding whitespace and mixed case', () => {
    const result = isRuntimeOnlyAuthFile(makeFile({ runtime_only: '  TRUE  ' }));

    expect(result).toBe(true);
  });

  it('reads the camelCase runtimeOnly fallback', () => {
    const result = isRuntimeOnlyAuthFile(makeFile({ runtimeOnly: true }));

    expect(result).toBe(true);
  });

  it('returns false for the string "false"', () => {
    const result = isRuntimeOnlyAuthFile(makeFile({ runtime_only: 'false' }));

    expect(result).toBe(false);
  });

  it('returns false when the field is absent', () => {
    const result = isRuntimeOnlyAuthFile(makeFile());

    expect(result).toBe(false);
  });

  it('returns false for a numeric value because numbers are not handled', () => {
    const result = isRuntimeOnlyAuthFile(makeFile({ runtime_only: 1 }));

    expect(result).toBe(false);
  });
});

describe('isDisabledAuthFile', () => {
  it('returns true for the boolean true', () => {
    const result = isDisabledAuthFile(makeFile({ disabled: true }));

    expect(result).toBe(true);
  });

  it('returns false for the boolean false', () => {
    const result = isDisabledAuthFile(makeFile({ disabled: false }));

    expect(result).toBe(false);
  });

  it('returns true for a non-zero number', () => {
    const result = isDisabledAuthFile(makeFile({ disabled: 1 } as Partial<AuthFileItem>));

    expect(result).toBe(true);
  });

  it('returns false for the number zero', () => {
    const result = isDisabledAuthFile(makeFile({ disabled: 0 } as Partial<AuthFileItem>));

    expect(result).toBe(false);
  });

  it('returns true for the string "true" with mixed case', () => {
    const result = isDisabledAuthFile(makeFile({ disabled: 'True' } as Partial<AuthFileItem>));

    expect(result).toBe(true);
  });

  it('returns false for the string "false"', () => {
    const result = isDisabledAuthFile(makeFile({ disabled: 'false' } as Partial<AuthFileItem>));

    expect(result).toBe(false);
  });

  it('returns false when the field is absent', () => {
    const result = isDisabledAuthFile(makeFile());

    expect(result).toBe(false);
  });
});

describe('isIgnoredGeminiCliModel', () => {
  it('returns true when the model id exactly equals an ignored prefix', () => {
    const result = isIgnoredGeminiCliModel('gemini-2.0-flash');

    expect(result).toBe(true);
  });

  it('returns true when the model id starts with an ignored prefix followed by a dash', () => {
    const result = isIgnoredGeminiCliModel('gemini-2.0-flash-exp');

    expect(result).toBe(true);
  });

  it('returns false when the model id only shares the prefix without a dash separator', () => {
    const result = isIgnoredGeminiCliModel('gemini-2.0-flashlite');

    expect(result).toBe(false);
  });

  it('returns false for an unrelated model id', () => {
    const result = isIgnoredGeminiCliModel('gemini-2.5-pro');

    expect(result).toBe(false);
  });

  it('returns false for an empty model id', () => {
    const result = isIgnoredGeminiCliModel('');

    expect(result).toBe(false);
  });
});
