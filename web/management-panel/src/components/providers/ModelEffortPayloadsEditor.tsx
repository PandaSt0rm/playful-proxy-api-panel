import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelInputListRowExtrasArgs } from '@/components/ui/ModelInputList';
import type { ThinkingPayloadMap } from '@/types';
import styles from './ModelEffortPayloadsEditor.module.scss';

const REASONING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
// Labels that only make sense as payload keys; they never become alias levels.
const PAYLOAD_ONLY_LABELS = ['none', 'auto'] as const;
const EFFORT_LABELS = [...REASONING_LEVELS, ...PAYLOAD_ONLY_LABELS] as const;
type EffortLabel = (typeof EFFORT_LABELS)[number];

const THINKING_PAYLOAD_LABELS = new Set<string>(EFFORT_LABELS);

// Editable starting points for upstreams that do not accept reasoning_effort.
type PresetId = 'glm' | 'qwen' | 'openrouter' | 'deepseek' | 'doubao' | 'kimi' | 'vllm' | 'gemini';
const THINKING_PAYLOAD_PRESETS: Array<{ id: PresetId; payloads: ThinkingPayloadMap }> = [
  {
    id: 'glm',
    payloads: {
      none: { thinking: { type: 'disabled' } },
      high: { thinking: { type: 'enabled' } },
    },
  },
  {
    id: 'qwen',
    payloads: {
      none: { enable_thinking: false },
      low: { enable_thinking: true, thinking_budget: 1024 },
      medium: { enable_thinking: true, thinking_budget: 8192 },
      high: { enable_thinking: true, thinking_budget: 24576 },
    },
  },
  {
    id: 'openrouter',
    payloads: {
      none: { reasoning: { enabled: false } },
      low: { reasoning: { effort: 'low' } },
      medium: { reasoning: { effort: 'medium' } },
      high: { reasoning: { effort: 'high' } },
    },
  },
  {
    // DeepSeek V3.2+ chat completions: thinking.type toggles CoT, and the
    // native reasoning_effort only accepts high/max while thinking is on.
    id: 'deepseek',
    payloads: {
      none: { thinking: { type: 'disabled' } },
      high: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
      max: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
    },
  },
  {
    // Volcengine Ark (Doubao seed models): thinking.type enabled/disabled/auto.
    id: 'doubao',
    payloads: {
      none: { thinking: { type: 'disabled' } },
      auto: { thinking: { type: 'auto' } },
      high: { thinking: { type: 'enabled' } },
    },
  },
  {
    // Moonshot Kimi K2 thinking models: thinking.type enabled/disabled.
    id: 'kimi',
    payloads: {
      none: { thinking: { type: 'disabled' } },
      high: { thinking: { type: 'enabled' } },
    },
  },
  {
    // vLLM/SGLang self-hosted hybrid-reasoning models (Qwen3 etc.):
    // enable_thinking flows to the chat template.
    id: 'vllm',
    payloads: {
      none: { chat_template_kwargs: { enable_thinking: false } },
      high: { chat_template_kwargs: { enable_thinking: true } },
    },
  },
  {
    // Gemini OpenAI-compat endpoint: a literal extra_body.google.thinking_config
    // key; thinking_budget: 0 disables on 2.5, thinking_level on newer models.
    id: 'gemini',
    payloads: {
      none: { extra_body: { google: { thinking_config: { thinking_budget: 0 } } } },
      low: { extra_body: { google: { thinking_config: { thinking_level: 'low' } } } },
      high: { extra_body: { google: { thinking_config: { thinking_level: 'high' } } } },
    },
  },
];

const isReasoningLevel = (label: string): boolean =>
  (REASONING_LEVELS as readonly string[]).includes(label);

const orderLevels = (levels: Set<string>): string[] => [
  ...REASONING_LEVELS.filter((known) => levels.has(known)),
  ...Array.from(levels).filter((level) => !isReasoningLevel(level)),
];

const clonePayloadMap = (payloads: ThinkingPayloadMap): ThinkingPayloadMap =>
  Object.fromEntries(Object.entries(payloads).map(([key, value]) => [key, { ...value }]));

