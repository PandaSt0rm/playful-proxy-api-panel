import type { ThinkingPayloadMap } from '@/types';
import { isOllamaCloudBaseUrl } from '@/utils/ollamaCloudProvider';
import { isOpenRouterBaseUrl } from '@/utils/openrouterProvider';
import { isZaiBaseUrl } from '@/utils/zaiProvider';

export const REASONING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
// Labels that only make sense as payload keys; they never become alias levels.
export const PAYLOAD_ONLY_LABELS = ['none', 'auto'] as const;
export const EFFORT_LABELS = [...REASONING_LEVELS, ...PAYLOAD_ONLY_LABELS] as const;

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];
export type EffortLabel = (typeof EFFORT_LABELS)[number];

export const isEffortLabel = (label: string): boolean =>
  (EFFORT_LABELS as readonly string[]).includes(label);

export const isReasoningLevel = (label: string): boolean =>
  (REASONING_LEVELS as readonly string[]).includes(label);

export type EffortPresetId =
  | 'standard'
  | 'glm'
  | 'glm52'
  | 'qwen'
  | 'openrouter'
  | 'deepseek'
  | 'doubao'
  | 'kimi'
  | 'vllm'
  | 'gemini';

/**
 * An editable starting point for one upstream's reasoning controls. A preset is
 * a complete replacement value: applying it overwrites levels, payloads, and
 * both capability flags, so every field is stated even when it is empty.
 *
 * - `levels` are declared explicitly rather than left to the router's key
 *   synthesis, which only runs while a model has no `thinking` block at all
 *   (sdk/cliproxy/service.go buildOpenAICompatibilityConfigModels).
 * - `dynamicAllowed` is required for an `auto` payload to ever be selected:
 *   without it ValidateConfig rewrites auto into a concrete level
 *   (internal/thinking/validate.go convertAutoToMidRange).
 * - `zeroAllowed` lets a payload-free preset answer a "no thinking" request
 *   with `reasoning_effort: "none"` instead of falling back to the lowest
 *   level (internal/thinking/provider/openai/apply.go).
 */
export interface EffortPreset {
  id: EffortPresetId;
  levels: readonly ReasoningLevel[];
  payloads: ThinkingPayloadMap;
  dynamicAllowed: boolean;
  zeroAllowed: boolean;
}

