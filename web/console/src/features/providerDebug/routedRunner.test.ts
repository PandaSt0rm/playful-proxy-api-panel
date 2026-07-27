import { describe, it, expect, vi } from 'vitest';
import type { DiagnosticResult } from '@/services/api/aiproxy';
import { getDebugCheck } from './checks';
import {
  routedCheckKind,
  runRoutedCheck,
  runRoutedPayload,
  supportsRoutedLane,
} from './routedRunner';
import type { DebugCheckId, DebugRunUnit, DebugTarget } from './types';

const LIVE_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

const buildTarget = (overrides: Partial<DebugTarget> = {}): DebugTarget => ({
  providerLabel: 'openrouter',
  family: 'openai',
  baseUrl: 'https://api.example.com/v1',
  headers: {},
  keys: [{ apiKey: LIVE_KEY, authIndex: '3' }],
  models: ['gpt-4o'],
  model: 'gpt-4o',
  routedKind: 'openai-compatibility',
  ...overrides,
});

const buildUnit = (id: DebugCheckId): DebugRunUnit => {
  const check = getDebugCheck(id);
  if (!check) throw new Error(`unknown check ${id}`);
  return { id, check, keyIndex: null };
};

const buildResult = (overrides: Partial<DiagnosticResult> = {}): DiagnosticResult => ({
  id: 'diag-1',
  checked_at: '2026-07-27T00:00:00Z',
  target: { kind: 'openai-compatibility', auth_index: '3', label: 'openrouter' },
  check: 'completion',
  status: 'pass',
  latency_ms: 612,
  category: 'ok',
  message: 'Completion succeeded through the router',
  ...overrides,
});

const buildDeps = (result: DiagnosticResult | Error) => {
  let clock = 0;
  return {
    runDiagnostic: vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    ),
    now: () => (clock += 10),
  };
};

const routed = { kind: 'openai-compatibility', authIndex: '3' };

describe('routed check mapping', () => {
  it('maps the console checks that have a server-side equivalent', () => {
    expect(routedCheckKind('completion')).toBe('completion');
    expect(routedCheckKind('catalog')).toBe('catalog');
    expect(routedCheckKind('tools')).toBe('tools');
    expect(routedCheckKind('json_mode')).toBe('json_mode');
  });

  it('maps the direct SSE shape check onto the real streaming check', () => {
    // They measure different things: buffered shape validation versus a live stream.
    expect(routedCheckKind('sse_format')).toBe('streaming');
  });

  it('has no equivalent for the browser-only checks', () => {
    expect(supportsRoutedLane('reachability')).toBe(false);
    expect(supportsRoutedLane('auth')).toBe(false);
    expect(supportsRoutedLane('vision')).toBe(false);
    expect(routedCheckKind('reachability')).toBeUndefined();
  });
});

