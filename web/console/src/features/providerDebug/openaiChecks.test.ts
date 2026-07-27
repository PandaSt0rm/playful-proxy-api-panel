import { describe, it, expect } from 'vitest';
import type { ApiCallResult } from '@/services/api';
import { OPENAI_CHECK_SPECS, parseSseFrames } from './openaiChecks';
import type { DebugCheckId, DebugTarget } from './types';

const LIVE_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

const target = (overrides: Partial<DebugTarget> = {}): DebugTarget => ({
  providerLabel: 'openrouter',
  family: 'openai',
  baseUrl: 'https://api.example.com/v1',
  headers: {},
  keys: [{ apiKey: LIVE_KEY }],
  models: [],
  model: 'gpt-4o',
  ...overrides,
});

const result = (body: unknown, statusCode = 200, bodyText?: string): ApiCallResult => ({
  statusCode,
  header: {},
  bodyText: bodyText ?? (typeof body === 'string' ? body : JSON.stringify(body)),
  body: typeof body === 'string' ? null : body,
});

const evaluate = (id: DebugCheckId, response: ApiCallResult, overrides: Partial<DebugTarget> = {}) =>
  OPENAI_CHECK_SPECS[id].evaluate(response, {
    target: target(overrides),
    model: overrides.model ?? 'gpt-4o',
  });

const bodyOf = (id: DebugCheckId) => {
  const spec = OPENAI_CHECK_SPECS[id];
  if (!spec.body) throw new Error(`${id} sends no body`);
  return spec.body({ target: target(), model: 'gpt-4o' }) as Record<string, unknown>;
};

const CHAT_OK = {
  choices: [{ message: { role: 'assistant', content: 'OK' } }],
  usage: { total_tokens: 18 },
};

describe('parseSseFrames', () => {
  it('collects data frames and notices the terminator', () => {
    const parsed = parseSseFrames('data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n');
    expect(parsed.frames).toEqual(['{"a":1}', '{"a":2}']);
    expect(parsed.done).toBe(true);
  });

  it('reports an unterminated stream', () => {
    expect(parseSseFrames('data: {"a":1}\n\n')).toEqual({ frames: ['{"a":1}'], done: false });
  });

  it('ignores comments, blank frames, and non-data lines', () => {
    const parsed = parseSseFrames(': keep-alive\nevent: ping\ndata:\ndata: {"a":1}\n');
    expect(parsed.frames).toEqual(['{"a":1}']);
  });

  it('returns nothing for a plain JSON body', () => {
    expect(parseSseFrames('{"choices":[]}')).toEqual({ frames: [], done: false });
  });
});

