/**
 * AIPROXY brand identity — Imagine-generated raster mark is the source of truth.
 * Vectors were retired for product mark quality; keep wordmark text out of the mark asset.
 */
import mark from './brand/aiproxy-mark.png';
import markPremium from './brand/aiproxy-mark-premium.png';
import icon32 from './brand/favicon-32.png';
import icon16 from './brand/favicon-16.png';
import icon192 from './brand/aiproxy-icon-192.png';
import og from './brand/aiproxy-og.png';

/** Primary product mark (splash, shell, about). */
export const AIPROXY_MARK = mark;
/** Premium glass marketing mark. */
export const AIPROXY_MARK_PREMIUM = markPremium;
/** Alias used by older call sites expecting a lockup — same primary mark (wordmark is text in UI). */
export const AIPROXY_LOCKUP = mark;
/** Mono alias — primary dark mark (light UI should invert via CSS if needed). */
export const AIPROXY_MARK_MONO = mark;
/** Tab favicon (32px Imagine downsample). */
export const AIPROXY_FAVICON = icon32;
export const AIPROXY_FAVICON_16 = icon16;
export const AIPROXY_FAVICON_32 = icon32;

export const AIPROXY_BRAND_ASSETS = {
  icon: mark,
  icon192,
  icon512: new URL('./brand/aiproxy-icon-512.png', import.meta.url).href,
  favicon16: icon16,
  favicon32: icon32,
  markPremium,
  og,
} as const;

export const AIPROXY_BRAND = {
  canvas: '#0D1114',
  surface1: '#13191D',
  surface2: '#1A2227',
  ink: '#E7ECEA',
  route: '#D3A84C',
} as const;
