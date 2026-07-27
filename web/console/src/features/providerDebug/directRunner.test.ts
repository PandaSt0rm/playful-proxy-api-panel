import { describe, it, expect, vi } from 'vitest';
import type { ApiCallResult } from '@/services/api';
import { getDebugCheck } from './checks';
import {
  hostOf,
  runDirectCheck,
  runDirectPayload,
  runMatrixCell,
  type DirectRunnerDeps,
} from './directRunner';
import type { DebugCheckId, DebugRunUnit, DebugTarget } from './types';

const LIVE_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

const buildTarget = (overrides: Partial<DebugTarget> = {}): DebugTarget => ({
  providerLabel: 'openrouter',
  family: 'openai',
  baseUrl: 'https://api.example.com/v1',
  headers: {},
  keys: [{ apiKey: LIVE_KEY }],
  models: [],
  model: 'gpt-4o',
  ...overrides,
});

const buildUnit = (id: DebugCheckId, keyIndex: number | null = null): DebugRunUnit => {
  const check = getDebugCheck(id);
  if (!check) throw new Error(`unknown check ${id}`);
  return { id: keyIndex === null ? id : `${id}:${keyIndex}`, check, keyIndex };
};

const buildResult = (body: unknown, statusCode = 200): ApiCallResult => ({
  statusCode,
  header: { 'content-type': ['application/json'] },
  bodyText: typeof body === 'string' ? body : JSON.stringify(body),
  body: typeof body === 'string' ? null : body,
});

/** Elapsed time advances 10ms per reading, so latency assertions are exact. */
const buildDeps = (
  result: ApiCallResult | Error,
  overrides: Partial<DirectRunnerDeps> = {}
): DirectRunnerDeps & { request: ReturnType<typeof vi.fn> } => {
  let clock = 0;
  const request = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  );
  return { request, now: () => (clock += 10), ...overrides } as never;
};

const MODELS_OK = { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] };

describe('hostOf', () => {
  it('extracts the host for the hop chain', () => {
    expect(hostOf('https://api.example.com/v1/models')).toBe('api.example.com');
  });

  it('falls back to the raw value so a malformed url still renders', () => {
    expect(hostOf('not a url')).toBe('not a url');
  });
});

describe('runDirectCheck — preconditions', () => {
  it('fails without calling out when no base url is configured', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(buildUnit('reachability'), buildTarget({ baseUrl: '' }), deps);

    expect(trace.status).toBe('fail');
    expect(trace.message.key).toBe('provider_debug.result.no_base_url');
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('skips a credential check when the provider has no usable key', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(
      buildUnit('catalog'),
      buildTarget({ keys: [{ apiKey: '  ' }] }),
      deps
    );

    expect(trace.status).toBe('skipped');
    expect(trace.message.key).toBe('provider_debug.result.no_key');
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('skips a per-key check whose key index does not exist', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(buildUnit('auth', 7), buildTarget(), deps);

    expect(trace.status).toBe('skipped');
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('carries the unit identity onto the trace', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(buildUnit('auth', 0), buildTarget(), deps);

    expect(trace).toMatchObject({ id: 'auth:0', checkId: 'auth', keyIndex: 0, lane: 'direct' });
  });
});

describe('runDirectCheck — reachability', () => {
  it('sends no credential, so a bad key cannot masquerade as an outage', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    await runDirectCheck(buildUnit('reachability'), buildTarget(), deps);

    const [payload] = deps.request.mock.calls[0];
    expect(payload.header).toEqual({});
    expect(payload.authIndex).toBeUndefined();
    expect(payload.url).toBe('https://api.example.com/v1/models');
  });

  it('passes on 401, because the host answering is the thing being tested', async () => {
    const deps = buildDeps(buildResult({ error: 'unauthorized' }, 401));
    const trace = await runDirectCheck(buildUnit('reachability'), buildTarget(), deps);

    expect(trace.status).toBe('pass');
    expect(trace.message).toEqual({
      key: 'provider_debug.result.reachable',
      params: { status: 401 },
    });
  });

  it('records elapsed time as a single hop to the upstream host', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(buildUnit('reachability'), buildTarget(), deps);

    expect(trace.timing).toEqual({ totalMs: 10, hops: [{ name: 'api.example.com', ms: 10 }] });
  });
});

