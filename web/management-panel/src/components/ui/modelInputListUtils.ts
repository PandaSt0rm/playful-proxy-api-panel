import type { ModelAlias } from '@/types';

export interface ModelEntry {
  name: string;
  alias: string;
  thinkingLevels?: string[];
}

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((model) => {
    const entry: ModelEntry = {
      name: model.name || '',
      alias: model.alias || ''
    };
    if (Array.isArray(model.thinkingLevels) && model.thinkingLevels.length) {
      entry.thinkingLevels = [...model.thinkingLevels];
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
      if (Array.isArray(entry.thinkingLevels) && entry.thinkingLevels.length) {
        model.thinkingLevels = [...entry.thinkingLevels];
      }
      return model;
    });
};
