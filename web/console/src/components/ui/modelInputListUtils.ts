import type { ModelAlias, ThinkingPayloadMap, ThinkingSupport } from '@/types';

export interface ModelEntry {
  name: string;
  alias: string;
  regex?: boolean;
  displayName?: string;
  forceMapping?: boolean;
  image?: boolean;
  inputModalities?: string[];
  outputModalities?: string[];
  raw?: Record<string, unknown>;
  thinking?: ThinkingSupport;
  thinkingLevels?: string[];
  thinkingPayloads?: ThinkingPayloadMap;
}

const cloneThinkingPayloads = (payloads?: ThinkingPayloadMap): ThinkingPayloadMap | undefined => {
  if (!payloads) return undefined;
  const entries = Object.entries(payloads).filter(
    ([, value]) => value && typeof value === 'object' && Object.keys(value).length
  );
  if (!entries.length) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, { ...value }]));
};

const hasThinkingConfig = (thinking?: ThinkingSupport): thinking is ThinkingSupport =>
  Boolean(
    thinking &&
    (thinking.min !== undefined ||
      thinking.max !== undefined ||
      thinking.zeroAllowed !== undefined ||
      thinking.dynamicAllowed !== undefined ||
      (Array.isArray(thinking.levels) && thinking.levels.length > 0))
  );

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((model) => {
    const entry: ModelEntry = {
      name: model.name || '',
      alias: model.alias || '',
    };
    if (model.displayName) {
      entry.displayName = model.displayName;
    }
    if (model.forceMapping !== undefined) {
      entry.forceMapping = model.forceMapping;
    }
    if (model.image !== undefined) {
      entry.image = model.image;
    }
    if (Array.isArray(model.inputModalities) && model.inputModalities.length) {
      entry.inputModalities = [...model.inputModalities];
    }
    if (Array.isArray(model.outputModalities) && model.outputModalities.length) {
      entry.outputModalities = [...model.outputModalities];
    }
    if (model.raw) {
      entry.raw = { ...model.raw };
    }
    if (model.thinking) {
      entry.thinking = { ...model.thinking };
    }
    if (Array.isArray(model.thinkingLevels) && model.thinkingLevels.length) {
      entry.thinkingLevels = [...model.thinkingLevels];
    } else if (Array.isArray(model.thinking?.levels) && model.thinking.levels.length) {
      entry.thinkingLevels = [...model.thinking.levels];
    }
    const payloads = cloneThinkingPayloads(model.thinkingPayloads);
    if (payloads) {
      entry.thinkingPayloads = payloads;
    }
    return entry;
  });
};

export const entriesToModels = (entries: ModelEntry[]): ModelAlias[] => {
  return entries
    .filter((entry) => entry.name.trim())
    .map((entry) => {
      const model: ModelAlias = { name: entry.name.trim() };
      const alias = entry.alias.trim();
      if (alias && alias !== model.name) {
        model.alias = alias;
      }
      const displayName = entry.displayName?.trim();
      if (displayName) {
        model.displayName = displayName;
      }
      if (entry.forceMapping !== undefined) {
        model.forceMapping = entry.forceMapping;
      }
      if (entry.image !== undefined) {
        model.image = entry.image;
      }
      if (Array.isArray(entry.inputModalities) && entry.inputModalities.length) {
        model.inputModalities = [...entry.inputModalities];
      }
      if (Array.isArray(entry.outputModalities) && entry.outputModalities.length) {
        model.outputModalities = [...entry.outputModalities];
      }
      if (entry.raw) {
        model.raw = { ...entry.raw };
      }
      const thinking = entry.thinking ? { ...entry.thinking } : undefined;
      if (Array.isArray(entry.thinkingLevels) && entry.thinkingLevels.length) {
        const levels = [...entry.thinkingLevels];
        model.thinking = { ...(thinking ?? {}), levels };
        model.thinkingLevels = levels;
      } else if (hasThinkingConfig(thinking)) {
        model.thinking = thinking;
      }
      const payloads = cloneThinkingPayloads(entry.thinkingPayloads);
      if (payloads) {
        model.thinkingPayloads = payloads;
      }
      return model;
    });
};