describe('check specs', () => {
  it('routes the free checks at /models and the billable ones at /chat/completions', () => {
    const modelsUrl = 'https://api.example.com/v1/models';
    const chatUrl = 'https://api.example.com/v1/chat/completions';
    expect(OPENAI_CHECK_SPECS.reachability.endpoint(target())).toBe(modelsUrl);
    expect(OPENAI_CHECK_SPECS.auth.endpoint(target())).toBe(modelsUrl);
    expect(OPENAI_CHECK_SPECS.catalog.endpoint(target())).toBe(modelsUrl);
    expect(OPENAI_CHECK_SPECS.completion.endpoint(target())).toBe(chatUrl);
    expect(OPENAI_CHECK_SPECS.vision.endpoint(target())).toBe(chatUrl);
  });

  it('resolves an absolute endpoint for every registered check', () => {
    for (const id of Object.keys(OPENAI_CHECK_SPECS) as DebugCheckId[]) {
      expect(OPENAI_CHECK_SPECS[id].endpoint(target())).toMatch(
        /^https:\/\/api\.example\.com\/v1\//
      );
    }
  });

  it('sends a credential on every check except reachability', () => {
    const anonymous = (Object.keys(OPENAI_CHECK_SPECS) as DebugCheckId[]).filter(
      (id) => OPENAI_CHECK_SPECS[id].anonymous
    );
    expect(anonymous).toEqual(['reachability']);
  });

  it('requires a model only for the checks that exercise one', () => {
    const needsModel = (Object.keys(OPENAI_CHECK_SPECS) as DebugCheckId[]).filter(
      (id) => OPENAI_CHECK_SPECS[id].needsModel
    );
    expect(needsModel).toEqual(['completion', 'sse_format', 'tools', 'json_mode', 'vision']);
  });

  it('keeps every probe payload small, because each one is billed', () => {
    for (const id of ['completion', 'sse_format', 'tools', 'json_mode', 'vision'] as const) {
      expect(bodyOf(id).max_tokens as number).toBeLessThanOrEqual(32);
      expect(bodyOf(id).model).toBe('gpt-4o');
    }
  });

  it('asks for a stream only on the streaming check', () => {
    expect(bodyOf('completion').stream).toBe(false);
    expect(bodyOf('sse_format').stream).toBe(true);
  });

  it('offers a tool and a response format on the checks that probe them', () => {
    expect(Array.isArray(bodyOf('tools').tools)).toBe(true);
    expect(bodyOf('json_mode').response_format).toEqual({ type: 'json_object' });
  });

  it('inlines the vision image rather than depending on a third host', () => {
    const content = (bodyOf('vision').messages as Array<{ content: unknown }>)[0].content as Array<{
      type: string;
      image_url?: { url: string };
    }>;
    const image = content.find((part) => part.type === 'image_url');
    expect(image?.image_url?.url.startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('completion evaluation', () => {
  it('passes and reports token usage', () => {
    const outcome = evaluate('completion', result(CHAT_OK));
    expect(outcome.status).toBe('pass');
    expect(outcome.message.params).toEqual({ tokens: 18 });
    expect(outcome.meta).toEqual({ model: 'gpt-4o', tokens: 18 });
  });

  it('passes with a zero token count when the provider omits usage', () => {
    const outcome = evaluate('completion', result({ choices: [{ message: { content: 'OK' } }] }));
    expect(outcome.message.params).toEqual({ tokens: 0 });
    expect(outcome.meta?.tokens).toBeUndefined();
  });

  it('warns when the response carries no message', () => {
    expect(evaluate('completion', result({ choices: [] })).status).toBe('warn');
    expect(evaluate('completion', result({})).status).toBe('warn');
    expect(evaluate('completion', result('plain text')).status).toBe('warn');
    expect(evaluate('completion', result({ choices: [{ text: 'legacy' }] })).status).toBe('warn');
  });

  it('fails on a non-2xx, masking a credential echoed back in the error', () => {
    const outcome = evaluate(
      'completion',
      result({ error: { message: `bad key ${LIVE_KEY}` } }, 401)
    );
    expect(outcome.status).toBe('fail');
    expect(String(outcome.message.params?.detail)).not.toContain(LIVE_KEY);
    expect(String(outcome.message.params?.detail)).toContain('••••');
  });

  it('ignores a non-numeric token count', () => {
    const outcome = evaluate(
      'completion',
      result({ ...CHAT_OK, usage: { total_tokens: 'many' } })
    );
    expect(outcome.meta?.tokens).toBeUndefined();
  });
});

describe('sse_format evaluation', () => {
  it('passes a well-formed terminated stream', () => {
    const outcome = evaluate(
      'sse_format',
      result(null, 200, 'data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n')
    );
    expect(outcome.status).toBe('pass');
    expect(outcome.meta?.chunkCount).toBe(2);
  });

  it('warns when the stream never terminates', () => {
    const outcome = evaluate('sse_format', result(null, 200, 'data: {"a":1}\n\n'));
    expect(outcome.status).toBe('warn');
    expect(outcome.message.key).toBe('provider_debug.result.stream_unterminated');
  });

  it('fails when the provider answered with plain JSON instead of a stream', () => {
    const outcome = evaluate('sse_format', result(CHAT_OK));
    expect(outcome.status).toBe('fail');
    expect(outcome.message.key).toBe('provider_debug.result.stream_not_sse');
  });

  it('fails on a non-2xx', () => {
    expect(evaluate('sse_format', result({ error: 'no' }, 400)).status).toBe('fail');
  });
});

describe('tools evaluation', () => {
  it('passes when the model emits a tool call', () => {
    const outcome = evaluate(
      'tools',
      result({ choices: [{ message: { tool_calls: [{ id: 'call_1' }] } }] })
    );
    expect(outcome.status).toBe('pass');
    expect(outcome.message.params).toEqual({ count: 1 });
  });

  it('warns rather than fails when the schema was accepted but unused', () => {
    // The provider supports tools; the model simply chose not to call one.
    expect(evaluate('tools', result(CHAT_OK)).status).toBe('warn');
    expect(evaluate('tools', result({ choices: [{ message: { tool_calls: [] } }] })).status).toBe(
      'warn'
    );
    expect(evaluate('tools', result({})).status).toBe('warn');
  });

  it('fails when the provider rejects the tool schema outright', () => {
    expect(evaluate('tools', result({ error: 'tools unsupported' }, 400)).status).toBe('fail');
  });
});

describe('json_mode evaluation', () => {
  it('passes when the reply parses as JSON', () => {
    const outcome = evaluate(
      'json_mode',
      result({ choices: [{ message: { content: '{"ok":true}' } }] })
    );
    expect(outcome.status).toBe('pass');
  });

  it('warns when the reply is not JSON despite the request', () => {
    const outcome = evaluate('json_mode', result({ choices: [{ message: { content: 'nope' } }] }));
    expect(outcome.status).toBe('warn');
    expect(outcome.message.key).toBe('provider_debug.result.json_not_json');
  });

  it('warns when there is no content to parse', () => {
    expect(evaluate('json_mode', result({ choices: [{ message: {} }] })).status).toBe('warn');
  });

  it('fails when the provider rejects response_format', () => {
    expect(evaluate('json_mode', result({ error: 'unsupported' }, 400)).status).toBe('fail');
  });
});

describe('vision evaluation', () => {
  it('passes when the image part is accepted', () => {
    expect(evaluate('vision', result(CHAT_OK)).status).toBe('pass');
  });

  it('warns when accepted but nothing came back', () => {
    expect(evaluate('vision', result({ choices: [] })).status).toBe('warn');
  });

  it('fails when the provider rejects image input', () => {
    expect(evaluate('vision', result({ error: 'no vision' }, 400)).status).toBe('fail');
  });
});

describe('free check evaluation', () => {
  it('treats any answer as reachable, including 401', () => {
    expect(evaluate('reachability', result({}, 401)).status).toBe('pass');
  });

  it.each([
    [200, 'pass'],
    [401, 'fail'],
    [403, 'fail'],
    [404, 'warn'],
  ])('maps auth HTTP %i to %s', (status, expected) => {
    expect(evaluate('auth', result({ error: 'x' }, status)).status).toBe(expected);
  });

  it('reports catalog drift, emptiness, and agreement', () => {
    const models = { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] };
    expect(evaluate('catalog', result(models), { models: ['gpt-4o'] }).status).toBe('pass');
    expect(evaluate('catalog', result(models), { models: ['gpt-4o', 'ghost'] }).status).toBe('warn');
    expect(evaluate('catalog', result(models), { models: ['gpt-4o', '  '] }).status).toBe('pass');
    expect(evaluate('catalog', result({ data: [] })).status).toBe('warn');
    expect(evaluate('catalog', result('not json')).status).toBe('warn');
    expect(evaluate('catalog', result({ error: 'x' }, 500)).status).toBe('fail');
  });
});
