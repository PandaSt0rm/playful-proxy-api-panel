import { describe, it, expect } from 'vitest';
import type { ApiCallResult } from '@/services/api';
import {
  familyAuthHeaderName,
  familyAuthHeaders,
  resolveSpec,
  type DebugProviderFamily,
} from './families';
import type { DebugTarget, RegistryCheckId } from './types';

const LIVE_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

const target = (overrides: Partial<DebugTarget> = {}): DebugTarget => ({
  providerLabel: 'provider',
  family: 'openai',
  baseUrl: 'https://api.example.com/v1',
  headers: {},
  keys: [{ apiKey: LIVE_KEY }],
  models: [],
  model: 'test-model',
  ...overrides,
});

const result = (body: unknown, statusCode = 200, bodyText?: string): ApiCallResult => ({
  statusCode,
  header: {},
  bodyText: bodyText ?? (typeof body === 'string' ? body : JSON.stringify(body)),
  body: typeof body === 'string' ? null : body,
});

const evaluate = (
  family: DebugProviderFamily,
  check: RegistryCheckId,
  response: ApiCallResult,
  overrides: Partial<DebugTarget> = {}
) => {
  const spec = resolveSpec(family, check);
  if (!spec) throw new Error(`${family}/${check} has no spec`);
  const built = target({ family, ...overrides });
  return spec.evaluate(response, { target: built, model: built.model });
};

describe('family credential headers', () => {
  it('uses each provider’s own credential header', () => {
    // Sending a bearer token to Anthropic or Google produces a 401 that says nothing about
    // whether the key is good.
    expect(familyAuthHeaders('claude', 'k')).toEqual({
      'x-api-key': 'k',
      'anthropic-version': '2023-06-01',
    });
    expect(familyAuthHeaders('gemini', 'k')).toEqual({ 'x-goog-api-key': 'k' });
    expect(familyAuthHeaders('openai', 'k')).toEqual({ Authorization: 'Bearer k' });
    expect(familyAuthHeaders('generic', 'k')).toEqual({ Authorization: 'Bearer k' });
  });

  it('names the header a custom override would collide with', () => {
    expect(familyAuthHeaderName('claude')).toBe('x-api-key');
    expect(familyAuthHeaderName('gemini')).toBe('x-goog-api-key');
    expect(familyAuthHeaderName('openai')).toBe('authorization');
    expect(familyAuthHeaderName('generic')).toBe('authorization');
  });
});

describe('family coverage', () => {
  it('covers every check on the OpenAI-compatible family', () => {
    for (const check of [
      'reachability',
      'auth',
      'catalog',
      'completion',
      'sse_format',
      'tools',
      'json_mode',
      'vision',
    ] as const) {
      expect(resolveSpec('openai', check)).toBeDefined();
    }
  });

  it('leaves the generic family to credential-level checks only', () => {
    expect(resolveSpec('generic', 'reachability')).toBeDefined();
    expect(resolveSpec('generic', 'auth')).toBeDefined();
    expect(resolveSpec('generic', 'catalog')).toBeDefined();
    // Guessing a generative wire format would produce a red check that says more about this
    // console than about the provider; the routed lane covers these instead.
    expect(resolveSpec('generic', 'completion')).toBeUndefined();
    expect(resolveSpec('generic', 'vision')).toBeUndefined();
  });

  it('models the Claude and Gemini surfaces it can build correctly', () => {
    expect(resolveSpec('claude', 'tools')).toBeDefined();
    expect(resolveSpec('claude', 'json_mode')).toBeUndefined();
    expect(resolveSpec('gemini', 'completion')).toBeDefined();
    expect(resolveSpec('gemini', 'tools')).toBeUndefined();
  });
});

describe('family endpoints', () => {
  it('routes Claude at its own paths without doubling the version segment', () => {
    expect(resolveSpec('claude', 'auth')?.endpoint(target())).toBe(
      'https://api.example.com/v1/models'
    );
    expect(
      resolveSpec('claude', 'auth')?.endpoint(target({ baseUrl: 'https://api.anthropic.com' }))
    ).toBe('https://api.anthropic.com/v1/models');
    expect(resolveSpec('claude', 'completion')?.endpoint(target())).toBe(
      'https://api.example.com/v1/messages'
    );
  });

  it('defaults Gemini to the public endpoint when no base url is set', () => {
    expect(resolveSpec('gemini', 'auth')?.endpoint(target({ baseUrl: '' }))).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models'
    );
    expect(
      resolveSpec('gemini', 'auth')?.endpoint(target({ baseUrl: 'https://proxy.test/v1beta' }))
    ).toBe('https://proxy.test/v1beta/models');
  });

  it('does not double the models segment on a generic base url', () => {
    expect(resolveSpec('generic', 'auth')?.endpoint(target())).toBe(
      'https://api.example.com/v1/models'
    );
    expect(
      resolveSpec('generic', 'auth')?.endpoint(target({ baseUrl: 'https://api.example.com/models' }))
    ).toBe('https://api.example.com/models');
    expect(resolveSpec('generic', 'auth')?.endpoint(target({ baseUrl: '' }))).toBe('');
  });
});

