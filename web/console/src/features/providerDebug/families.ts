/**
 * Per-family direct-lane specs.
 *
 * The direct lane speaks each provider's own protocol, so a family that AIPROXY reaches
 * through a different API shape needs its own request builders. Families are added here
 * only where the wire format is well established; everything else falls back to the
 * `generic` family, which covers the credential-level checks and leaves the generative ones
 * to the routed lane.
 *
 * That split is deliberate. A half-guessed request would produce a red check that says
 * more about this console than about the provider, and the routed lane already exercises
 * every family correctly because the router owns the translation.
 */

import type { ApiCallResult } from '@/services/api';
import { getApiCallErrorMessage } from '@/services/api';
import {
  buildClaudeMessagesEndpoint,
  normalizeClaudeBaseUrl,
  normalizeOpenAIBaseUrl,
} from '@/components/providers/utils';
import { normalizeModelList } from '@/utils/models';
import { redactSecretText } from '@/utils/redact';
import { OPENAI_CHECK_SPECS, parseSseFrames, type DirectCheckSpec } from './openaiChecks';
import type { DebugOutcome, DebugTarget, RegistryCheckId } from './types';

export type DebugProviderFamily = 'openai' | 'claude' | 'gemini' | 'generic';

const PROBE_MAX_TOKENS = 8;
const TOOL_MAX_TOKENS = 32;
const ANTHROPIC_VERSION = '2023-06-01';

const isSuccess = (status: number) => status >= 200 && status < 300;
const detailOf = (result: ApiCallResult) => redactSecretText(getApiCallErrorMessage(result));

