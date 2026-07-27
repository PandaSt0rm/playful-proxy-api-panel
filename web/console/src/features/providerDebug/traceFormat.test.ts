import { describe, it, expect } from 'vitest';
import { formatTraceText } from './traceFormat';
import type { DebugTrace } from './types';

const buildTrace = (overrides: Partial<DebugTrace> = {}): DebugTrace => ({
  id: 'auth:0',
  checkId: 'auth',
  keyIndex: 0,
  lane: 'direct',
  status: 'pass',
  message: { key: 'provider_debug.result.key_accepted' },
  timing: { totalMs: 312, hops: [{ name: 'api.example.com', ms: 312 }] },
  ...overrides,
});

const parts = { label: 'auth · key #1', message: 'Key accepted' };

describe('formatTraceText', () => {
  it('leads with the outcome so a pasted trace reads top-down', () => {
    const text = formatTraceText(buildTrace(), parts);
    expect(text.split('\n').slice(0, 2)).toEqual([
      '[pass] auth · key #1 · direct · 312 ms',
      'Key accepted',
    ]);
  });

  it('renders the request in curl transcript form', () => {
    const text = formatTraceText(
      buildTrace({
        request: {
          method: 'GET',
          url: 'https://api.example.com/v1/models',
          headers: [['authorization', 'Bearer sk-proj-••••6789']],
        },
      }),
      parts
    );

    expect(text).toContain('> GET https://api.example.com/v1/models');
    expect(text).toContain('> authorization: Bearer sk-proj-••••6789');
  });

  it('renders the response with its status and headers', () => {
    const text = formatTraceText(
      buildTrace({
        response: {
          status: 200,
          headers: [['content-type', 'application/json']],
          body: '{\n  "ok": true\n}',
        },
      }),
      parts
    );

    expect(text).toContain('< HTTP 200');
    expect(text).toContain('< content-type: application/json');
    expect(text).toContain('<   "ok": true');
  });

  it('prefixes every line of a multi-line body so the transcript stays aligned', () => {
    const text = formatTraceText(
      buildTrace({
        request: {
          method: 'POST',
          url: 'https://api.example.com/v1/chat/completions',
          headers: [],
          body: '{\n  "model": "gpt-4o"\n}',
        },
      }),
      parts
    );

    expect(text).toContain('> {');
    expect(text).toContain('>   "model": "gpt-4o"');
    expect(text).toContain('> }');
  });

  it('omits the request and response blocks when nothing was exchanged', () => {
    const text = formatTraceText(buildTrace({ status: 'skipped' }), parts);
    expect(text).not.toContain('>');
    expect(text).not.toContain('<');
  });

  it('omits an empty body rather than emitting a bare gutter', () => {
    const text = formatTraceText(
      buildTrace({ response: { status: 204, headers: [], body: '' } }),
      parts
    );

    expect(text).toContain('< HTTP 204');
    expect(text.trimEnd().endsWith('< HTTP 204')).toBe(true);
  });
});
