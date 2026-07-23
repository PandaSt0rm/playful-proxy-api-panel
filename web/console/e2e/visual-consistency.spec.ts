import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  loginViaUi,
  mockManagementApi,
  seedEnglish,
  seedTheme,
  type SeededTheme,
  VALID_KEY,
} from './fixtures';
import { PANEL_MANIFEST, VISUAL_FAMILY_MANIFEST } from './panelManifest';

const REPRESENTATIVE_PATHS = ['/', '/config', '/ai-providers', '/ai-providers/openai/new'] as const;
const STRUCTURAL_SURFACES = [
  '.route-shell',
  '.module-rail',
  '.context-navigation',
  '.route-topbar',
  '.route-workspace',
  '.tablet-context-overlay',
  '.mobile-navigation-drawer',
  '.route-popover',
] as const;

type FlatStyleViolation = {
  identity: string;
  property: string;
  value: string;
};

function isFullManifestProject(projectName: string, theme: SeededTheme): boolean {
  if (projectName === 'desktop-chromium') return theme !== 'auto';
  return theme === 'light' && /^(tablet|mobile).*chromium$/.test(projectName);
}

function isCrossBrowserProject(projectName: string): boolean {
  return projectName === 'desktop-firefox' || projectName === 'desktop-webkit';
}

async function waitForSettledUi(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
}

async function openRoute(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`/#${path}`);
  await waitForSettledUi(page);
  await expect(page.getByText('Unexpected Application Error!')).toHaveCount(0);
}

async function resolveCanonicalTokens(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const probe = document.createElement('span');
    probe.style.position = 'fixed';
    probe.style.pointerEvents = 'none';
    document.body.append(probe);
    const resolveColor = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const tokens = {
      canvas: resolveColor('--canvas'),
      surface1: resolveColor('--surface-1'),
      surface2: resolveColor('--surface-2'),
      rule: resolveColor('--rule'),
      route: resolveColor('--route'),
      ok: resolveColor('--ok'),
      caution: resolveColor('--caution'),
      danger: resolveColor('--danger'),
      theme: document.documentElement.getAttribute('data-theme') ?? 'light',
      focusOffset: style.getPropertyValue('--focus-offset').trim(),
    };
    probe.remove();
    return tokens;
  });
}

async function scanFlatStyleInvariants(page: Page): Promise<FlatStyleViolation[]> {
  return page.evaluate((structuralSelectors) => {
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const identity = (element: HTMLElement) => {
      const id = element.id ? `#${element.id}` : '';
      const classes =
        typeof element.className === 'string'
          ? element.className
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 3)
              .map((name) => `.${name}`)
              .join('')
          : '';
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const alpha = (color: string) => {
      const match = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
      return match ? Number(match[1]) : 1;
    };
    const violations: FlatStyleViolation[] = [];
    const elements = [...document.querySelectorAll<HTMLElement>('body *')].filter(visible);

    for (const element of elements) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const radius = style.borderTopLeftRadius;
      const intrinsicCircle = radius === '50%' && Math.abs(rect.width - rect.height) <= 1;
      if (radius !== '0px' && !intrinsicCircle) {
        violations.push({ identity: identity(element), property: 'border-radius', value: radius });
      }
      if (style.boxShadow !== 'none') {
        violations.push({
          identity: identity(element),
          property: 'box-shadow',
          value: style.boxShadow,
        });
      }
      const backdrop = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter');
      if (backdrop && backdrop !== 'none') {
        violations.push({
          identity: identity(element),
          property: 'backdrop-filter',
          value: backdrop,
        });
      }
      if (style.backgroundImage !== 'none' && !String(element.className).includes('trafficGrid')) {
        violations.push({
          identity: identity(element),
          property: 'background-image',
          value: style.backgroundImage,
        });
      }
    }

    for (const selector of structuralSelectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        if (!visible(element)) continue;
        const background = getComputedStyle(element).backgroundColor;
        if (background === 'transparent' || alpha(background) < 1) {
          violations.push({
            identity: identity(element),
            property: 'opaque-surface',
            value: background,
          });
        }
      }
    }

    return violations.slice(0, 50);
  }, STRUCTURAL_SURFACES);
}

