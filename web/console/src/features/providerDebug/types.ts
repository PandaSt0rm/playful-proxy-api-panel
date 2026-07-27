/**
 * Shared result contract for the provider debug bench.
 *
 * Both lanes normalise to `DebugTrace` so the check rail, trace view, hop chain, and
 * clipboard export render from one shape. Adding a check means adding a registry entry,
 * not a component.
 *
 * - Direct lane: the browser builds the request and sends it through the management
 *   `/api-call` proxy, so the snapshots are the real wire exchange.
 * - Routed lane: the request goes through `authManager.Execute`, so the request snapshot
 *   is the routed request *before* executor translation. It is labelled as such rather
 *   than presented as wire-exact.
 */

export type DebugLane = 'direct' | 'routed';

/** `skipped` means the check could not run here, not that it passed. */
export type DebugStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export type DebugCheckId =
  | 'reachability'
  | 'auth'
  | 'catalog'
  | 'completion'
  | 'sse_format'
  | 'tools'
  | 'json_mode'
  | 'vision'
  // The payload lab is not a rail check: it has no fixed request to plan, so it never
  // appears in DEBUG_CHECKS. The id exists so its result is still a first-class trace.
  | 'payload';

/** Check ids that have a fixed request, and therefore a spec in the registry. */
export type RegistryCheckId = Exclude<DebugCheckId, 'payload'>;

/** One leg of the request path, rendered by the hop chain. */
export interface DebugHop {
  name: string;
  ms: number;
}

export interface DebugRequestSnapshot {
  method: string;
  url: string;
  /** Header values are already masked by `utils/redact` before they reach this shape. */
  headers: [string, string][];
  body?: string;
}

export interface DebugResponseSnapshot {
  status: number;
  headers: [string, string][];
  body?: string;
}

export interface DebugTiming {
  totalMs: number;
  /** Time to first streamed chunk. Only the routed lane can measure this. */
  ttftMs?: number;
  hops: DebugHop[];
}

export interface DebugTraceMeta {
  model?: string;
  authIndex?: string;
  sourceFormat?: string;
  targetFormat?: string;
  tokens?: number;
  chunkCount?: number;
}

/**
 * A translatable outcome. Runners are pure and i18n-free, so they emit a key plus
 * interpolation params; the component translates. Upstream error text travels as a
 * `detail` param because it is data, not copy.
 */
export interface DebugMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface DebugTrace {
  /** Stable within a run: `<checkId>` or `<checkId>:<keyIndex>`. */
  id: string;
  checkId: DebugCheckId;
  /** Index into `DebugTarget.keys`, or `null` for provider-wide checks. */
  keyIndex: number | null;
  lane: DebugLane;
  status: DebugStatus;
  /** Names the cause and the next move, not just "failed". */
  message: DebugMessage;
  request?: DebugRequestSnapshot;
  response?: DebugResponseSnapshot;
  timing: DebugTiming;
  meta?: DebugTraceMeta;
}

export interface DebugCheck {
  id: RegistryCheckId;
  labelKey: string;
  descriptionKey: string;
  /** Consumes provider quota or tokens, so it sits behind the run cost confirmation. */
  billable: boolean;
  /** Runs once per API key rather than once for the provider. */
  perKey: boolean;
}

/** One API key belonging to the provider under test. */
export interface DebugKey {
  apiKey: string;
  /** Present once the credential is saved; enables credential-scoped proxy selection. */
  authIndex?: string;
  /** Per-key header overrides layered over the provider headers. */
  headers?: Record<string, string>;
}

/**
 * What the bench is pointed at. Built from the provider edit page's draft form, so it
 * describes unsaved configuration just as well as saved configuration.
 */
export interface DebugTarget {
  providerLabel: string;
  /** Wire protocol this provider speaks on the direct lane. */
  family: import('./families').DebugProviderFamily;
  baseUrl: string;
  headers: Record<string, string>;
  keys: DebugKey[];
  /** Models configured for this provider, used by the catalog drift comparison. */
  models: string[];
  /** Model the capability checks exercise. Empty means none is selected yet. */
  model: string;
  /**
   * Server-side credential kind (`openai-compatibility`, `claude-api-key`, …). Present only
   * for a provider family the routed lane can address; the lane also needs a saved
   * credential, which is carried per key as `authIndex`.
   */
  routedKind?: string;
}

/** Outcome of evaluating one upstream response. */
export interface DebugOutcome {
  status: DebugStatus;
  message: DebugMessage;
  meta?: DebugTraceMeta;
}

/** One model × key intersection in the matrix. */
export interface DebugMatrixCell {
  id: string;
  keyIndex: number;
  model: string;
}

export interface DebugMatrixPlan {
  cells: DebugMatrixCell[];
  /** Cells the cap removed. Surfaced in the UI: a silent truncation reads as full coverage. */
  dropped: number;
  models: string[];
  keyIndexes: number[];
}

/** A single scheduled unit of work: one check, optionally bound to one key. */
export interface DebugRunUnit {
  id: string;
  check: DebugCheck;
  /** Index into `DebugTarget.keys`, or `null` for provider-wide checks. */
  keyIndex: number | null;
}

/** Live state of one unit while a run is in flight. */
export type DebugUnitState =
  | { status: 'pending' }
  | { status: 'running' }
  | { status: 'settled'; trace: DebugTrace };
