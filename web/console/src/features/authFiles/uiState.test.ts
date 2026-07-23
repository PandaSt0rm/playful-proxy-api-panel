import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AUTH_FILES_SORT_MODES,
  isAuthFilesSortMode,
  readAuthFilesUiState,
  writeAuthFilesUiState,
  readPersistedAuthFilesCompactMode,
  writePersistedAuthFilesCompactMode,
} from './uiState';

const UI_STATE_KEY = 'authFilesPage.uiState';
const COMPACT_MODE_KEY = 'authFilesPage.compactMode';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('AUTH_FILES_SORT_MODES', () => {
  it('exposes the three supported sort modes in declaration order', () => {
    expect(AUTH_FILES_SORT_MODES).toEqual(['default', 'az', 'priority']);
  });
});

describe('isAuthFilesSortMode', () => {
  it.each([
    ['default', true],
    ['az', true],
    ['priority', true],
  ])('accepts the known sort mode %s', (value, expected) => {
    const result = isAuthFilesSortMode(value);

    expect(result).toBe(expected);
  });

  it('rejects an unknown string value', () => {
    const result = isAuthFilesSortMode('newest');

    expect(result).toBe(false);
  });

  it('rejects a non-string value', () => {
    const result = isAuthFilesSortMode(42);

    expect(result).toBe(false);
  });

  it('rejects null', () => {
    const result = isAuthFilesSortMode(null);

    expect(result).toBe(false);
  });
});

describe('readAuthFilesUiState', () => {
  it('returns null when no state has been persisted', () => {
    const result = readAuthFilesUiState();

    expect(result).toBeNull();
  });

  it('returns the parsed object stored in localStorage', () => {
    const stored = { filter: 'claude', page: 3, sortMode: 'az' as const };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(stored));

    const result = readAuthFilesUiState();

    expect(result).toEqual(stored);
  });

  it('falls back to sessionStorage when localStorage is empty', () => {
    const stored = { search: 'token', compactMode: true };
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(stored));

    const result = readAuthFilesUiState();

    expect(result).toEqual(stored);
  });

  it('prefers localStorage over sessionStorage when both are present', () => {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({ filter: 'from-local' }));
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ filter: 'from-session' }));

    const result = readAuthFilesUiState();

    expect(result).toEqual({ filter: 'from-local' });
  });

  it('returns null when stored JSON is a primitive rather than an object', () => {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(7));

    const result = readAuthFilesUiState();

    expect(result).toBeNull();
  });

  it('returns null when stored JSON is malformed and parsing throws', () => {
    localStorage.setItem(UI_STATE_KEY, '{ not valid json');

    const result = readAuthFilesUiState();

    expect(result).toBeNull();
  });
});

describe('writeAuthFilesUiState', () => {
  it('serializes the state into localStorage under the ui-state key', () => {
    const state = { filter: 'codex', page: 2, problemOnly: true };

    writeAuthFilesUiState(state);

    expect(localStorage.getItem(UI_STATE_KEY)).toBe(JSON.stringify(state));
  });

  it('clears any stale sessionStorage copy when writing', () => {
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ filter: 'old' }));

    writeAuthFilesUiState({ filter: 'new' });

    expect(sessionStorage.getItem(UI_STATE_KEY)).toBeNull();
  });

  it('round-trips through readAuthFilesUiState', () => {
    const state = { filter: 'gemini', pageSize: 12, sortMode: 'priority' as const };

    writeAuthFilesUiState(state);

    expect(readAuthFilesUiState()).toEqual(state);
  });
});

describe('readPersistedAuthFilesCompactMode', () => {
  it('returns null when no compact-mode preference is stored', () => {
    const result = readPersistedAuthFilesCompactMode();

    expect(result).toBeNull();
  });

  it('returns true when the stored value is the boolean true', () => {
    localStorage.setItem(COMPACT_MODE_KEY, JSON.stringify(true));

    const result = readPersistedAuthFilesCompactMode();

    expect(result).toBe(true);
  });

  it('returns false when the stored value is the boolean false', () => {
    localStorage.setItem(COMPACT_MODE_KEY, JSON.stringify(false));

    const result = readPersistedAuthFilesCompactMode();

    expect(result).toBe(false);
  });

  it('returns false when the stored value is a non-true JSON value', () => {
    localStorage.setItem(COMPACT_MODE_KEY, JSON.stringify('true'));

    const result = readPersistedAuthFilesCompactMode();

    expect(result).toBe(false);
  });

  it('returns null when the stored value is malformed JSON', () => {
    localStorage.setItem(COMPACT_MODE_KEY, 'not-json');

    const result = readPersistedAuthFilesCompactMode();

    expect(result).toBeNull();
  });
});

describe('writePersistedAuthFilesCompactMode', () => {
  it('stores true as the JSON literal true', () => {
    writePersistedAuthFilesCompactMode(true);

    expect(localStorage.getItem(COMPACT_MODE_KEY)).toBe('true');
  });

  it('stores false as the JSON literal false', () => {
    writePersistedAuthFilesCompactMode(false);

    expect(localStorage.getItem(COMPACT_MODE_KEY)).toBe('false');
  });

  it('round-trips true through readPersistedAuthFilesCompactMode', () => {
    writePersistedAuthFilesCompactMode(true);

    expect(readPersistedAuthFilesCompactMode()).toBe(true);
  });
});

describe('writeAuthFilesUiState localStorage failure', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    setItemSpy?.mockRestore();
  });

  it('swallows a throwing localStorage.setItem without propagating the error', () => {
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => writeAuthFilesUiState({ filter: 'all' })).not.toThrow();
  });
});
