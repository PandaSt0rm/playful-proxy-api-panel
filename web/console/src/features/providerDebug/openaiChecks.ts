/**
 * Per-check request construction and response evaluation for OpenAI-compatible providers.
 *
 * Each check is a spec rather than a branch in the runner: at eight checks the if/else
 * chain stopped paying for itself, and a table keeps "what this check sends" next to
 * "what its answer means", which is where the diagnostic judgement actually lives.
 */

import type { ApiCallResult } from '@/services/api';
import { getApiCallErrorMessage } from '@/services/api';
import {
  buildOpenAIChatCompletionsEndpoint,
  buildOpenAIModelsEndpoint,
} from '@/components/providers/utils';
import { normalizeModelList } from '@/utils/models';
import { redactSecretText } from '@/utils/redact';
import type { DebugOutcome, DebugTarget, RegistryCheckId } from './types';

/** Deliberately tiny: these are liveness probes, not generations. */
const PROBE_MAX_TOKENS = 8;
const TOOL_MAX_TOKENS = 32;

/**
 * A 1×1 transparent PNG, inlined rather than fetched. The vision check only needs a
 * syntactically valid image part — providers reject or accept the *shape* long before
 * image content matters, and an external URL would make the check depend on a third host.
 */
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export interface CheckContext {
  target: DebugTarget;
  model: string;
}

export interface DirectCheckSpec {
  method: 'GET' | 'POST';
  endpoint(target: DebugTarget): string;
  body?(context: CheckContext): unknown;
  evaluate(result: ApiCallResult, context: CheckContext): DebugOutcome;
  /** Skipped unless a model is selected. */
  needsModel: boolean;
  /** Sends no credential, so a bad key cannot look like an outage. */
  anonymous: boolean;
}

const isSuccess = (status: number) => status >= 200 && status < 300;

/**
 * `getApiCallErrorMessage` reads the raw body, which routinely echoes the offending
 * credential, so every operator-facing detail is masked on the way out.
 */
const detailOf = (result: ApiCallResult): string =>
  redactSecretText(getApiCallErrorMessage(result));

