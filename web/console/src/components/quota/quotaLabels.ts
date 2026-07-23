/** Short, human-friendly provider label (e.g. "Claude", "Gemini CLI", "iFlow"). */

import type { TFunction } from 'i18next';

export function getProviderLabel(t: TFunction, type: string): string {
  const key = `auth_files.filter_${type}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (type.toLowerCase() === 'iflow') return 'iFlow';
  return type.charAt(0).toUpperCase() + type.slice(1);
}