async function assertStructuralHierarchy(page: Page): Promise<void> {
  const result = await page.evaluate((structuralSelectors) => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const color = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const tokens = {
      canvas: color('--canvas'),
      surface1: color('--surface-1'),
      rule: color('--rule'),
    };
    probe.remove();
    const failures: string[] = [];
    const checkBoundary = (selector: string, side: 'Right' | 'Bottom') => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || getComputedStyle(element).display === 'none') return;
      const style = getComputedStyle(element);
      if (style[`border${side}Width`] !== '1px' || style[`border${side}Color`] !== tokens.rule) {
        failures.push(
          `${selector} border-${side.toLowerCase()}: ${style[`border${side}Width`]} ${style[`border${side}Color`]}`
        );
      }
    };
    const shell = document.querySelector<HTMLElement>('.route-shell');
    const workspace = document.querySelector<HTMLElement>('.route-workspace');
    if (shell && getComputedStyle(shell).backgroundColor !== tokens.canvas)
      failures.push('.route-shell canvas');
    if (workspace && getComputedStyle(workspace).backgroundColor !== tokens.canvas)
      failures.push('.route-workspace canvas');
    for (const selector of structuralSelectors.filter(
      (item) => item.includes('rail') || item.includes('navigation')
    )) {
      const element = document.querySelector<HTMLElement>(selector);
      if (
        element &&
        getComputedStyle(element).display !== 'none' &&
        getComputedStyle(element).backgroundColor !== tokens.surface1
      ) {
        failures.push(`${selector} surface-1`);
      }
    }
    checkBoundary('.module-rail', 'Right');
    checkBoundary('.context-navigation', 'Right');
    checkBoundary('.route-topbar', 'Bottom');
    return failures;
  }, STRUCTURAL_SURFACES);
  expect(result).toEqual([]);
}

async function assertNoViewportOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflowing = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > width + 1 || rect.left < -1)
      .slice(0, 20)
      .map(({ element, rect }) => ({
        tag: element.tagName,
        className: element.className,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      }));
    return {
      clientWidth: width,
      scrollWidth: document.documentElement.scrollWidth,
      hash: window.location.hash,
      overflowing,
    };
  });
  expect(result.scrollWidth, JSON.stringify(result)).toBe(result.clientWidth);
}

async function assertFlatRoute(page: Page, label: string): Promise<void> {
  const violations = await scanFlatStyleInvariants(page);
  expect(violations, label).toEqual([]);
  await assertNoViewportOverflow(page);
  if (await page.locator('.route-shell').count()) await assertStructuralHierarchy(page);
}

async function authenticate(page: Page): Promise<void> {
  await loginViaUi(page, VALID_KEY, true);
  await waitForSettledUi(page);
}

for (const theme of ['light', 'white', 'dark'] as const) {
  test(`flat-style invariant covers the complete ${theme} manifest`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(360_000);
    test.skip(!isFullManifestProject(testInfo.project.name, theme));
    await seedEnglish(context);
    await seedTheme(context, theme);
    await mockManagementApi(page);

    const loginEntry = VISUAL_FAMILY_MANIFEST[0];
    await openRoute(page, loginEntry.path);
    await expect(page.getByText(loginEntry.heading, { exact: true })).not.toHaveCount(0);
    await expect(
      page.getByRole(loginEntry.interaction.role, {
        name: loginEntry.interaction.name,
        exact: true,
      })
    ).toBeVisible();
    await assertFlatRoute(page, `${theme}:${loginEntry.id}`);
    await authenticate(page);

    for (const entry of PANEL_MANIFEST) {
      await openRoute(page, entry.path);
      await expect(
        page.getByRole('heading', { name: entry.heading, exact: true }).first()
      ).toBeVisible();
      await assertFlatRoute(page, `${theme}:${entry.id}`);
    }
    for (const entry of VISUAL_FAMILY_MANIFEST.slice(1)) {
      await openRoute(page, entry.path);
      await expect(
        page.getByRole('heading', { name: entry.heading, exact: true }).first()
      ).toBeVisible();
      await expect(
        page
          .getByRole(entry.interaction.role, { name: entry.interaction.name, exact: true })
          .first()
      ).toBeVisible();
      await assertFlatRoute(page, `${theme}:${entry.id}`);
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`cross-browser ${theme} flat-style smoke`, async ({ page, context }, testInfo) => {
    test.skip(!isCrossBrowserProject(testInfo.project.name));
    await seedEnglish(context);
    await seedTheme(context, theme);
    await mockManagementApi(page);
    await openRoute(page, '/login');
    await assertFlatRoute(page, `${testInfo.project.name}:${theme}:login`);
    await authenticate(page);
    for (const path of REPRESENTATIVE_PATHS) {
      await openRoute(page, path);
      await assertFlatRoute(page, `${testInfo.project.name}:${theme}:${path}`);
    }
  });
}

test('auto theme resolves to canonical white and dark tokens', async ({
  page,
  context,
}, testInfo) => {
  test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));
  await seedEnglish(context);
  await seedTheme(context, 'auto');
  await mockManagementApi(page);

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await openRoute(page, '/login');
    const autoTokens = await resolveCanonicalTokens(page);
    await page.evaluate(
      (directTheme) => {
        window.localStorage.setItem(
          'cli-proxy-theme',
          JSON.stringify({
            state: { theme: directTheme, resolvedTheme: directTheme === 'dark' ? 'dark' : 'light' },
            version: 0,
          })
        );
      },
      colorScheme === 'light' ? 'white' : 'dark'
    );
    await page.reload();
    await waitForSettledUi(page);
    const directTokens = await resolveCanonicalTokens(page);
    expect(autoTokens).toEqual(directTokens);
  }
});