// JSON mode shows the whole effort config as one map: every active label is a
// key, its payload is the value, and {} declares a label with no payload.
const formatEffortMap = (activeLabels: string[], payloads: ThinkingPayloadMap) => {
  if (!activeLabels.length) return '';
  const map: Record<string, unknown> = {};
  for (const label of EFFORT_LABELS) {
    if (activeLabels.includes(label)) map[label] = payloads[label] ?? {};
  }
  return JSON.stringify(map, null, 2);
};

const parseEffortMap = (
  text: string
): { ok: boolean; labels?: string[]; payloads?: ThinkingPayloadMap } => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, labels: [], payloads: undefined };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false };
    const labels: string[] = [];
    const out: ThinkingPayloadMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const label = key.trim().toLowerCase();
      if (!THINKING_PAYLOAD_LABELS.has(label)) return { ok: false };
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
      if (!labels.includes(label)) labels.push(label);
      const patch = value as Record<string, unknown>;
      if (!Object.keys(patch).length) continue;
      out[label] = patch;
    }
    return { ok: true, labels, payloads: Object.keys(out).length ? out : undefined };
  } catch {
    return { ok: false };
  }
};

const parsePayloadObject = (text: string): { ok: boolean; value?: Record<string, unknown> } => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: undefined };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false };
    const value = parsed as Record<string, unknown>;
    return { ok: true, value: Object.keys(value).length ? value : undefined };
  } catch {
    return { ok: false };
  }
};

const formatPayloadObject = (value?: Record<string, unknown>) =>
  value ? JSON.stringify(value) : '';

interface PayloadRowProps {
  label: string;
  value?: Record<string, unknown>;
  disabled: boolean;
  onCommit: (label: string, value: Record<string, unknown> | undefined) => void;
}

function PayloadRow({ label, value, disabled, onCommit }: PayloadRowProps) {
  const { t } = useTranslation();
  const serialized = formatPayloadObject(value);
  const [draft, setDraft] = useState(serialized);
  const [invalid, setInvalid] = useState(false);
  // Resync the draft when the payload changes outside this row (template
  // applied, JSON mode edits, form reload) without clobbering in-progress
  // typing of the same value.
  const [lastSerialized, setLastSerialized] = useState(serialized);
  if (serialized !== lastSerialized) {
    setLastSerialized(serialized);
    const parsed = parsePayloadObject(draft);
    if (!(parsed.ok && formatPayloadObject(parsed.value) === serialized)) {
      setDraft(serialized);
      setInvalid(false);
    }
  }

  const applyText = (text: string) => {
    setDraft(text);
    const parsed = parsePayloadObject(text);
    setInvalid(!parsed.ok);
    if (parsed.ok) {
      onCommit(label, parsed.value);
    }
  };

  return (
    <div className={styles.payloadRow}>
      <span className={styles.payloadRowLabel}>{label}</span>
      <input
        type="text"
        className={styles.payloadRowInput}
        value={draft}
        onChange={(event) => applyText(event.target.value)}
        disabled={disabled}
        spellCheck={false}
        placeholder={t('ai_providers.thinking_payloads_payload_placeholder')}
        aria-invalid={invalid}
        aria-label={t('ai_providers.thinking_payloads_payload_aria', { label })}
      />
    </div>
  );
}

interface PayloadMapEditorProps {
  serialized: string;
  disabled: boolean;
  onCommit: (labels: string[], payloads: ThinkingPayloadMap | undefined) => void;
}

function PayloadMapEditor({ serialized, disabled, onCommit }: PayloadMapEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(serialized);
  const [invalid, setInvalid] = useState(false);
  // Same resync pattern as PayloadRow, for the whole-map textarea.
  const [lastSerialized, setLastSerialized] = useState(serialized);
  if (serialized !== lastSerialized) {
    setLastSerialized(serialized);
    const parsed = parseEffortMap(draft);
    if (
      !(parsed.ok && formatEffortMap(parsed.labels ?? [], parsed.payloads ?? {}) === serialized)
    ) {
      setDraft(serialized);
      setInvalid(false);
    }
  }

  const applyText = (text: string) => {
    setDraft(text);
    const parsed = parseEffortMap(text);
    setInvalid(!parsed.ok);
    if (parsed.ok) {
      onCommit(parsed.labels ?? [], parsed.payloads);
    }
  };

  return (
    <>
      <textarea
        className={styles.payloadTextarea}
        value={draft}
        onChange={(event) => applyText(event.target.value)}
        disabled={disabled}
        rows={8}
        spellCheck={false}
        placeholder={'{\n  "high": {},\n  "max": { "thinking": { "type": "enabled" } }\n}'}
        aria-invalid={invalid}
        aria-label={t('ai_providers.thinking_payloads_toggle')}
      />
      {invalid && (
        <div className={styles.payloadError}>{t('ai_providers.thinking_payloads_invalid')}</div>
      )}
    </>
  );
}