describe('runDirectCheck — auth', () => {
  it('passes when the key is accepted', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(buildUnit('auth', 0), buildTarget(), deps);

    expect(trace.status).toBe('pass');
    expect(trace.message.key).toBe('provider_debug.result.key_accepted');
  });

  it.each([401, 403])('fails with the upstream reason on HTTP %i', async (status) => {
    const deps = buildDeps(buildResult({ error: { message: 'Incorrect API key' } }, status));
    const trace = await runDirectCheck(buildUnit('auth', 0), buildTarget(), deps);

    expect(trace.status).toBe('fail');
    expect(trace.message.key).toBe('provider_debug.result.key_rejected');
    expect(String(trace.message.params?.detail)).toContain('Incorrect API key');
  });

  it('warns rather than fails on a status that says more about the endpoint than the key', async () => {
    const deps = buildDeps(buildResult({ error: 'not found' }, 404));
    const trace = await runDirectCheck(buildUnit('auth', 0), buildTarget(), deps);

    expect(trace.status).toBe('warn');
    expect(trace.message.key).toBe('provider_debug.result.key_inconclusive');
  });

  it('forwards authIndex so the request uses credential-scoped proxy selection', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    await runDirectCheck(
      buildUnit('auth', 0),
      buildTarget({ keys: [{ apiKey: LIVE_KEY, authIndex: ' 3 ' }] }),
      deps
    );

    expect(deps.request.mock.calls[0][0].authIndex).toBe('3');
  });

  it('omits authIndex for an unsaved draft key', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    await runDirectCheck(buildUnit('auth', 0), buildTarget(), deps);

    expect(deps.request.mock.calls[0][0].authIndex).toBeUndefined();
  });

  it('does not overwrite a deliberately configured Authorization header', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    await runDirectCheck(
      buildUnit('auth', 0),
      buildTarget({ headers: { Authorization: 'Custom scheme-value' } }),
      deps
    );

    expect(deps.request.mock.calls[0][0].header?.Authorization).toBe('Custom scheme-value');
  });

  it('layers per-key headers over the provider headers', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    await runDirectCheck(
      buildUnit('auth', 0),
      buildTarget({
        headers: { 'x-shared': 'provider', 'x-both': 'provider' },
        keys: [{ apiKey: LIVE_KEY, headers: { 'x-both': 'key' } }],
      }),
      deps
    );

    expect(deps.request.mock.calls[0][0].header).toMatchObject({
      'x-shared': 'provider',
      'x-both': 'key',
    });
  });
});

describe('runDirectCheck — catalog drift', () => {
  it('passes when every configured model is offered upstream', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(
      buildUnit('catalog'),
      buildTarget({ models: ['gpt-4o'] }),
      deps
    );

    expect(trace.status).toBe('pass');
    expect(trace.message).toEqual({
      key: 'provider_debug.result.catalog_ok',
      params: { upstream: 2, configured: 1 },
    });
  });

  it('warns and names the models the upstream does not offer', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(
      buildUnit('catalog'),
      buildTarget({ models: ['gpt-4o', 'gpt-5-turbo'] }),
      deps
    );

    expect(trace.status).toBe('warn');
    expect(trace.message.params).toEqual({ count: 1, models: 'gpt-5-turbo', upstream: 2 });
  });

  it('ignores blank entries in the configured model list', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(
      buildUnit('catalog'),
      buildTarget({ models: ['gpt-4o', '   '] }),
      deps
    );

    expect(trace.status).toBe('pass');
  });

  it('warns when the upstream returns no models at all', async () => {
    const deps = buildDeps(buildResult({ data: [] }));
    const trace = await runDirectCheck(buildUnit('catalog'), buildTarget(), deps);

    expect(trace.status).toBe('warn');
    expect(trace.message.key).toBe('provider_debug.result.catalog_empty');
  });

  it('falls back to the raw body text when the response is not json', async () => {
    const deps = buildDeps(buildResult('not json at all'));
    const trace = await runDirectCheck(buildUnit('catalog'), buildTarget(), deps);

    expect(trace.status).toBe('warn');
    expect(trace.message.key).toBe('provider_debug.result.catalog_empty');
  });

  it('fails on a non-2xx catalog response', async () => {
    const deps = buildDeps(buildResult({ error: { message: 'nope' } }, 500));
    const trace = await runDirectCheck(buildUnit('catalog'), buildTarget(), deps);

    expect(trace.status).toBe('fail');
    expect(trace.message.key).toBe('provider_debug.result.catalog_failed');
  });

  it('authenticates with the first usable key when several are configured', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    await runDirectCheck(
      buildUnit('catalog'),
      buildTarget({ keys: [{ apiKey: '' }, { apiKey: LIVE_KEY }] }),
      deps
    );

    expect(deps.request.mock.calls[0][0].header?.Authorization).toContain('Bearer');
  });
});