describe('runRoutedCheck', () => {
  it('skips a check the router cannot run rather than reporting a failure', async () => {
    const deps = buildDeps(buildResult());
    const trace = await runRoutedCheck(buildUnit('reachability'), buildTarget(), routed, deps, 'run-1');

    expect(trace.status).toBe('skipped');
    expect(trace.message.key).toBe('provider_debug.result.routed_unsupported');
    expect(deps.runDiagnostic).not.toHaveBeenCalled();
  });

  it('addresses the saved credential and forwards the run id', async () => {
    const deps = buildDeps(buildResult());
    await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-7');

    expect(deps.runDiagnostic).toHaveBeenCalledWith({
      target: { kind: 'openai-compatibility', auth_index: '3' },
      check: 'completion',
      acknowledge_billable: true,
      model: 'gpt-4o',
      run_id: 'run-7',
    });
  });

  it('does not acknowledge billing for a free check', async () => {
    const deps = buildDeps(buildResult({ check: 'catalog' }));
    await runRoutedCheck(buildUnit('catalog'), buildTarget(), routed, deps, 'run-1');

    expect(deps.runDiagnostic.mock.calls[0][0]).toMatchObject({ acknowledge_billable: false });
  });

  it('renders a three-node hop chain, because the router really is a hop', async () => {
    const deps = buildDeps(buildResult());
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(trace.lane).toBe('routed');
    expect(trace.timing.hops).toEqual([
      { name: 'aiproxy', ms: 0 },
      { name: 'openrouter', ms: 612 },
    ]);
  });

  it('surfaces the translation pair the router actually used', async () => {
    const deps = buildDeps(
      buildResult({
        detail: { route: { source_format: 'openai', target_format: 'claude' } },
      })
    );
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(trace.meta).toMatchObject({ sourceFormat: 'openai', targetFormat: 'claude' });
    expect(trace.request?.body).toContain('claude');
  });

  it('ignores route fields the server reported with an unexpected type', async () => {
    const deps = buildDeps(
      buildResult({ detail: { route: { source_format: 42, target_format: 'claude' } } })
    );
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(trace.meta?.sourceFormat).toBeUndefined();
    expect(trace.meta?.targetFormat).toBe('claude');
  });

  it('reports time to first chunk and chunk count for a streaming check', async () => {
    const deps = buildDeps(
      buildResult({ detail: { stream: { ttft_ms: 210, chunk_count: 12 } } })
    );
    const trace = await runRoutedCheck(buildUnit('sse_format'), buildTarget(), routed, deps, 'run-1');

    expect(trace.timing.ttftMs).toBe(210);
    expect(trace.meta?.chunkCount).toBe(12);
  });

  it('omits stream figures the server did not report', async () => {
    const deps = buildDeps(buildResult({ detail: { stream: { chunk_count: 'many' } } }));
    const trace = await runRoutedCheck(buildUnit('sse_format'), buildTarget(), routed, deps, 'run-1');

    expect(trace.timing.ttftMs).toBeUndefined();
    expect(trace.meta?.chunkCount).toBeUndefined();
  });

  it('tolerates a result with no detail at all', async () => {
    const trace = await runRoutedCheck(
      buildUnit('completion'),
      buildTarget(),
      routed,
      buildDeps(buildResult({ detail: undefined })),
      'run-1'
    );

    expect(trace.status).toBe('pass');
    expect(trace.response?.headers).toEqual([]);
  });

  it('tolerates detail whose route and stream are not objects', async () => {
    const trace = await runRoutedCheck(
      buildUnit('completion'),
      buildTarget(),
      routed,
      buildDeps(buildResult({ detail: { route: 'nope', stream: 7 } })),
      'run-1'
    );

    expect(trace.status).toBe('pass');
    expect(trace.meta?.sourceFormat).toBeUndefined();
  });

  it('flattens upstream response headers, single and multi valued', async () => {
    const deps = buildDeps(
      buildResult({
        detail: {
          upstream_response_headers: {
            'x-request-id': ['req_1'],
            'content-type': 'application/json',
          },
        },
      })
    );
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(trace.response?.headers).toEqual([
      ['x-request-id', 'req_1'],
      ['content-type', 'application/json'],
    ]);
  });

  it('carries the http status through when the provider gave one', async () => {
    const deps = buildDeps(buildResult({ status: 'fail', http_status: 429, category: 'http_429' }));
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(trace.status).toBe('fail');
    expect(trace.response?.status).toBe(429);
  });

  it('defaults the status when the router reported none', async () => {
    const deps = buildDeps(buildResult());
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(trace.response?.status).toBe(0);
  });

  it('masks a credential the router echoed back in its message or body', async () => {
    const deps = buildDeps(
      buildResult({
        status: 'fail',
        message: `rejected key ${LIVE_KEY}`,
        detail: { response_body: `{"error":"${LIVE_KEY}"}` },
      })
    );
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(JSON.stringify(trace)).not.toContain(LIVE_KEY);
    expect(JSON.stringify(trace)).toContain('••••');
  });

  it('ignores a non-string response body', async () => {
    const deps = buildDeps(buildResult({ detail: { response_body: { not: 'a string' } } }));
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, deps, 'run-1');

    expect(trace.response?.body).toBeUndefined();
  });

  it('reports a transport failure as a result rather than throwing', async () => {
    const trace = await runRoutedCheck(
      buildUnit('completion'),
      buildTarget(),
      routed,
      buildDeps(new Error('management api unreachable')),
      'run-1'
    );

    expect(trace.status).toBe('fail');
    expect(trace.message).toEqual({
      key: 'provider_debug.result.routed_failed',
      params: { detail: 'management api unreachable' },
    });
    expect(trace.timing.totalMs).toBe(10);
  });

  it('survives a non-Error rejection', async () => {
    let clock = 0;
    const trace = await runRoutedCheck(buildUnit('completion'), buildTarget(), routed, {
      runDiagnostic: () => Promise.reject('socket hang up') as never,
      now: () => (clock += 10),
    }, 'run-1');

    expect(trace.message.params).toEqual({ detail: 'socket hang up' });
  });
});

