/**
 * Direct lane: the browser builds the upstream request and sends it through the
 * management `/api-call` proxy, so the captured exchange is the real wire traffic and the
 * checks work against unsaved draft configuration.
 *
 * Every trace is redacted at construction. Nothing unmasked reaches the returned value,
 * because that value goes straight into component state, the clipboard, and — on the
 * routed lane — persistent storage.
 *
 * Dependencies are injected rather than imported so this module stays pure and fully
 * testable; `useDebugRun` supplies the real API client and clock.
 */

import type { AxiosRequestConfig } from 'axios';
import type { ApiCallRequest, ApiCallResult } from '@/services/api';
import { getApiErrorDetail } from '@/services/api';
import { formatApiCallResultDetail } from '@/components/providers/utils';
import { hasHeader } from '@/utils/headers';
import { redactHeaderEntries, redactSecretText } from '@/utils/redact';
import { familyAuthHeaderName, familyAuthHeaders, resolveSpec } from './families';
import type {
  DebugKey,
  DebugMatrixCell,
  DebugRequestSnapshot,
  DebugResponseSnapshot,
  DebugRunUnit,
  DebugTarget,
  DebugTrace,
  RegistryCheckId,
} from './types';

const DIRECT_TIMEOUT_MS = 60_000;

export interface DirectRunnerDeps {
  request: (payload: ApiCallRequest, config?: AxiosRequestConfig) => Promise<ApiCallResult>;
  /** Monotonic elapsed-time source. Injected so tests get deterministic latencies. */
  now: () => number;
  signal?: AbortSignal;
}

/**
 * `performance.now()` is sub-millisecond, and a raw reading renders as
 * "13.599999994039536 ms" — which reads as a broken number, not a fast request.
 */
const elapsedMs = (from: number, to: number): number => Math.round(to - from);

/**
 * Either the upstream answered or it did not. Modelling that as a union rather than a bag
 * of optionals means the caller cannot read a response that was never received.
 */
type Exchange =
  | {
      ok: true;
      request: DebugRequestSnapshot;
      response: DebugResponseSnapshot;
      result: ApiCallResult;
      elapsedMs: number;
    }
  | { ok: false; request: DebugRequestSnapshot; transportError: string; elapsedMs: number };

/** Host for the hop chain. Falls back to the raw value so a malformed URL still renders. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function buildHeaders(target: DebugTarget, key?: DebugKey): Record<string, string> {
  const headers: Record<string, string> = { ...target.headers, ...(key?.headers ?? {}) };
  // A custom credential header is deliberate configuration; do not overwrite it. Which
  // header that is depends on the family — Anthropic and Google do not use bearer tokens.
  if (key && !hasHeader(headers, familyAuthHeaderName(target.family))) {
    Object.assign(headers, familyAuthHeaders(target.family, key.apiKey.trim()));
  }
  return headers;
}

function toHeaderEntries(header: Record<string, string[]>): [string, string][] {
  return Object.entries(header).flatMap(([name, values]) =>
    values.map((value): [string, string] => [name, value])
  );
}

async function exchange(
  payload: ApiCallRequest,
  headers: Record<string, string>,
  deps: DirectRunnerDeps,
  /** Formatted for reading. The wire gets the compact `payload.data`. */
  displayBody?: string
): Promise<Exchange> {
  const snapshot: DebugRequestSnapshot = {
    method: payload.method,
    url: payload.url,
    headers: redactHeaderEntries(Object.entries(headers)),
    ...(displayBody === undefined ? {} : { body: redactSecretText(displayBody) }),
  };

  const startedAt = deps.now();
  try {
    const result = await deps.request(payload, {
      timeout: DIRECT_TIMEOUT_MS,
      signal: deps.signal,
    });
    return {
      ok: true,
      request: snapshot,
      result,
      response: {
        status: result.statusCode,
        headers: redactHeaderEntries(toHeaderEntries(result.header)),
        body: redactSecretText(formatApiCallResultDetail(result)),
      },
      elapsedMs: elapsedMs(startedAt, deps.now()),
    };
  } catch (error) {
    // The management proxy answers 502 with a transport detail when the upstream request
    // never completed (DNS, TLS, refused, timeout). That detail is the whole diagnosis.
    const detail = getApiErrorDetail(error);
    const fallback = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      request: snapshot,
      transportError: redactSecretText(detail || fallback),
      elapsedMs: elapsedMs(startedAt, deps.now()),
    };
  }
}

/** Picks the credential a provider-wide check should authenticate with. */
function primaryKey(target: DebugTarget): DebugKey | undefined {
  return target.keys.find((key) => key.apiKey.trim());
}

interface TraceIdentity {
  id: string;
  /** Registry checks only: the payload lab has its own runner, not a spec. */
  checkId: RegistryCheckId;
  keyIndex: number | null;
}

/**
 * Shared driver for every direct-lane call: resolve the spec, build the request, run the
 * exchange, evaluate. Used by both the check rail and the model matrix.
 */
