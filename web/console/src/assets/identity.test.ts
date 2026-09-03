import { describe, expect, it } from 'vitest';
import {
  AIPROXY_BRAND,
  AIPROXY_BRAND_ASSETS,
  AIPROXY_FAVICON_32,
  AIPROXY_LOCKUP,
  AIPROXY_MARK,
  AIPROXY_MARK_MONO,
  AIPROXY_MARK_PREMIUM,
} from './identity';

describe('AIPROXY brand identity', () => {
  it('uses the vector master as the product logo', () => {
    const isSvgAsset = (asset: string, filePattern: RegExp) =>
      asset.startsWith('data:image/svg+xml') || filePattern.test(asset);

    expect(isSvgAsset(AIPROXY_MARK, /aiproxy-mark.*\.svg/i)).toBe(true);
    expect(isSvgAsset(AIPROXY_LOCKUP, /aiproxy-lockup.*\.svg/i)).toBe(true);
    expect(isSvgAsset(AIPROXY_MARK_MONO, /aiproxy-mark-mono.*\.svg/i)).toBe(true);
    expect(isSvgAsset(AIPROXY_MARK_PREMIUM, /aiproxy-mark-premium.*\.svg/i)).toBe(true);
    expect(AIPROXY_FAVICON_32).toMatch(/favicon-32|data:image|\.png/i);
  });

  it('exposes brand pack assets', () => {
    expect(AIPROXY_BRAND_ASSETS.icon192).toBeTruthy();
    expect(AIPROXY_BRAND_ASSETS.og).toBeTruthy();
  });

  it('keeps the Route Foundry dark brand palette', () => {
    expect(AIPROXY_BRAND.canvas).toBe('#0D1114');
    expect(AIPROXY_BRAND.route).toBe('#D3A84C');
    expect(AIPROXY_BRAND.ink).toBe('#E7ECEA');
  });
});