const failed = (key: string, result: ApiCallResult): DebugOutcome => ({
  status: 'fail',
  message: { key, params: { status: result.statusCode, detail: detailOf(result) } },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

function chatBody(context: CheckContext, extra: Record<string, unknown> = {}) {
  return {
    model: context.model,
    messages: [{ role: 'user', content: 'Reply OK' }],
    max_tokens: PROBE_MAX_TOKENS,
    stream: false,
    ...extra,
  };
}

function firstChoiceMessage(result: ApiCallResult): Record<string, unknown> | null {
  const body = result.body;
  if (!isRecord(body) || !Array.isArray(body.choices)) return null;
  const choice = body.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return null;
  return choice.message;
}

function totalTokens(result: ApiCallResult): number | undefined {
  const body = result.body;
  if (!isRecord(body) || !isRecord(body.usage)) return undefined;
  const total = body.usage.total_tokens;
  return typeof total === 'number' ? total : undefined;
}

/** Parses a buffered SSE body. The proxy reads the response whole, so frames arrive together. */
export function parseSseFrames(text: string): { frames: string[]; done: boolean } {
  const frames: string[] = [];
  let done = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (payload === '[DONE]') {
      done = true;
      continue;
    }
    if (payload) frames.push(payload);
  }
  return { frames, done };
}

export const OPENAI_CHECK_SPECS: Record<RegistryCheckId, DirectCheckSpec> = {
  reachability: {
    method: 'GET',
    endpoint: (target) => buildOpenAIModelsEndpoint(target.baseUrl),
    needsModel: false,
    anonymous: true,
    evaluate: (result) => ({
      status: 'pass',
      message: { key: 'provider_debug.result.reachable', params: { status: result.statusCode } },
    }),
  },

  auth: {
    method: 'GET',
    endpoint: (target) => buildOpenAIModelsEndpoint(target.baseUrl),
    needsModel: false,
    anonymous: false,
    evaluate: (result) => {
      if (isSuccess(result.statusCode)) {
        return { status: 'pass', message: { key: 'provider_debug.result.key_accepted' } };
      }
      if (result.statusCode === 401 || result.statusCode === 403) {
        return failed('provider_debug.result.key_rejected', result);
      }
      // Anything else says more about the endpoint than the credential — a missing /models
      // route is common on gateways that still serve completions correctly.
      return {
        status: 'warn',
        message: {
          key: 'provider_debug.result.key_inconclusive',
          params: { status: result.statusCode, detail: detailOf(result) },
        },
      };
    },
  },

  catalog: {
    method: 'GET',
    endpoint: (target) => buildOpenAIModelsEndpoint(target.baseUrl),
    needsModel: false,
    anonymous: false,
    evaluate: (result, { target }) => {
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
      const missing = target.models.filter(
        (model) => model.trim() && !available.has(model.trim())
      );
      if (missing.length) {
        return {
          status: 'warn',
          message: {
            key: 'provider_debug.result.catalog_drift',
            params: {
              count: missing.length,
              models: missing.join(', '),
              upstream: upstream.length,
            },
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
    },
  },

  completion: {
    method: 'POST',
    endpoint: (target) => buildOpenAIChatCompletionsEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: (context) => chatBody(context),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.completion_failed', result);
      }
      const message = firstChoiceMessage(result);
      if (!message) {
        return {
          status: 'warn',
          message: { key: 'provider_debug.result.completion_shape' },
          meta: { model },
        };
      }
      return {
        status: 'pass',
        message: {
          key: 'provider_debug.result.completion_ok',
          params: { tokens: totalTokens(result) ?? 0 },
        },
        meta: { model, tokens: totalTokens(result) },
      };
    },
  },

  sse_format: {
    method: 'POST',
    endpoint: (target) => buildOpenAIChatCompletionsEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: (context) => chatBody(context, { stream: true }),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.stream_failed', result);
      }
      const { frames, done } = parseSseFrames(result.bodyText);
      if (!frames.length) {
        return { status: 'fail', message: { key: 'provider_debug.result.stream_not_sse' } };
      }
      if (!done) {
        return {
          status: 'warn',
          message: {
            key: 'provider_debug.result.stream_unterminated',
            params: { chunks: frames.length },
          },
          meta: { model, chunkCount: frames.length },
        };
      }
      return {
        status: 'pass',
        message: {
          key: 'provider_debug.result.stream_ok',
          params: { chunks: frames.length },
        },
        meta: { model, chunkCount: frames.length },
      };
    },
  },

  tools: {
    method: 'POST',
    endpoint: (target) => buildOpenAIChatCompletionsEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: (context) =>
      chatBody(context, {
        max_tokens: TOOL_MAX_TOKENS,
        messages: [{ role: 'user', content: 'Call the ping tool.' }],
        tool_choice: 'auto',
        tools: [
          {
            type: 'function',
            function: {
              name: 'ping',
              description: 'Returns pong. Used only to verify tool calling works.',
              parameters: { type: 'object', properties: {}, required: [] },
            },
          },
        ],
      }),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.tools_failed', result);
      }
      const message = firstChoiceMessage(result);
      const calls = message?.tool_calls;
      if (Array.isArray(calls) && calls.length) {
        return {
          status: 'pass',
          message: { key: 'provider_debug.result.tools_ok', params: { count: calls.length } },
          meta: { model },
        };
      }
      // The request was accepted, so the schema is supported; the model simply chose not to
      // call. That is a model behaviour, not a provider defect.
      return {
        status: 'warn',
        message: { key: 'provider_debug.result.tools_no_call' },
        meta: { model },
      };
    },
  },

  json_mode: {
    method: 'POST',
    endpoint: (target) => buildOpenAIChatCompletionsEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: (context) =>
      chatBody(context, {
        max_tokens: TOOL_MAX_TOKENS,
        messages: [{ role: 'user', content: 'Reply with the JSON object {"ok":true}.' }],
        response_format: { type: 'json_object' },
      }),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.json_failed', result);
      }
      const content = firstChoiceMessage(result)?.content;
      if (typeof content !== 'string') {
        return {
          status: 'warn',
          message: { key: 'provider_debug.result.completion_shape' },
          meta: { model },
        };
      }
      try {
        JSON.parse(content);
      } catch {
        return {
          status: 'warn',
          message: { key: 'provider_debug.result.json_not_json' },
          meta: { model },
        };
      }
      return { status: 'pass', message: { key: 'provider_debug.result.json_ok' }, meta: { model } };
    },
  },

  vision: {
    method: 'POST',
    endpoint: (target) => buildOpenAIChatCompletionsEndpoint(target.baseUrl),
    needsModel: true,
    anonymous: false,
    body: (context) =>
      chatBody(context, {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image in one word.' },
              { type: 'image_url', image_url: { url: PIXEL_PNG } },
            ],
          },
        ],
      }),
    evaluate: (result, { model }) => {
      if (!isSuccess(result.statusCode)) {
        return failed('provider_debug.result.vision_failed', result);
      }
      if (!firstChoiceMessage(result)) {
        return {
          status: 'warn',
          message: { key: 'provider_debug.result.completion_shape' },
          meta: { model },
        };
      }
      return {
        status: 'pass',
        message: { key: 'provider_debug.result.vision_ok' },
        meta: { model },
      };
    },
  },
};
