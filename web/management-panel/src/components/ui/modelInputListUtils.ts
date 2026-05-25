import type { ModelAlias, ThinkingSupport } from '@/types';

export interface ModelEntry {
  name: string;
  alias: string;
  image?: boolean;
  regex?: boolean;
  thinking?: ThinkingSupport;
  thinkingLevels?: string[];
  raw?: Record<string, unknown>;
}

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
    if (model.image) {
      entry.image = true;
    }
    if (model.thinking) {
      entry.thinking = { ...model.thinking };
    }
    if (Array.isArray(model.thinkingLevels) && model.thinkingLevels.length) {
      entry.thinkingLevels = [...model.thinkingLevels];
    } else if (Array.isArray(model.thinking?.levels) && model.thinking.levels.length) {
      entry.thinkingLevels = [...model.thinking.levels];
    }
    if (model.raw) {
      entry.raw = { ...model.raw };
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
      if (entry.image) {
        model.image = true;
      }
      const thinking = entry.thinking ? { ...entry.thinking } : undefined;
      if (Array.isArray(entry.thinkingLevels) && entry.thinkingLevels.length) {
        const levels = [...entry.thinkingLevels];
        model.thinking = { ...(thinking ?? {}), levels };
        model.thinkingLevels = levels;
      } else if (hasThinkingConfig(thinking)) {
        model.thinking = thinking;
      }
      if (entry.raw) {
        model.raw = { ...entry.raw };
      }
      return model;
    });
};