describe('runDirectCheck — transport failures', () => {
  it('reports the proxy transport detail, which is the whole diagnosis', async () => {
    const error = Object.assign(new Error('Request failed'), {
      details: { detail: 'dial tcp: connection refused' },
    });
    const trace = await runDirectCheck(buildUnit('reachability'), buildTarget(), buildDeps(error));

    expect(trace.status).toBe('fail');
    expect(trace.message).toEqual({
      key: 'provider_debug.result.unreachable',
      params: { detail: 'dial tcp: connection refused' },
    });
    expect(trace.response).toBeUndefined();
  });

  it('falls back to the error message when the proxy gave no detail', async () => {
    const trace = await runDirectCheck(
      buildUnit('reachability'),
      buildTarget(),
      buildDeps(new Error('Network Error'))
    );

    expect(trace.message.params).toEqual({ detail: 'Network Error' });
  });

  it('survives a non-Error rejection', async () => {
    let clock = 0;
    const deps: DirectRunnerDeps = {
      request: () => Promise.reject('socket hang up') as never,
      now: () => (clock += 10),
    };
    const trace = await runDirectCheck(buildUnit('reachability'), buildTarget(), deps);

    expect(trace.status).toBe('fail');
    expect(trace.message.params).toEqual({ detail: 'socket hang up' });
  });

  it('still records the attempted request so the operator sees what was sent', async () => {
    const trace = await runDirectCheck(
      buildUnit('reachability'),
      buildTarget(),
      buildDeps(new Error('boom'))
    );

    expect(trace.request).toMatchObject({
      method: 'GET',
      url: 'https://api.example.com/v1/models',
    });
  });
});

describe('runDirectCheck — redaction', () => {
  it('never puts a live key in the request snapshot', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(buildUnit('auth', 0), buildTarget(), deps);

    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain(LIVE_KEY);
    expect(serialized).toContain('••••');
    // The prefix survives so an operator can tell which key was used.
    expect(serialized).toContain('sk-proj-');
  });

  it('masks a credential echoed back inside the response body', async () => {
    const deps = buildDeps(buildResult({ error: { message: `bad key ${LIVE_KEY}` } }, 401));
    const trace = await runDirectCheck(buildUnit('auth', 0), buildTarget(), deps);

    expect(trace.response?.body).not.toContain(LIVE_KEY);
    expect(JSON.stringify(trace)).not.toContain(LIVE_KEY);
  });

  it('flattens multi-value response headers for the trace view', async () => {
    const deps = buildDeps({
      statusCode: 200,
      header: { 'set-cookie': ['a=1', 'b=2'], 'content-type': ['application/json'] },
      bodyText: JSON.stringify(MODELS_OK),
      body: MODELS_OK,
    });
    const trace = await runDirectCheck(buildUnit('reachability'), buildTarget(), deps);

    const names = trace.response?.headers.map(([name]) => name);
    expect(names).toEqual(['set-cookie', 'set-cookie', 'content-type']);
  });
});

describe('runDirectCheck — billable checks', () => {
  it('skips a capability check when no model is selected, before spending anything', () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    return runDirectCheck(buildUnit('completion'), buildTarget({ model: '' }), deps).then(
      (trace) => {
        expect(trace.status).toBe('skipped');
        expect(trace.message.key).toBe('provider_debug.result.no_model');
        expect(deps.request).not.toHaveBeenCalled();
      }
    );
  });

  it('POSTs a json body with the selected model', async () => {
    const deps = buildDeps(buildResult({ choices: [{ message: { content: 'OK' } }] }));
    await runDirectCheck(buildUnit('completion'), buildTarget(), deps);

    const [payload] = deps.request.mock.calls[0];
    expect(payload.method).toBe('POST');
    expect(payload.url).toBe('https://api.example.com/v1/chat/completions');
    expect(payload.header?.['Content-Type']).toBe('application/json');
    expect(JSON.parse(payload.data as string)).toMatchObject({ model: 'gpt-4o', stream: false });
  });

  it('records the request body on the trace so the transcript is complete', async () => {
    const deps = buildDeps(buildResult({ choices: [{ message: { content: 'OK' } }] }));
    const trace = await runDirectCheck(buildUnit('completion'), buildTarget(), deps);

    expect(trace.request?.body).toContain('"model": "gpt-4o"');
  });
});

