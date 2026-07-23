import { describe, it, expect } from 'vitest';
import type { AuthFileItem } from '@/types';
import {
  extractCodexChatgptAccountId,
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
  extractGeminiCliProjectId,
  resolveGeminiCliProjectId,
} from './resolvers';

function makeFile(overrides: Partial<AuthFileItem> = {}): AuthFileItem {
  return { name: 'file.json', ...overrides };
}

// Encode an object as a JWT-shaped string whose middle segment is the
// base64url-encoded JSON claims, computed independently of the parser.
function toJwt(claims: Record<string, unknown>): string {
  const base64 = Buffer.from(JSON.stringify(claims), 'utf-8').toString('base64');
  const segment = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${segment}.signature`;
}

describe('extractCodexChatgptAccountId', () => {
  it('extracts chatgpt_account_id from a plain object payload', () => {
    const result = extractCodexChatgptAccountId({ chatgpt_account_id: 'acct_1' });

    expect(result).toBe('acct_1');
  });

  it('reads the camelCase chatgptAccountId fallback', () => {
    const result = extractCodexChatgptAccountId({ chatgptAccountId: 'acct_2' });

    expect(result).toBe('acct_2');
  });

  it('extracts the account id from a JSON string payload', () => {
    const result = extractCodexChatgptAccountId('{"chatgpt_account_id":"acct_3"}');

    expect(result).toBe('acct_3');
  });

  it('extracts the account id from a JWT-shaped string', () => {
    const result = extractCodexChatgptAccountId(toJwt({ chatgpt_account_id: 'acct_4' }));

    expect(result).toBe('acct_4');
  });

  it('returns null when the payload has no account id field', () => {
    const result = extractCodexChatgptAccountId({ other: 'x' });

    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    const result = extractCodexChatgptAccountId(null);

    expect(result).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    const result = extractCodexChatgptAccountId('garbage');

    expect(result).toBeNull();
  });

  it('returns the numeric account id as a string', () => {
    const result = extractCodexChatgptAccountId({ chatgpt_account_id: 99 });

    expect(result).toBe('99');
  });
});

describe('resolveCodexChatgptAccountId', () => {
  it('resolves the account id from the top-level id_token', () => {
    const file = makeFile({ id_token: '{"chatgpt_account_id":"acct_top"}' });

    const result = resolveCodexChatgptAccountId(file);

    expect(result).toBe('acct_top');
  });

  it('resolves the account id from metadata.id_token when top-level is absent', () => {
    const file = makeFile({ metadata: { id_token: '{"chatgpt_account_id":"acct_meta"}' } });

    const result = resolveCodexChatgptAccountId(file);

    expect(result).toBe('acct_meta');
  });

  it('resolves the account id from attributes.id_token as a last resort', () => {
    const file = makeFile({ attributes: { id_token: '{"chatgpt_account_id":"acct_attr"}' } });

    const result = resolveCodexChatgptAccountId(file);

    expect(result).toBe('acct_attr');
  });

  it('prefers the top-level id_token over metadata and attributes', () => {
    const file = makeFile({
      id_token: '{"chatgpt_account_id":"acct_top"}',
      metadata: { id_token: '{"chatgpt_account_id":"acct_meta"}' },
      attributes: { id_token: '{"chatgpt_account_id":"acct_attr"}' },
    });

    const result = resolveCodexChatgptAccountId(file);

    expect(result).toBe('acct_top');
  });

  it('returns null when no candidate yields an account id', () => {
    const file = makeFile({ id_token: '{"sub":"x"}' });

    const result = resolveCodexChatgptAccountId(file);

    expect(result).toBeNull();
  });

  it('returns null for a file with no id token sources', () => {
    const result = resolveCodexChatgptAccountId(makeFile());

    expect(result).toBeNull();
  });

  it('ignores non-object metadata and falls through to attributes', () => {
    const file = makeFile({
      metadata: 'not-an-object',
      attributes: { id_token: '{"chatgpt_account_id":"acct_attr"}' },
    });

    const result = resolveCodexChatgptAccountId(file);

    expect(result).toBe('acct_attr');
  });
});

describe('resolveCodexPlanType', () => {
  it('resolves a lowercased plan type from the top-level plan_type field', () => {
    const file = makeFile({ plan_type: 'Pro' });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('pro');
  });

  it('reads the camelCase planType field', () => {
    const file = makeFile({ planType: 'TEAM' });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('team');
  });

  it('resolves the plan type from a nested id_token object', () => {
    const file = makeFile({ id_token: { plan_type: 'Enterprise' } });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('enterprise');
  });

  it('resolves the plan type from metadata.plan_type', () => {
    const file = makeFile({ metadata: { plan_type: 'Plus' } });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('plus');
  });

  it('resolves the plan type from a nested metadata.id_token object', () => {
    const file = makeFile({ metadata: { id_token: { planType: 'Pro' } } });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('pro');
  });

  it('resolves the plan type from attributes.plan_type', () => {
    const file = makeFile({ attributes: { plan_type: 'Free' } });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('free');
  });

  it('prefers the top-level plan_type over metadata', () => {
    const file = makeFile({ plan_type: 'Pro', metadata: { plan_type: 'Free' } });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('pro');
  });

  it('returns the plan type from id_token when it is a JSON string', () => {
    // file.id_token is a string candidate; normalizePlanType lowercases the raw
    // string, so a JSON string is returned verbatim (lowercased), not parsed.
    const file = makeFile({ id_token: 'PLAN_X' });

    const result = resolveCodexPlanType(file);

    expect(result).toBe('plan_x');
  });

  it('returns null when no candidate carries a plan type', () => {
    const file = makeFile({ metadata: { other: 'x' } });

    const result = resolveCodexPlanType(file);

    expect(result).toBeNull();
  });

  it('returns null for a file with no plan sources', () => {
    const result = resolveCodexPlanType(makeFile());

    expect(result).toBeNull();
  });
});

describe('extractGeminiCliProjectId', () => {
  it('extracts the id inside the last parenthesised group', () => {
    const result = extractGeminiCliProjectId('user@example.com (project-123)');

    expect(result).toBe('project-123');
  });

  it('uses the last parenthesised group when several are present', () => {
    const result = extractGeminiCliProjectId('first (alpha) second (beta)');

    expect(result).toBe('beta');
  });

  it('trims whitespace inside the parentheses', () => {
    const result = extractGeminiCliProjectId('account (  proj-7  )');

    expect(result).toBe('proj-7');
  });

  it('returns null when there are no parentheses', () => {
    const result = extractGeminiCliProjectId('user@example.com');

    expect(result).toBeNull();
  });

  it('returns null for a non-string value', () => {
    const result = extractGeminiCliProjectId(42);

    expect(result).toBeNull();
  });

  it('returns null when the parentheses are empty', () => {
    const result = extractGeminiCliProjectId('account ()');

    expect(result).toBeNull();
  });

  it('returns null when the parentheses contain only whitespace', () => {
    const result = extractGeminiCliProjectId('account (   )');

    expect(result).toBeNull();
  });
});

describe('resolveGeminiCliProjectId', () => {
  it('resolves the project id from the account field', () => {
    const file = makeFile({ account: 'user@example.com (proj-a)' });

    const result = resolveGeminiCliProjectId(file);

    expect(result).toBe('proj-a');
  });

  it('resolves the project id from metadata.account when top-level is absent', () => {
    const file = makeFile({ metadata: { account: 'user (proj-b)' } });

    const result = resolveGeminiCliProjectId(file);

    expect(result).toBe('proj-b');
  });

  it('resolves the project id from attributes.account as a last resort', () => {
    const file = makeFile({ attributes: { account: 'user (proj-c)' } });

    const result = resolveGeminiCliProjectId(file);

    expect(result).toBe('proj-c');
  });

  it('prefers the top-level account over metadata and attributes', () => {
    const file = makeFile({
      account: 'top (proj-top)',
      metadata: { account: 'meta (proj-meta)' },
      attributes: { account: 'attr (proj-attr)' },
    });

    const result = resolveGeminiCliProjectId(file);

    expect(result).toBe('proj-top');
  });

  it('returns null when no account candidate contains a project id', () => {
    const file = makeFile({ account: 'no parentheses here' });

    const result = resolveGeminiCliProjectId(file);

    expect(result).toBeNull();
  });

  it('returns null for a file with no account sources', () => {
    const result = resolveGeminiCliProjectId(makeFile());

    expect(result).toBeNull();
  });
});