const failed = (key: string, result: ApiCallResult): DebugOutcome => ({
  status: 'fail',
  message: { key, params: { status: result.statusCode, detail: detailOf(result) } },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

/** Reachability means the host answered; the credential is a separate question. */
const reachabilityOutcome = (result: ApiCallResult): DebugOutcome => ({
  status: 'pass',
  message: { key: 'provider_debug.result.reachable', params: { status: result.statusCode } },
});

function authOutcome(result: ApiCallResult): DebugOutcome {
  if (isSuccess(result.statusCode)) {
    return { status: 'pass', message: { key: 'provider_debug.result.key_accepted' } };
  }
  if (result.statusCode === 401 || result.statusCode === 403) {
    return failed('provider_debug.result.key_rejected', result);
  }
  return {
    status: 'warn',
    message: {
      key: 'provider_debug.result.key_inconclusive',
      params: { status: result.statusCode, detail: detailOf(result) },
    },
  };
}

function catalogOutcome(result: ApiCallResult, target: DebugTarget): DebugOutcome {
  if (!isSuccess(result.statusCode)) {
    return failed('provider_debug.result.catalog_failed', result);
  }
  const upstream = normalizeModelList(result.body ?? result.bodyText, { dedupe: true }).map(
    (model) => model.name
  );
  if (!upstream.length) {
    return { status: 'warn', message: { key: 'provider_debug.result.catalog_empty' } };
  }
  const available = new Set(upstream);
  const missing = target.models.filter((model) => model.trim() && !available.has(model.trim()));
  if (missing.length) {
    return {
      status: 'warn',
      message: {
        key: 'provider_debug.result.catalog_drift',
        params: { count: missing.length, models: missing.join(', '), upstream: upstream.length },
      },
    };
  }
  return {
    status: 'pass',
    message: {
      key: 'provider_debug.result.catalog_ok',
      params: { upstream: upstream.length, configured: target.models.length },
    },
  };
}

// --- Claude -----------------------------------------------------------------------------

/** Mirrors `buildClaudeMessagesEndpoint`: a base that already ends in /v1 must not double it. */
const claudeModelsEndpoint = (target: DebugTarget) => {
  const base = normalizeClaudeBaseUrl(target.baseUrl);
  return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
};

const claudeBody = (model: string, maxTokens: number, extra: Record<string, unknown> = {}) => ({
  model,
  max_tokens: maxTokens,
  messages: [{ role: 'user', content: 'Reply OK' }],
  ...extra,
});

function claudeContentText(result: ApiCallResult): string | null {
  const body = result.body;
  if (!isRecord(body) || !Array.isArray(body.content)) return null;
  const block = body.content.find((item) => isRecord(item) && item.type === 'text');
  return isRecord(block) && typeof block.text === 'string' ? block.text : null;
}

const CLAUDE_SPECS: Partial<Record<RegistryCheckId, DirectCheckSpec>> = {
  reachability: {
    method: 'GET',
    endpoint: claudeModelsEndpoint,
    needsModel: false,
    anonymous: true,
    evaluate: reachabilityOutcome,
  },
  auth: {
    method: 'GET',
    endpoint: claudeModelsEndpoint,
    needsModel: false,
    anonymous: false,
    evaluate: authOutcome,
  },
  catalog: {
    method: 'GET',
    endpoint: claudeModelsEndpoint,
    needsModel: false,
    anonymous: false,
    evaluate: (result, { target }) => catalogOutcome(result, target),
  },
  completion: {
    method: 'POST',
    endpoint: (target) => buildClaudeMessagesEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: ({ model }) => claudeBody(model, PROBE_MAX_TOKENS),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.completion_failed', result);
      }
      if (claudeContentText(result) === null) {
        return {
          status: 'warn',
          message: { key: 'provider_debug.result.completion_shape' },
          meta: { model },
        };
      }
      return {
        status: 'pass',
        message: { key: 'provider_debug.result.completion_ok', params: { tokens: 0 } },
        meta: { model },
      };
    },
  },
  sse_format: {
    method: 'POST',
    endpoint: (target) => buildClaudeMessagesEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: ({ model }) => claudeBody(model, PROBE_MAX_TOKENS, { stream: true }),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.stream_failed', result);
      }
      const { frames } = parseSseFrames(result.bodyText);
      if (!frames.length) {
        return { status: 'fail', message: { key: 'provider_debug.result.stream_not_sse' } };
      }
      // Anthropic terminates with a `message_stop` event rather than the `[DONE]` sentinel.
      const terminated = result.bodyText.includes('message_stop');
      return {
        status: terminated ? 'pass' : 'warn',
        message: {
          key: terminated
            ? 'provider_debug.result.stream_ok'
            : 'provider_debug.result.stream_unterminated',
          params: { chunks: frames.length },
        },
        meta: { model, chunkCount: frames.length },
      };
    },
  },
  tools: {
    method: 'POST',
    endpoint: (target) => buildClaudeMessagesEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: ({ model }) =>
      claudeBody(model, TOOL_MAX_TOKENS, {
        messages: [{ role: 'user', content: 'Call the ping tool.' }],
        tools: [
          {
            name: 'ping',
            description: 'Returns pong. Used only to verify tool calling works.',
            input_schema: { type: 'object', properties: {} },
          },
        ],
      }),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.tools_failed', result);
      }
      const body = result.body;
      const blocks = isRecord(body) && Array.isArray(body.content) ? body.content : [];
      const calls = blocks.filter((item) => isRecord(item) && item.type === 'tool_use');
      if (calls.length) {
        return {
          status: 'pass',
          message: { key: 'provider_debug.result.tools_ok', params: { count: calls.length } },
          meta: { model },
        };
      }
      return {
        status: 'warn',
        message: { key: 'provider_debug.result.tools_no_call' },
        meta: { model },
      };
    },
  },
};

// --- Gemini -----------------------------------------------------------------------------

const geminiModelsEndpoint = (target: DebugTarget) => {
  const base = normalizeOpenAIBaseUrl(target.baseUrl) || 'https://generativelanguage.googleapis.com';
  return base.endsWith('/v1beta') ? `${base}/models` : `${base}/v1beta/models`;
};

