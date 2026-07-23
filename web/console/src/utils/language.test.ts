import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { STORAGE_KEY_LANGUAGE } from '@/utils/constants';
import { isSupportedLanguage, getInitialLanguage } from './language';

describe('isSupportedLanguage', () => {
  it.each(['zh-CN', 'zh-TW', 'en', 'ru'])('returns true for the supported language %j', (lang) => {
    const result = isSupportedLanguage(lang);

    expect(result).toBe(true);
  });

  it('returns false for an unsupported language', () => {
    const result = isSupportedLanguage('fr');

    expect(result).toBe(false);
  });

  it('returns false for an empty string', () => {
    const result = isSupportedLanguage('');

    expect(result).toBe(false);
  });
});

describe('getInitialLanguage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('returns the stored language when it is a bare supported code', () => {
    localStorage.setItem(STORAGE_KEY_LANGUAGE, 'ru');

    const result = getInitialLanguage();

    expect(result).toBe('ru');
  });

  it('reads the language from a zustand-style persisted state envelope', () => {
    localStorage.setItem(STORAGE_KEY_LANGUAGE, JSON.stringify({ state: { language: 'zh-TW' } }));

    const result = getInitialLanguage();

    expect(result).toBe('zh-TW');
  });

  it('reads the language from a plain JSON object with a language field', () => {
    localStorage.setItem(STORAGE_KEY_LANGUAGE, JSON.stringify({ language: 'en' }));

    const result = getInitialLanguage();

    expect(result).toBe('en');
  });

  it('reads the language from a JSON string primitive', () => {
    localStorage.setItem(STORAGE_KEY_LANGUAGE, JSON.stringify('zh-CN'));

    const result = getInitialLanguage();

    expect(result).toBe('zh-CN');
  });

  it('ignores an unsupported stored language and falls back to the browser language', () => {
    localStorage.setItem(STORAGE_KEY_LANGUAGE, JSON.stringify({ state: { language: 'fr' } }));
    vi.stubGlobal('navigator', { languages: ['de-DE'], language: 'de-DE' });

    const result = getInitialLanguage();

    expect(result).toBe('en');
  });

  it('detects Traditional Chinese from a zh-TW browser locale', () => {
    vi.stubGlobal('navigator', { languages: ['zh-TW'], language: 'zh-TW' });

    const result = getInitialLanguage();

    expect(result).toBe('zh-TW');
  });

  it('detects Traditional Chinese from a zh-HK browser locale', () => {
    vi.stubGlobal('navigator', { languages: ['zh-HK'], language: 'zh-HK' });

    const result = getInitialLanguage();

    expect(result).toBe('zh-TW');
  });

  it('maps a generic zh locale to Simplified Chinese', () => {
    vi.stubGlobal('navigator', { languages: ['zh-CN'], language: 'zh-CN' });

    const result = getInitialLanguage();

    expect(result).toBe('zh-CN');
  });

  it('maps a Russian browser locale to ru', () => {
    vi.stubGlobal('navigator', { languages: ['ru-RU'], language: 'ru-RU' });

    const result = getInitialLanguage();

    expect(result).toBe('ru');
  });

  it('falls back to en for an unrecognised browser locale', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' });

    const result = getInitialLanguage();

    expect(result).toBe('en');
  });

  it('prefers navigator.languages[0] over navigator.language', () => {
    vi.stubGlobal('navigator', { languages: ['ru-RU'], language: 'en-US' });

    const result = getInitialLanguage();

    expect(result).toBe('ru');
  });

  it('falls back to navigator.language when languages is empty', () => {
    vi.stubGlobal('navigator', { languages: [], language: 'ru-RU' });

    const result = getInitialLanguage();

    expect(result).toBe('ru');
  });
});
