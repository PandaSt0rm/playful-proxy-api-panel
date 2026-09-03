/**
 * AIPROXY brand identity — deterministic vectors are the source of truth.
 * Keep wordmark text out of the standalone product mark.
 */
import mark from './aiproxy-mark.svg';
import lockup from './aiproxy-lockup.svg';
import monochromeMark from './aiproxy-mark-mono.svg';
import markPremium from './brand/aiproxy-mark-premium.svg';
import icon32 from './brand/favicon-32.png';
import icon16 from './brand/favicon-16.png';
import icon192 from './brand/aiproxy-icon-192.png';
import og from './brand/aiproxy-og.png';

/** Primary product mark (splash, shell, about). */
export const AIPROXY_MARK = mark;
/** Premium glass marketing mark. */
export const AIPROXY_MARK_PREMIUM = markPremium;
/** Horizontal mark and wordmark for wide brand placements. */
export const AIPROXY_LOCKUP = lockup;
/** Single-color mark for constrained print and system contexts. */
export const AIPROXY_MARK_MONO = monochromeMark;
/** Tab favicon rendered from the vector master at its target size. */
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
