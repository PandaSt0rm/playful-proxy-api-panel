/**
 * Routed lane: the check runs through `authManager.Execute` on the server, so it exercises
 * the real translator, credential selection, and executor path rather than talking to the
 * provider directly.
 *
 * This is the lane that answers "is the failure the provider's or AIPROXY's". It needs a
 * saved credential, because the router can only route what it has been configured with.
 *
 * The request pane it produces is the *routed* request as the server reported it — source
 * format, target format, and selected model — not byte-exact upstream wire bytes. It is
 * labelled that way in the UI rather than implying a fidelity the capture does not have.
 */

import type { DiagnosticResult } from '@/services/api/aiproxy';
import { redactDeep, redactSecretText } from '@/utils/redact';
import type {
  DebugCheckId,
  DebugRunUnit,
  DebugStatus,
  DebugTarget,
  DebugTrace,
} from './types';

/** Console check ids that have a server-side equivalent, and what it is called there. */
const ROUTED_CHECK_KINDS: Partial<Record<DebugCheckId, string>> = {
  catalog: 'catalog',
  completion: 'completion',
  // The direct lane can only validate the shape of a buffered SSE body; the routed lane
  // measures a real stream, so the two are deliberately different checks.
  sse_format: 'streaming',
  tools: 'tools',
  json_mode: 'json_mode',
};

export function routedCheckKind(checkId: DebugCheckId): string | undefined {
  return ROUTED_CHECK_KINDS[checkId];
}

export function supportsRoutedLane(checkId: DebugCheckId): boolean {
  return routedCheckKind(checkId) !== undefined;
}

export interface RoutedRunnerDeps {
  runDiagnostic: (payload: Record<string, unknown>) => Promise<DiagnosticResult>;
  now: () => number;
}

