import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelInputListRowExtrasArgs } from '@/components/ui/ModelInputList';
import type { ThinkingPayloadMap } from '@/types';
import {
  EFFORT_LABELS,
  EFFORT_PRESETS,
  MODEL_ENTRY_CAPABILITIES,
  REASONING_LEVELS,
  isEffortLabel,
  isReasoningLevel,
  recommendedPresetIds,
  type EffortLabel,
  type EffortPreset,
  type ModelEntryEditorMode,
} from './modelEffortPresets';
import styles from './ModelEffortPayloadsEditor.module.scss';

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
      if (!isEffortLabel(label)) return { ok: false };
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
    if (!(
      parsed.ok && formatEffortMap(parsed.labels ?? [], parsed.payloads ?? {}) === serialized
    )) {
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

interface ModelEffortPayloadsEditorProps extends ModelInputListRowExtrasArgs {
  /** Provider editor the row belongs to; decides which fields persist and which templates lead. */
  mode: ModelEntryEditorMode;
  /** Draft base URL of the provider being edited, used to recommend templates. */
  baseUrl?: string;
}

/**
 * Per-model options editor. One chip per model row opens a panel with the
 * catalog metadata the provider can store and, where the provider supports it,
 * the whole effort config: which levels the model accepts (chips), an optional
 * JSON payload per label (rows or raw JSON mode), and upstream templates.
 */
export function ModelEffortPayloadsEditor({
  entry,
  disabled,
  updateEntry,
  mode,
  baseUrl,
}: ModelEffortPayloadsEditorProps) {
  const { t } = useTranslation();
  const capabilities = MODEL_ENTRY_CAPABILITIES[mode];
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
      ...levels.filter((level) => !isEffortLabel(level)),
    ]);
    setStubLabels(labels.filter((label) => !isReasoningLevel(label) && !nextPayloads?.[label]));
    commit(nextLevels, nextPayloads ?? {});
  };

  // A template is a complete replacement value: it describes the whole
  // thinking capability, so a stale budget range from the previous template
  // cannot survive and turn a levels-only model back into a hybrid one.
  const applyPreset = (preset: EffortPreset) => {
    setStubLabels([]);
    const payloadMap = clonePayloadMap(preset.payloads);
    updateEntry({
      thinking: {
        levels: preset.levels.length ? [...preset.levels] : undefined,
        dynamicAllowed: preset.dynamicAllowed || undefined,
        zeroAllowed: preset.zeroAllowed || undefined,
      },
      thinkingLevels: preset.levels.length ? [...preset.levels] : undefined,
      thinkingPayloads: Object.keys(payloadMap).length ? payloadMap : undefined,
    });
  };

  const clearAll = () => {
    setStubLabels([]);
    updateEntry({
      thinking: entry.thinking
        ? {
            ...entry.thinking,
            levels: undefined,
            dynamicAllowed: undefined,
            zeroAllowed: undefined,
          }
        : undefined,
      thinkingLevels: undefined,
      thinkingPayloads: undefined,
    });
  };

  // Templates for the endpoint being edited come first; the rest stay
  // reachable because a provider entry can point anywhere.
  const recommendedIds = recommendedPresetIds(mode, baseUrl);
  const recommendedPresets = EFFORT_PRESETS.filter((preset) =>
    recommendedIds.includes(preset.id)
  );
  const otherPresets = EFFORT_PRESETS.filter((preset) => !recommendedIds.includes(preset.id));

  const toggleClassName = [styles.chip, persistedCount || open ? styles.chipActive : '']
    .filter(Boolean)
    .join(' ');

  const renderPresetChips = (presets: readonly EffortPreset[]) =>
    presets.map((preset) => (
      <button
        type="button"
        key={preset.id}
        className={styles.chip}
        onClick={() => applyPreset(preset)}
        disabled={disabled}
      >
        {t(`ai_providers.thinking_payloads_preset_${preset.id}`)}
      </button>
    ));

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
        {t(
          capabilities.effort
            ? 'ai_providers.thinking_payloads_toggle'
            : 'ai_providers.model_options_toggle'
        )}
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
          {capabilities.modalities && (
            <>
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
            </>
          )}
          {capabilities.effort && (
            <>
              <div className={styles.panelHeader}>
                <span className={styles.sectionLabel}>
                  {t('ai_providers.thinking_payloads_levels_label')}
                </span>
                <button
                  type="button"
                  className={[styles.chip, jsonMode ? styles.chipActive : '']
                    .filter(Boolean)
                    .join(' ')}
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
              {recommendedPresets.length > 0 && (
                <>
                  <div className={styles.sectionLabel}>
                    {t('ai_providers.thinking_payloads_templates_recommended_label')}
                  </div>
                  <div className={styles.chips}>{renderPresetChips(recommendedPresets)}</div>
                </>
              )}
              <div className={styles.sectionLabel}>
                {t(
                  recommendedPresets.length
                    ? 'ai_providers.thinking_payloads_templates_other_label'
                    : 'ai_providers.thinking_payloads_templates_label'
                )}
              </div>
              <div className={styles.chips}>
                {renderPresetChips(otherPresets)}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