/**
 * Unified per-model reasoning effort editor. One "effort payloads" chip per
 * model row opens a panel that owns the whole effort config: which levels the
 * model accepts (chips), an optional JSON payload per label (rows or raw JSON
 * mode), and provider templates.
 */
export function ModelEffortPayloadsEditor({
  entry,
  disabled,
  updateEntry,
}: ModelInputListRowExtrasArgs) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  // Labels switched on in this session that have neither a level entry nor a
  // payload yet (none/auto stubs, or a level whose payload was just cleared),
  // so their payload row stays visible while the user types.
  const [stubLabels, setStubLabels] = useState<string[]>([]);

  const levels = entry.thinkingLevels ?? [];
  const payloads = entry.thinkingPayloads ?? {};

  const isActive = (label: EffortLabel) =>
    levels.includes(label) || payloads[label] !== undefined || stubLabels.includes(label);

  const activeLabels = EFFORT_LABELS.filter(isActive);
  const persistedCount = EFFORT_LABELS.filter(
    (label) => levels.includes(label) || payloads[label] !== undefined
  ).length;
  const hasAnyConfig =
    levels.length > 0 || Object.keys(payloads).length > 0 || stubLabels.length > 0;

  const commit = (nextLevels: Set<string>, nextPayloads: ThinkingPayloadMap) => {
    const ordered = orderLevels(nextLevels);
    updateEntry({
      thinking: { ...(entry.thinking ?? {}), levels: ordered.length ? ordered : undefined },
      thinkingLevels: ordered.length ? ordered : undefined,
      thinkingPayloads: Object.keys(nextPayloads).length ? nextPayloads : undefined,
    });
  };

  const toggleLabel = (label: EffortLabel) => {
    if (isActive(label)) {
      const nextLevels = new Set(levels);
      nextLevels.delete(label);
      const nextPayloads = { ...payloads };
      delete nextPayloads[label];
      setStubLabels((current) => current.filter((item) => item !== label));
      commit(nextLevels, nextPayloads);
      return;
    }
    if (isReasoningLevel(label)) {
      commit(new Set([...levels, label]), { ...payloads });
      return;
    }
    // none/auto only exist through payloads; show the row and wait for input.
    setStubLabels((current) => [...current, label]);
  };

  const commitPayload = (label: string, value: Record<string, unknown> | undefined) => {
    const nextPayloads = { ...payloads };
    if (value) {
      nextPayloads[label] = value;
    } else {
      delete nextPayloads[label];
      // Keep the row visible while its payload text is empty.
      setStubLabels((current) => (current.includes(label) ? current : [...current, label]));
    }
    updateEntry({
      thinkingPayloads: Object.keys(nextPayloads).length ? nextPayloads : undefined,
    });
  };

  // JSON mode commits the whole effort config: known-label keys become the
  // active set (levels for the six efforts, stubs for none/auto without a
  // payload) while custom levels outside the known labels are preserved.
  const commitEffortMap = (labels: string[], nextPayloads: ThinkingPayloadMap | undefined) => {
    const nextLevels = new Set([
      ...labels.filter(isReasoningLevel),
      ...levels.filter((level) => !THINKING_PAYLOAD_LABELS.has(level)),
    ]);
    setStubLabels(labels.filter((label) => !isReasoningLevel(label) && !nextPayloads?.[label]));
    commit(nextLevels, nextPayloads ?? {});
  };

  const applyPreset = (preset: ThinkingPayloadMap) => {
    setStubLabels([]);
    updateEntry({ thinkingPayloads: clonePayloadMap(preset) });
  };

  const clearAll = () => {
    setStubLabels([]);
    updateEntry({
      thinking: entry.thinking ? { ...entry.thinking, levels: undefined } : undefined,
      thinkingLevels: undefined,
      thinkingPayloads: undefined,
    });
  };

  const toggleClassName = [styles.chip, persistedCount || open ? styles.chipActive : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.editor}>
      <button
        type="button"
        className={toggleClassName}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
        title={persistedCount ? activeLabels.join(', ') : undefined}
      >
        {t('ai_providers.thinking_payloads_toggle')}
        {persistedCount ? ` (${persistedCount})` : ''}
      </button>
      {open && (
        <div className={styles.panel}>
          <div className={styles.sectionLabel}>Catalog metadata</div>
          <input
            className="input"
            value={entry.displayName ?? ''}
            onChange={(event) => updateEntry({ displayName: event.target.value || undefined })}
            placeholder="Display name (optional)"
            disabled={disabled}
          />
          <label>
            <input
              type="checkbox"
              checked={Boolean(entry.image)}
              onChange={(event) => updateEntry({ image: event.target.checked || undefined })}
              disabled={disabled}
            />{' '}
            Image generation model
          </label>
          <input
            className="input"
            defaultValue={(entry.inputModalities ?? []).join(', ')}
            onBlur={(event) => {
              const values = event.target.value
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
              updateEntry({ inputModalities: values.length ? values : undefined });
            }}
            placeholder="Input modalities: text, image"
            disabled={disabled}
          />
          <input
            className="input"
            defaultValue={(entry.outputModalities ?? []).join(', ')}
            onBlur={(event) => {
              const values = event.target.value
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
              updateEntry({ outputModalities: values.length ? values : undefined });
            }}
            placeholder="Output modalities: text, image"
            disabled={disabled}
          />
          <div className={styles.panelHeader}>
            <span className={styles.sectionLabel}>
              {t('ai_providers.thinking_payloads_levels_label')}
            </span>
            <button
              type="button"
              className={[styles.chip, jsonMode ? styles.chipActive : ''].filter(Boolean).join(' ')}
              onClick={() => setJsonMode((value) => !value)}
              disabled={disabled}
              aria-pressed={jsonMode}
            >
              {t('ai_providers.thinking_payloads_json_toggle')}
            </button>
          </div>
          <div className={styles.chips}>
            {EFFORT_LABELS.map((label) => {
              const on = isActive(label);
              const hasPayload = payloads[label] !== undefined;
              const className = [styles.chip, on ? styles.chipActive : '']
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  type="button"
                  key={label}
                  className={className}
                  onClick={() => toggleLabel(label)}
                  disabled={disabled}
                  aria-pressed={on}
                >
                  {t(`ai_providers.reasoning_level_${label}`)}
                  {hasPayload && <span className={styles.payloadDot} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {jsonMode ? (
            <PayloadMapEditor
              serialized={formatEffortMap(activeLabels, payloads)}
              disabled={disabled}
              onCommit={commitEffortMap}
            />
          ) : (
            activeLabels.length > 0 && (
              <div className={styles.payloadRows}>
                {activeLabels.map((label) => (
                  <PayloadRow
                    key={label}
                    label={label}
                    value={payloads[label]}
                    disabled={disabled}
                    onCommit={commitPayload}
                  />
                ))}
              </div>
            )
          )}
          <div className={styles.sectionLabel}>
            {t('ai_providers.thinking_payloads_templates_label')}
          </div>
          <div className={styles.chips}>
            {THINKING_PAYLOAD_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className={styles.chip}
                onClick={() => applyPreset(preset.payloads)}
                disabled={disabled}
              >
                {t(`ai_providers.thinking_payloads_preset_${preset.id}`)}
              </button>
            ))}
            <button
              type="button"
              className={styles.chip}
              onClick={clearAll}
              disabled={disabled || !hasAnyConfig}
            >
              {t('ai_providers.thinking_payloads_preset_clear')}
            </button>
          </div>
          <div className={styles.hint}>{t('ai_providers.thinking_payloads_hint')}</div>
        </div>
      )}
    </div>
  );
}