export const EFFORT_PRESETS: readonly EffortPreset[] = [
  {
    // No payload at all: the router already writes reasoning_effort for a
    // declared level, which is what Ollama Cloud and stock OpenAI-compatible
    // servers accept. Ollama's /v1 surface takes low/medium/high/max/none and
    // ignores the native `think` field entirely.
    id: 'standard',
    levels: ['low', 'medium', 'high', 'max'],
    payloads: {},
    dynamicAllowed: false,
    zeroAllowed: true,
  },
  {
    // Z.AI / Zhipu GLM-4.5 and newer: thinking.type is the only documented
    // toggle and accepts exactly enabled/disabled.
    id: 'glm',
    levels: ['high'],
    payloads: {
      none: { thinking: { type: 'disabled' } },
      high: { thinking: { type: 'enabled' } },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
  {
    // GLM-5.2 added top-level reasoning_effort on top of the thinking toggle,
    // accepting the whole enum. Every accepted label is declared so a client
    // asking for one is not rejected before the request leaves the proxy; the
    // upstream is what collapses low/medium onto high and xhigh onto max.
    id: 'glm52',
    levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    payloads: {
      none: { thinking: { type: 'disabled' } },
      minimal: { thinking: { type: 'enabled' }, reasoning_effort: 'minimal' },
      low: { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
      medium: { thinking: { type: 'enabled' }, reasoning_effort: 'medium' },
      high: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
      xhigh: { thinking: { type: 'enabled' }, reasoning_effort: 'xhigh' },
      max: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
  {
    // Alibaba DashScope: enable_thinking plus a token budget. Vendor samples
    // pass these through the OpenAI SDK's extra_body, which spreads its
    // contents at the body root, so on the wire they are top-level fields.
    id: 'qwen',
    levels: ['low', 'medium', 'high'],
    payloads: {
      none: { enable_thinking: false },
      low: { enable_thinking: true, thinking_budget: 1024 },
      medium: { enable_thinking: true, thinking_budget: 8192 },
      high: { enable_thinking: true, thinking_budget: 24576 },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
  {
    // OpenRouter's unified reasoning object. effort carries the whole enum and
    // "none" is the documented way to disable; `enabled` is not part of the
    // chat request schema.
    id: 'openrouter',
    levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    payloads: {
      none: { reasoning: { effort: 'none' } },
      minimal: { reasoning: { effort: 'minimal' } },
      low: { reasoning: { effort: 'low' } },
      medium: { reasoning: { effort: 'medium' } },
      high: { reasoning: { effort: 'high' } },
      xhigh: { reasoning: { effort: 'xhigh' } },
      max: { reasoning: { effort: 'max' } },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
  {
    // DeepSeek chat completions: thinking.type toggles CoT, and the native
    // reasoning_effort tiers are low/high/max. medium and xhigh are declared
    // too, sent as the tier the vendor documents them as compatible with, so
    // a client using the common enum is served instead of rejected.
    id: 'deepseek',
    levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    payloads: {
      none: { thinking: { type: 'disabled' } },
      low: { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
      medium: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
      high: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
      xhigh: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
      max: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
  {
    // Volcengine Ark (Doubao seed models): thinking.type enabled/disabled/auto.
    // auto is only reachable while dynamic thinking is allowed.
    id: 'doubao',
    levels: ['high'],
    payloads: {
      none: { thinking: { type: 'disabled' } },
      auto: { thinking: { type: 'auto' } },
      high: { thinking: { type: 'enabled' } },
    },
    dynamicAllowed: true,
    zeroAllowed: false,
  },
  {
    // Moonshot Kimi K2.6/K2.5: thinking.type enabled/disabled. K3 and the
    // K2.7 coding models take reasoning_effort instead and cannot be
    // disabled, so they want the standard template.
    id: 'kimi',
    levels: ['high'],
    payloads: {
      none: { thinking: { type: 'disabled' } },
      high: { thinking: { type: 'enabled' } },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
  {
    // vLLM/SGLang self-hosted hybrid-reasoning models (Qwen3 etc.):
    // enable_thinking flows to the chat template.
    id: 'vllm',
    levels: ['high'],
    payloads: {
      none: { chat_template_kwargs: { enable_thinking: false } },
      high: { chat_template_kwargs: { enable_thinking: true } },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
  {
    // Gemini OpenAI-compat endpoint: Google's own curl for that endpoint sends
    // a literal extra_body wrapper. thinking_budget: 0 disables on 2.5,
    // thinking_level applies to Gemini 3.
    id: 'gemini',
    levels: ['low', 'high'],
    payloads: {
      none: { extra_body: { google: { thinking_config: { thinking_budget: 0 } } } },
      low: { extra_body: { google: { thinking_config: { thinking_level: 'low' } } } },
      high: { extra_body: { google: { thinking_config: { thinking_level: 'high' } } } },
    },
    dynamicAllowed: false,
    zeroAllowed: false,
  },
];

/** Provider editors that render per-model rows: the OpenAI-compatible modes plus the native-key kinds. */
export type ModelEntryEditorMode =
  | 'openai'
  | 'zai'
  | 'openrouter'
  | 'ollama'
  | 'interactions'
  | 'xai';

export interface ModelEntryCapabilities {
  /** Reasoning levels and effort payloads: only `openai-compatibility[].models[]` stores them. */
  effort: boolean;
  /** Image flag and input/output modalities: same config root, same restriction. */
  modalities: boolean;
}

/**
 * Native-key providers persist into GeminiKey/XAIKey model structs, which carry
 * name, alias, display-name, and force-mapping only. Anything else the editor
 * writes there is discarded on save, so it is not offered.
 */
export const MODEL_ENTRY_CAPABILITIES: Record<ModelEntryEditorMode, ModelEntryCapabilities> = {
  openai: { effort: true, modalities: true },
  zai: { effort: true, modalities: true },
  openrouter: { effort: true, modalities: true },
  ollama: { effort: true, modalities: true },
  interactions: { effort: false, modalities: false },
  xai: { effort: false, modalities: false },
};

const RECOMMENDED_BY_MODE: Record<ModelEntryEditorMode, readonly EffortPresetId[]> = {
  openai: [],
  zai: ['glm', 'glm52'],
  openrouter: ['openrouter'],
  ollama: ['standard'],
  interactions: [],
  xai: [],
};

/**
 * Templates worth trying first for the endpoint being edited. The base URL wins
 * over the editor mode because a Z.AI or generic entry can be re-pointed at any
 * other upstream while it is open; nothing is hidden either way, recommended
 * templates are only listed ahead of the rest.
 */
export const recommendedPresetIds = (
  mode: ModelEntryEditorMode,
  baseUrl?: string
): readonly EffortPresetId[] => {
  if (isZaiBaseUrl(baseUrl)) return RECOMMENDED_BY_MODE.zai;
  if (isOpenRouterBaseUrl(baseUrl)) return RECOMMENDED_BY_MODE.openrouter;
  if (isOllamaCloudBaseUrl(baseUrl)) return RECOMMENDED_BY_MODE.ollama;
  return RECOMMENDED_BY_MODE[mode];
};
