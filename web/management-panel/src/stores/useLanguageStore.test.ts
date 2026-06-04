import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the i18n boundary so language switching does not depend on the real
// i18next instance and can be asserted directly.
vi.mock('@/i18n', () => ({
  default: { changeLanguage: vi.fn() },
}));

import i18n from '@/i18n';
import { useLanguageStore } from './useLanguageStore';

const changeLanguageMock = vi.mocked(i18n.changeLanguage);

describe('useLanguageStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useLanguageStore.setState({ language: 'en' });
    changeLanguageMock.mockClear();
  });

  describe('setLanguage', () => {
    it('updates the language state to a supported language', () => {
      useLanguageStore.getState().setLanguage('ru');

      expect(useLanguageStore.getState().language).toBe('ru');
    });

    it('forwards the supported language to i18next', () => {
      useLanguageStore.getState().setLanguage('zh-TW');

      expect(changeLanguageMock).toHaveBeenCalledTimes(1);
      expect(changeLanguageMock).toHaveBeenCalledWith('zh-TW');
    });

    it('ignores an unsupported language and leaves the state unchanged', () => {
      useLanguageStore.setState({ language: 'en' });

      useLanguageStore.getState().setLanguage('fr');

      expect(useLanguageStore.getState().language).toBe('en');
    });

    it('does not call i18next for an unsupported language', () => {
      useLanguageStore.getState().setLanguage('fr');

      expect(changeLanguageMock).not.toHaveBeenCalled();
    });

    it('ignores an empty string language', () => {
      useLanguageStore.setState({ language: 'en' });

      useLanguageStore.getState().setLanguage('');

      expect(useLanguageStore.getState().language).toBe('en');
      expect(changeLanguageMock).not.toHaveBeenCalled();
    });
  });

  describe('toggleLanguage', () => {
    it('advances from zh-CN to zh-TW', () => {
      useLanguageStore.setState({ language: 'zh-CN' });

      useLanguageStore.getState().toggleLanguage();

      expect(useLanguageStore.getState().language).toBe('zh-TW');
    });

    it('advances from zh-TW to en', () => {
      useLanguageStore.setState({ language: 'zh-TW' });

      useLanguageStore.getState().toggleLanguage();

      expect(useLanguageStore.getState().language).toBe('en');
    });

    it('advances from en to ru', () => {
      useLanguageStore.setState({ language: 'en' });

      useLanguageStore.getState().toggleLanguage();

      expect(useLanguageStore.getState().language).toBe('ru');
    });

    it('wraps from ru back to zh-CN', () => {
      useLanguageStore.setState({ language: 'ru' });

      useLanguageStore.getState().toggleLanguage();

      expect(useLanguageStore.getState().language).toBe('zh-CN');
    });

    it('forwards the next language to i18next when toggling', () => {
      useLanguageStore.setState({ language: 'en' });

      useLanguageStore.getState().toggleLanguage();

      expect(changeLanguageMock).toHaveBeenCalledTimes(1);
      expect(changeLanguageMock).toHaveBeenCalledWith('ru');
    });
  });
});