const GEMINI_SPECS: Partial<Record<RegistryCheckId, DirectCheckSpec>> = {
  reachability: {
    method: 'GET',
    endpoint: geminiModelsEndpoint,
    needsModel: false,
    anonymous: true,
    evaluate: reachabilityOutcome,
  },
  auth: {
    method: 'GET',
    endpoint: geminiModelsEndpoint,
    needsModel: false,
    anonymous: false,
    evaluate: authOutcome,
  },
  catalog: {
    method: 'GET',
    endpoint: geminiModelsEndpoint,
    needsModel: false,
    anonymous: false,
    evaluate: (result, { target }) => catalogOutcome(result, target),
  },
  completion: {
    method: 'POST',
    endpoint: geminiModelsEndpoint,
    needsModel: true,
    anonymous: false,
    body: () => ({ contents: [{ parts: [{ text: 'Reply OK' }] }] }),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.completion_failed', result);
      }
      const body = result.body;
      const candidates = isRecord(body) && Array.isArray(body.candidates) ? body.candidates : [];
      if (!candidates.length) {
        return {
          status: 'warn',
          message: { key: 'provider_debug.result.completion_shape' },
          meta: { model },
        };
      }
      return {
        status: 'pass',
        message: { key: 'provider_debug.result.completion_ok', params: { tokens: 0 } },
        meta: { model },
      };
    },
  },
};

// --- Generic ----------------------------------------------------------------------------

/**
 * Credential-level checks for families whose generative wire format this console does not
 * model. They still answer "is the host up" and "is the key good"; the routed lane covers
 * everything past that.
 */
const genericModelsEndpoint = (target: DebugTarget) => {
  const base = normalizeOpenAIBaseUrl(target.baseUrl);
  if (!base) return '';
  return base.endsWith('/models') ? base : `${base}/models`;
};

const GENERIC_SPECS: Partial<Record<RegistryCheckId, DirectCheckSpec>> = {
  reachability: {
    method: 'GET',
    endpoint: genericModelsEndpoint,
    needsModel: false,
    anonymous: true,
    evaluate: reachabilityOutcome,
  },
  auth: {
    method: 'GET',
    endpoint: genericModelsEndpoint,
    needsModel: false,
    anonymous: false,
    evaluate: authOutcome,
  },
  catalog: {
    method: 'GET',
    endpoint: genericModelsEndpoint,
    needsModel: false,
    anonymous: false,
    evaluate: (result, { target }) => catalogOutcome(result, target),
  },
};

const FAMILY_SPECS: Record<DebugProviderFamily, Partial<Record<RegistryCheckId, DirectCheckSpec>>> =
  {
    openai: OPENAI_CHECK_SPECS,
    claude: CLAUDE_SPECS,
    gemini: GEMINI_SPECS,
    generic: GENERIC_SPECS,
  };

/** Returns the spec for a check, or undefined when this family cannot run it directly. */
export function resolveSpec(
  family: DebugProviderFamily,
  checkId: RegistryCheckId
): DirectCheckSpec | undefined {
  return FAMILY_SPECS[family][checkId];
}

/**
 * Credential headers differ by family: Anthropic and Google authenticate with their own
 * header names, and sending a bearer token instead produces a 401 that says nothing about
 * the key.
 */
export function familyAuthHeaders(
  family: DebugProviderFamily,
  apiKey: string
): Record<string, string> {
  switch (family) {
    case 'claude':
      return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION };
    case 'gemini':
      return { 'x-goog-api-key': apiKey };
    default:
      return { Authorization: `Bearer ${apiKey}` };
  }
}

/** The header a caller-supplied Authorization override would collide with. */
export function familyAuthHeaderName(family: DebugProviderFamily): string {
  switch (family) {
    case 'claude':
      return 'x-api-key';
    case 'gemini':
      return 'x-goog-api-key';
    default:
      return 'authorization';
  }
}
