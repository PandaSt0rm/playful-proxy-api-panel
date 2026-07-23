export type FetchModelsProxyProvider =
  'openai' | 'zai' | 'openrouter' | 'ollama' | 'claude' | 'gemini' | 'codex';

const storageKey = (provider: FetchModelsProxyProvider) =>
  `aiproxy.fetchModelsUseKeyProxy.${provider}`;

export const fetchModelsProxyPreference = {
  read(provider: FetchModelsProxyProvider, fallback: boolean): boolean {
    if (typeof window === 'undefined') {
      return fallback;
    }
    try {
      const stored = window.localStorage.getItem(storageKey(provider));
      if (stored === null) return fallback;
      return stored === 'true';
    } catch {
      return fallback;
    }
  },

  write(provider: FetchModelsProxyProvider, value: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey(provider), value ? 'true' : 'false');
    } catch {
      // localStorage may be unavailable (private mode, quota); silently skip persistence.
    }
  },
};
