// Global test setup: jest-dom matchers + jsdom polyfills for browser APIs
// the panel relies on but jsdom does not implement.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import i18n from '@/i18n';

// Give async assertions (findBy*/waitFor) more slack than the 1000ms default.
// Tests run in parallel workers on a slow /mnt/c (9p) mount with v8 coverage
// instrumentation, so a genuinely-correct async save/render flow can take well
// over a second under contention. This widens the wait window without changing
// what is asserted, keeping load-sensitive tests deterministic.
configure({ asyncUtilTimeout: 5000 });

// Pin the language so component tests assert against deterministic English
// strings regardless of the host locale.
beforeAll(async () => {
  await i18n.changeLanguage('en');
});

// Unmount React trees and clear the DOM between tests so they stay isolated.
afterEach(() => {
  cleanup();
});

// matchMedia — used by useMediaQuery and useThemeStore.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// ResizeObserver — used by useSplashTitleFit, VisualConfigEditor.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// IntersectionObserver — used by scroll-spy in VisualConfigEditor.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// jsdom ships a throwing "Not implemented" stub for scrollTo and omits
// scrollIntoView; override both unconditionally with no-ops.
window.scrollTo = (() => {}) as typeof window.scrollTo;
Element.prototype.scrollIntoView = () => {};

// crypto.getRandomValues — used by generateSecureApiKey. Node 20+ exposes
// globalThis.crypto, but guard in case the jsdom environment hid it.
if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