async function runSpec(
  identity: TraceIdentity,
  target: DebugTarget,
  key: DebugKey | undefined,
  model: string,
  deps: DirectRunnerDeps
): Promise<DebugTrace> {
  const base = { ...identity, lane: 'direct' as const };
  const emptyTiming = { totalMs: 0, hops: [] };

  const spec = resolveSpec(target.family, identity.checkId);
  if (!spec) {
    // Reported rather than guessed: a half-invented request would produce a red check that
    // says more about this console than about the provider. The routed lane covers it.
    return {
      ...base,
      status: 'skipped',
      message: { key: 'provider_debug.result.family_unsupported' },
      timing: emptyTiming,
    };
  }

  const endpoint = spec.endpoint(target);
  if (!endpoint) {
    return {
      ...base,
      status: 'fail',
      message: { key: 'provider_debug.result.no_base_url' },
      timing: emptyTiming,
    };
  }
  if (!spec.anonymous && !key) {
    return {
      ...base,
      status: 'skipped',
      message: { key: 'provider_debug.result.no_key' },
      timing: emptyTiming,
    };
  }
  if (spec.needsModel && !model.trim()) {
    return {
      ...base,
      status: 'skipped',
      message: { key: 'provider_debug.result.no_model' },
      timing: emptyTiming,
    };
  }

  const context = { target, model };
  const headers = spec.anonymous ? buildHeaders(target) : buildHeaders(target, key);
  const authIndex = spec.anonymous ? undefined : key?.authIndex?.trim();
  // Sent compact, shown formatted: a one-line payload in the transcript would force
  // horizontal scrolling to read the very thing being debugged.
  const bodyValue = spec.body ? spec.body(context) : undefined;
  const body = bodyValue === undefined ? undefined : JSON.stringify(bodyValue);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const exchanged = await exchange(
    {
      method: spec.method,
      url: endpoint,
      header: headers,
      ...(authIndex ? { authIndex } : {}),
      ...(body === undefined ? {} : { data: body }),
    },
    headers,
    deps,
    bodyValue === undefined ? undefined : JSON.stringify(bodyValue, null, 2)
  );

  const timing = {
    totalMs: exchanged.elapsedMs,
    hops: [{ name: hostOf(endpoint), ms: exchanged.elapsedMs }],
  };

  if (!exchanged.ok) {
    return {
      ...base,
      status: 'fail',
      message: {
        key: 'provider_debug.result.unreachable',
        params: { detail: exchanged.transportError },
      },
      request: exchanged.request,
      timing,
    };
  }

  return {
    ...base,
    ...spec.evaluate(exchanged.result, context),
    request: exchanged.request,
    response: exchanged.response,
    timing,
  };
}

/**
 * Runs one planned unit and returns its trace. Never throws: a failure to reach the
 * upstream is a result, not an exception, and the rail needs a row either way.
 */
export function runDirectCheck(
  unit: DebugRunUnit,
  target: DebugTarget,
  deps: DirectRunnerDeps
): Promise<DebugTrace> {
  const key = unit.keyIndex === null ? primaryKey(target) : target.keys[unit.keyIndex];
  return runSpec(
    { id: unit.id, checkId: unit.check.id, keyIndex: unit.keyIndex },
    target,
    key,
    target.model,
    deps
  );
}

/** Runs one model × key intersection as a minimal completion. */
export function runMatrixCell(
  cell: DebugMatrixCell,
  target: DebugTarget,
  deps: DirectRunnerDeps
): Promise<DebugTrace> {
  return runSpec(
    { id: cell.id, checkId: 'completion', keyIndex: cell.keyIndex },
    target,
    target.keys[cell.keyIndex],
    cell.model,
    deps
  );
}

/**
 * Sends a caller-supplied body straight at the provider.
 *
 * The lab exists so an operator can reproduce the exact request that is failing in their
 * own client, rather than inferring the fault from a probe that sends something else.
 */
export async function runDirectPayload(
  body: string,
  target: DebugTarget,
  deps: DirectRunnerDeps
): Promise<DebugTrace> {
  const base = { id: 'payload', checkId: 'payload' as const, keyIndex: null, lane: 'direct' as const };
  const emptyTiming = { totalMs: 0, hops: [] };

  // The lab posts to whatever endpoint this family's completion check would use, so a
  // Claude payload lands on /v1/messages rather than an OpenAI path that does not exist.
  const completionSpec = resolveSpec(target.family, 'completion');
  const endpoint = completionSpec?.endpoint(target) ?? '';
  if (!endpoint) {
    return {
      ...base,
      status: completionSpec ? 'fail' : 'skipped',
      message: {
        key: completionSpec
          ? 'provider_debug.result.no_base_url'
          : 'provider_debug.result.family_unsupported',
      },
      timing: emptyTiming,
    };
  }
  const key = primaryKey(target);
  if (!key) {
    return {
      ...base,
      status: 'skipped',
      message: { key: 'provider_debug.result.no_key' },
      timing: emptyTiming,
    };
  }

  const headers = buildHeaders(target, key);
  headers['Content-Type'] = 'application/json';
  const authIndex = key.authIndex?.trim();

  const exchanged = await exchange(
    {
      method: 'POST',
      url: endpoint,
      header: headers,
      data: body,
      ...(authIndex ? { authIndex } : {}),
    },
    headers,
    deps,
    body
  );

  const timing = {
    totalMs: exchanged.elapsedMs,
    hops: [{ name: hostOf(endpoint), ms: exchanged.elapsedMs }],
  };

  if (!exchanged.ok) {
    return {
      ...base,
      status: 'fail',
      message: {
        key: 'provider_debug.result.unreachable',
        params: { detail: exchanged.transportError },
      },
      request: exchanged.request,
      timing,
    };
  }

  const ok = exchanged.result.statusCode >= 200 && exchanged.result.statusCode < 300;
  return {
    ...base,
    status: ok ? 'pass' : 'fail',
    message: {
      key: ok ? 'provider_debug.result.payload_ok' : 'provider_debug.result.payload_failed',
      params: { status: exchanged.result.statusCode },
    },
    request: exchanged.request,
    response: exchanged.response,
    timing,
  };
}