describe('shared outcome evaluation', () => {
  it('treats any answer as reachable', () => {
    expect(evaluate('generic', 'reachability', result({}, 503)).status).toBe('pass');
  });

  it.each([
    [200, 'pass'],
    [401, 'fail'],
    [403, 'fail'],
    [404, 'warn'],
  ])('maps auth HTTP %i to %s', (status, expected) => {
    expect(evaluate('generic', 'auth', result({ error: 'x' }, status)).status).toBe(expected);
  });

  it('reports catalog agreement, drift, emptiness, and failure', () => {
    const models = { data: [{ id: 'a' }, { id: 'b' }] };
    expect(evaluate('generic', 'catalog', result(models), { models: ['a'] }).status).toBe('pass');
    expect(evaluate('generic', 'catalog', result(models), { models: ['a', 'z'] }).status).toBe(
      'warn'
    );
    expect(evaluate('generic', 'catalog', result(models), { models: ['a', ' '] }).status).toBe(
      'pass'
    );
    expect(evaluate('generic', 'catalog', result({ data: [] })).status).toBe('warn');
    expect(evaluate('generic', 'catalog', result('not json')).status).toBe('warn');
    expect(evaluate('generic', 'catalog', result({ error: 'x' }, 500)).status).toBe('fail');
  });

  it('masks a credential echoed back in an error', () => {
    const outcome = evaluate('generic', 'auth', result({ error: { message: LIVE_KEY } }, 401));
    expect(String(outcome.message.params?.detail)).not.toContain(LIVE_KEY);
  });
});

describe('claude evaluation', () => {
  const CLAUDE_OK = { content: [{ type: 'text', text: 'OK' }] };

  it('reads a completion out of the content blocks', () => {
    expect(evaluate('claude', 'completion', result(CLAUDE_OK)).status).toBe('pass');
    expect(evaluate('claude', 'completion', result({ content: [] })).status).toBe('warn');
    expect(evaluate('claude', 'completion', result({})).status).toBe('warn');
    expect(evaluate('claude', 'completion', result('plain')).status).toBe('warn');
    expect(evaluate('claude', 'completion', result({ error: 'x' }, 400)).status).toBe('fail');
  });

  it('accepts message_stop as the stream terminator, not [DONE]', () => {
    const terminated = evaluate(
      'claude',
      'sse_format',
      result(null, 200, 'data: {"type":"content_block_delta"}\n\ndata: {"type":"message_stop"}\n\n')
    );
    expect(terminated.status).toBe('pass');

    const unterminated = evaluate(
      'claude',
      'sse_format',
      result(null, 200, 'data: {"type":"content_block_delta"}\n\n')
    );
    expect(unterminated.status).toBe('warn');

    expect(evaluate('claude', 'sse_format', result(CLAUDE_OK)).status).toBe('fail');
    expect(evaluate('claude', 'sse_format', result({ error: 'x' }, 400)).status).toBe('fail');
  });

  it('detects a tool_use block', () => {
    expect(
      evaluate('claude', 'tools', result({ content: [{ type: 'tool_use', name: 'ping' }] })).status
    ).toBe('pass');
    expect(evaluate('claude', 'tools', result(CLAUDE_OK)).status).toBe('warn');
    expect(evaluate('claude', 'tools', result({})).status).toBe('warn');
    expect(evaluate('claude', 'tools', result({ error: 'x' }, 400)).status).toBe('fail');
  });

  it('builds Anthropic-shaped bodies', () => {
    const spec = resolveSpec('claude', 'sse_format');
    const body = spec?.body?.({ target: target({ family: 'claude' }), model: 'claude-x' }) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ model: 'claude-x', stream: true });
    expect(body.max_tokens).toBeLessThanOrEqual(32);
  });
});

describe('gemini evaluation', () => {
  it('reads candidates out of a generateContent response', () => {
    expect(
      evaluate('gemini', 'completion', result({ candidates: [{ content: {} }] })).status
    ).toBe('pass');
    expect(evaluate('gemini', 'completion', result({ candidates: [] })).status).toBe('warn');
    expect(evaluate('gemini', 'completion', result({})).status).toBe('warn');
    expect(evaluate('gemini', 'completion', result({ error: 'x' }, 400)).status).toBe('fail');
  });

  it('builds a contents-shaped body', () => {
    const body = resolveSpec('gemini', 'completion')?.body?.({
      target: target({ family: 'gemini' }),
      model: 'gemini-x',
    });
    expect(body).toEqual({ contents: [{ parts: [{ text: 'Reply OK' }] }] });
  });
});

// Systematic sweep: every spec every family declares must build a usable request and
// classify a response. Written as a loop so a family added later cannot ship a spec that
// nothing ever calls.
describe('every declared spec is exercised', () => {
  const families: DebugProviderFamily[] = ['openai', 'claude', 'gemini', 'generic'];
  const checks: RegistryCheckId[] = [
    'reachability',
    'auth',
    'catalog',
    'completion',
    'sse_format',
    'tools',
    'json_mode',
    'vision',
  ];

  for (const family of families) {
    for (const check of checks) {
      const spec = resolveSpec(family, check);
      if (!spec) continue;

      it(`${family}/${check} builds a request and classifies a response`, () => {
        const built = target({ family });
        expect(spec.endpoint(built)).toMatch(/^https?:\/\//);

        if (spec.body) {
          const body = spec.body({ target: built, model: built.model });
          expect(body).toBeTypeOf('object');
          expect(JSON.stringify(body).length).toBeGreaterThan(2);
        }

        // Both a success and a rejection must produce a status rather than throwing.
        for (const response of [result({}), result({ error: 'x' }, 500)]) {
          const outcome = spec.evaluate(response, { target: built, model: built.model });
          expect(['pass', 'warn', 'fail']).toContain(outcome.status);
        }
      });
    }
  }
});
