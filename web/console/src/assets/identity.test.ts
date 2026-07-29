import { describe, expect, it } from 'vitest';
import {
  AIPROXY_BRAND,
  AIPROXY_BRAND_ASSETS,
  AIPROXY_FAVICON_32,
  AIPROXY_MARK,
  AIPROXY_MARK_PREMIUM,
} from './identity';

describe('AIPROXY brand identity', () => {
  it('uses Imagine raster mark as the product logo', () => {
    expect(AIPROXY_MARK).toMatch(/aiproxy-mark|data:image|\.png/i);
    expect(AIPROXY_MARK_PREMIUM).toMatch(/aiproxy-mark-premium|data:image|\.png/i);
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