/** What the console needs from the target to address a saved credential. */
export interface RoutedTarget {
  kind: string;
  authIndex: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

function readRoute(detail: Record<string, unknown> | undefined) {
  const route = detail?.route;
  if (!isRecord(route)) return {};
  const text = (key: string) => (typeof route[key] === 'string' ? (route[key] as string) : undefined);
  return { sourceFormat: text('source_format'), targetFormat: text('target_format') };
}

function readStream(detail: Record<string, unknown> | undefined) {
  const stream = detail?.stream;
  if (!isRecord(stream)) return {};
  const number = (key: string) => (typeof stream[key] === 'number' ? (stream[key] as number) : undefined);
  return { ttftMs: number('ttft_ms'), chunkCount: number('chunk_count') };
}

/**
 * Builds the hop chain. The routed lane always has three nodes — the operator, the router,
 * and the provider — and only the total is measured, so the router leg is reported as zero
 * rather than invented.
 */
function routedHops(latencyMs: number, providerLabel: string) {
  return [
    { name: 'aiproxy', ms: 0 },
    { name: providerLabel, ms: latencyMs },
  ];
}

export async function runRoutedCheck(
  unit: DebugRunUnit,
  target: DebugTarget,
  routed: RoutedTarget,
  deps: RoutedRunnerDeps,
  runId: string
): Promise<DebugTrace> {
  const base = {
    id: unit.id,
    checkId: unit.check.id,
    keyIndex: unit.keyIndex,
    lane: 'routed' as const,
  };
  const check = routedCheckKind(unit.check.id);
  if (!check) {
    return {
      ...base,
      status: 'skipped',
      message: { key: 'provider_debug.result.routed_unsupported' },
      timing: { totalMs: 0, hops: [] },
    };
  }

  const startedAt = deps.now();
  try {
    const result = await deps.runDiagnostic({
      target: { kind: routed.kind, auth_index: routed.authIndex },
      check,
      acknowledge_billable: unit.check.billable,
      model: target.model,
      run_id: runId,
    });

    const detail = result.detail;
    const route = readRoute(detail);
    const stream = readStream(detail);
    const responseBody =
      typeof detail?.response_body === 'string' ? redactSecretText(detail.response_body) : undefined;

    return {
      ...base,
      status: result.status as DebugStatus,
      message: {
        key: 'provider_debug.result.routed',
        params: { message: redactSecretText(result.message), category: result.category },
      },
      request: {
        method: 'POST',
        url: `${routed.kind} · ${routed.authIndex}`,
        headers: [],
        body: JSON.stringify(redactDeep(detail?.route ?? {}), null, 2),
      },
      response: {
        status: result.http_status ?? 0,
        headers: readHeaders(detail),
        body: responseBody,
      },
      timing: {
        totalMs: result.latency_ms,
        ...(stream.ttftMs === undefined ? {} : { ttftMs: stream.ttftMs }),
        hops: routedHops(result.latency_ms, target.providerLabel),
      },
      meta: {
        model: target.model,
        authIndex: routed.authIndex,
        ...route,
        ...(stream.chunkCount === undefined ? {} : { chunkCount: stream.chunkCount }),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      status: 'fail',
      message: {
        key: 'provider_debug.result.routed_failed',
        params: { detail: redactSecretText(message) },
      },
      timing: { totalMs: deps.now() - startedAt, hops: [] },
    };
  }
}

function readHeaders(detail: Record<string, unknown> | undefined): [string, string][] {
  const headers = detail?.upstream_response_headers;
  if (!isRecord(headers)) return [];
  return Object.entries(headers).flatMap(([name, values]) =>
    Array.isArray(values)
      ? values.map((value): [string, string] => [name, redactSecretText(String(value))])
      : [[name, redactSecretText(String(values))] as [string, string]]
  );
}

/**
 * Sends a caller-supplied body through the router, so the lab can compare the same request
 * on both lanes: if it succeeds direct and fails routed, the fault is AIPROXY's.
 */
export async function runRoutedPayload(
  body: string,
  target: DebugTarget,
  routed: RoutedTarget,
  deps: RoutedRunnerDeps,
  runId: string
): Promise<DebugTrace> {
  const base = { id: 'payload', checkId: 'payload' as const, keyIndex: null, lane: 'routed' as const };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ...base,
      status: 'fail',
      message: {
        key: 'provider_debug.result.payload_invalid',
        params: { detail: error instanceof Error ? error.message : String(error) },
      },
      timing: { totalMs: 0, hops: [] },
    };
  }

  const startedAt = deps.now();
  try {
    const result = await deps.runDiagnostic({
      target: { kind: routed.kind, auth_index: routed.authIndex },
      check: 'payload',
      acknowledge_billable: true,
      payload: parsed,
      model: target.model,
      run_id: runId,
    });
    const detail = result.detail;
    const responseBody =
      typeof detail?.response_body === 'string' ? redactSecretText(detail.response_body) : undefined;

    return {
      ...base,
      status: result.status as DebugStatus,
      message: {
        key: 'provider_debug.result.routed',
        params: { message: redactSecretText(result.message), category: result.category },
      },
      request: {
        method: 'POST',
        url: `${routed.kind} · ${routed.authIndex}`,
        headers: [],
        body: JSON.stringify(redactDeep(parsed), null, 2),
      },
      response: {
        status: result.http_status ?? 0,
        headers: readHeaders(detail),
        body: responseBody,
      },
      timing: {
        totalMs: result.latency_ms,
        hops: routedHops(result.latency_ms, target.providerLabel),
      },
      meta: { model: target.model, authIndex: routed.authIndex, ...readRoute(detail) },
    };
  } catch (error) {
    return {
      ...base,
      status: 'fail',
      message: {
        key: 'provider_debug.result.routed_failed',
        params: { detail: redactSecretText(error instanceof Error ? error.message : String(error)) },
      },
      timing: { totalMs: deps.now() - startedAt, hops: [] },
    };
  }
}