test('keyboard focus uses the live route token and two-pixel outline', async ({
  page,
  context,
}, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await seedEnglish(context);
  await seedTheme(context, 'light');
  await mockManagementApi(page);
  await openRoute(page, '/login');

  const keyInput = page.getByRole('textbox', { name: 'Management Key:', exact: true });
  for (
    let index = 0;
    index < 12 && !(await keyInput.evaluate((element) => element === document.activeElement));
    index += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(keyInput).toBeFocused();
  const tokens = await resolveCanonicalTokens(page);
  await expect(keyInput).toHaveCSS('outline-width', '2px');
  await expect(keyInput).toHaveCSS('outline-color', tokens.route);
  await expect(keyInput).toHaveCSS('outline-offset', '2px');

  await keyInput.fill('test-management-key');
  await keyInput.press('Enter');
  await page.waitForURL(/#\/$/);
  const monitor = page.getByRole('button', { name: 'Monitor', exact: true });
  await monitor.focus();
  await page.keyboard.press('Tab');
  const providers = page.getByRole('button', { name: 'Providers', exact: true });
  await expect(providers).toBeFocused();
  await expect(providers).toHaveCSS('outline-color', tokens.route);
});

for (const snapshotCase of [
  { project: 'desktop-chromium', theme: 'light' },
  { project: 'tablet-chromium', theme: 'light' },
  { project: 'mobile-chromium', theme: 'light' },
  { project: 'desktop-chromium', theme: 'dark' },
  { project: 'mobile-chromium', theme: 'dark' },
  { project: 'desktop-chromium', theme: 'white' },
] as const) {
  test(`reviewed ${snapshotCase.theme} composition at ${snapshotCase.project}`, async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== snapshotCase.project);
    test.setTimeout(180_000);
    await seedEnglish(context);
    await seedTheme(context, snapshotCase.theme);
    await mockManagementApi(page);

    const capture = async (name: string) => {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await expect(page).toHaveScreenshot(`${snapshotCase.theme}-${name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      });
    };

    await openRoute(page, '/login');
    await capture('login');
    await authenticate(page);
    for (const [name, path] of [
      ['overview', '/'],
      ['config', '/config'],
      ['providers', '/ai-providers'],
      ['openai-editor', '/ai-providers/openai/new'],
    ] as const) {
      await openRoute(page, path);
      await capture(name);
    }

    await openRoute(page, '/');
    if ((page.viewportSize()?.width ?? 0) <= 768) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.locator('#mobile-primary-navigation')).toBeVisible();
      await capture('open-navigation');
    } else if ((page.viewportSize()?.width ?? 0) < 1280) {
      await page.getByRole('button', { name: 'Providers', exact: true }).click();
      await expect(page.locator('#tablet-context-navigation')).toBeVisible();
      await capture('open-navigation');
    } else {
      await page.getByRole('button', { name: 'Language', exact: true }).click();
      await expect(page.getByRole('menu', { name: 'Language' })).toBeVisible();
      await capture('open-utility');
    }
  });
}