describe('runMatrixCell', () => {
  it('runs one intersection as a completion against that cell\'s key and model', async () => {
    const deps = buildDeps(buildResult({ choices: [{ message: { content: 'OK' } }] }));
    const trace = await runMatrixCell(
      { id: 'matrix:1:gpt-4o-mini', keyIndex: 1, model: 'gpt-4o-mini' },
      buildTarget({ keys: [{ apiKey: 'sk-first-key-value' }, { apiKey: LIVE_KEY }] }),
      deps
    );

    expect(trace).toMatchObject({ id: 'matrix:1:gpt-4o-mini', checkId: 'completion', keyIndex: 1 });
    expect(trace.status).toBe('pass');
    const [payload] = deps.request.mock.calls[0];
    expect(JSON.parse(payload.data as string).model).toBe('gpt-4o-mini');
    // Uses the cell's own key, not the provider's first key.
    expect(payload.header?.Authorization).toContain('sk-proj-');
  });
});

describe('runDirectPayload', () => {
  it('sends the operator’s own body to the family completion endpoint', async () => {
    const deps = buildDeps(buildResult({ choices: [{ message: { content: 'OK' } }] }));
    const body = '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}';
    const trace = await runDirectPayload(body, buildTarget(), deps);

    const [payload] = deps.request.mock.calls[0];
    expect(payload.method).toBe('POST');
    expect(payload.url).toBe('https://api.example.com/v1/chat/completions');
    expect(payload.data).toBe(body);
    expect(trace).toMatchObject({ id: 'payload', checkId: 'payload', status: 'pass' });
  });

  it('reports a rejection as a failure with the upstream status', async () => {
    const deps = buildDeps(buildResult({ error: 'bad request' }, 400));
    const trace = await runDirectPayload('{"model":"gpt-4o"}', buildTarget(), deps);

    expect(trace.status).toBe('fail');
    expect(trace.message).toEqual({
      key: 'provider_debug.result.payload_failed',
      params: { status: 400 },
    });
  });

  it('needs a base url and a key before it will send anything', async () => {
    const deps = buildDeps(buildResult({}));
    const noBase = await runDirectPayload('{}', buildTarget({ baseUrl: '' }), deps);
    expect(noBase.status).toBe('fail');
    expect(noBase.message.key).toBe('provider_debug.result.no_base_url');

    const noKey = await runDirectPayload('{}', buildTarget({ keys: [{ apiKey: '' }] }), deps);
    expect(noKey.status).toBe('skipped');
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('skips a family whose generative wire format this console does not model', async () => {
    const deps = buildDeps(buildResult({}));
    const trace = await runDirectPayload('{}', buildTarget({ family: 'generic' }), deps);

    expect(trace.status).toBe('skipped');
    expect(trace.message.key).toBe('provider_debug.result.family_unsupported');
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('forwards authIndex and reports a transport failure as a result', async () => {
    const withIndex = buildDeps(buildResult({ choices: [{ message: {} }] }));
    await runDirectPayload(
      '{}',
      buildTarget({ keys: [{ apiKey: LIVE_KEY, authIndex: '2' }] }),
      withIndex
    );
    expect(withIndex.request.mock.calls[0][0].authIndex).toBe('2');

    const trace = await runDirectPayload('{}', buildTarget(), buildDeps(new Error('refused')));
    expect(trace.status).toBe('fail');
    expect(trace.message.key).toBe('provider_debug.result.unreachable');
  });
});

describe('runDirectCheck — unsupported family', () => {
  it('skips rather than guessing a request shape it does not model', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    const trace = await runDirectCheck(
      buildUnit('vision'),
      buildTarget({ family: 'generic' }),
      deps
    );

    expect(trace.status).toBe('skipped');
    expect(trace.message.key).toBe('provider_debug.result.family_unsupported');
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('sends the credential header the family actually uses', async () => {
    const deps = buildDeps(buildResult(MODELS_OK));
    await runDirectCheck(buildUnit('auth', 0), buildTarget({ family: 'claude' }), deps);

    const [payload] = deps.request.mock.calls[0];
    expect(payload.header?.['x-api-key']).toContain('sk-proj-');
    expect(payload.header?.Authorization).toBeUndefined();
  });
});