describe('runRoutedPayload', () => {
  it('sends the parsed body through the router', async () => {
    const deps = buildDeps(buildResult({ check: 'payload' }));
    const trace = await runRoutedPayload(
      '{"model":"gpt-4o","messages":[]}',
      buildTarget(),
      routed,
      deps,
      'lab'
    );

    expect(deps.runDiagnostic).toHaveBeenCalledWith({
      target: { kind: 'openai-compatibility', auth_index: '3' },
      check: 'payload',
      acknowledge_billable: true,
      payload: { model: 'gpt-4o', messages: [] },
      model: 'gpt-4o',
      run_id: 'lab',
    });
    expect(trace).toMatchObject({ id: 'payload', checkId: 'payload', lane: 'routed' });
  });

  it('refuses invalid JSON before spending anything', async () => {
    const deps = buildDeps(buildResult());
    const trace = await runRoutedPayload('{not json', buildTarget(), routed, deps, 'lab');

    expect(trace.status).toBe('fail');
    expect(trace.message.key).toBe('provider_debug.result.payload_invalid');
    // The parser reports an Error, so the operator gets its position, not "[object Object]".
    expect(String(trace.message.params?.detail).length).toBeGreaterThan(0);
    expect(deps.runDiagnostic).not.toHaveBeenCalled();
  });

  it('reports a non-Error parse rejection without crashing', async () => {
    const deps = buildDeps(buildResult());
    const original = JSON.parse;
    // JSON.parse is specified to throw SyntaxError, but the guard must not assume it.
    JSON.parse = () => {
      throw 'unparseable';
    };
    try {
      const trace = await runRoutedPayload('{}', buildTarget(), routed, deps, 'lab');
      expect(trace.message.params).toEqual({ detail: 'unparseable' });
    } finally {
      JSON.parse = original;
    }
  });

  it('masks a credential in the echoed payload and response', async () => {
    const deps = buildDeps(
      buildResult({ detail: { response_body: `{"key":"${LIVE_KEY}"}` } })
    );
    const trace = await runRoutedPayload(
      `{"api_key":"${LIVE_KEY}"}`,
      buildTarget(),
      routed,
      deps,
      'lab'
    );

    expect(JSON.stringify(trace)).not.toContain(LIVE_KEY);
  });

  it('reports a transport failure as a result', async () => {
    const trace = await runRoutedPayload(
      '{}',
      buildTarget(),
      routed,
      buildDeps(new Error('gateway down')),
      'lab'
    );
    expect(trace.status).toBe('fail');
    expect(trace.message.params).toEqual({ detail: 'gateway down' });
  });

  it('ignores a non-string response body and defaults the status', async () => {
    const deps = buildDeps(buildResult({ detail: { response_body: 12 } }));
    const trace = await runRoutedPayload('{}', buildTarget(), routed, deps, 'lab');
    expect(trace.response?.body).toBeUndefined();
    expect(trace.response?.status).toBe(0);
  });
});

describe('runRoutedPayload — non-Error rejection', () => {
  it('survives a rejection that is not an Error', async () => {
    let clock = 0;
    const trace = await runRoutedPayload('{}', buildTarget(), routed, {
      runDiagnostic: () => Promise.reject('socket hang up') as never,
      now: () => (clock += 10),
    }, 'lab');

    expect(trace.status).toBe('fail');
    expect(trace.message.params).toEqual({ detail: 'socket hang up' });
  });
});
