import { test, expect, type Page } from '@playwright/test';
import { mockManagementApi, seedEnglish, loginViaUi, VALID_KEY } from './fixtures';
import { NESTED_PANEL_MANIFEST, PANEL_MANIFEST } from './panelManifest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function assertNoViewportOverflow(page: Page, label = 'viewport') {
  const dimensions = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflowing = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(
        ({ element, rect }) =>
          !element.closest('.notification-container') && (rect.right > width + 1 || rect.left < -1)
      )
      .slice(0, 20)
      .map(({ element, rect }) => ({
        tag: element.tagName,
        className: element.className,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      }));
    return {
      width,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing,
      hash: window.location.hash,
    };
  });
  expect(
    dimensions.scrollWidth,
    JSON.stringify({ label, hash: dimensions.hash, overflowing: dimensions.overflowing })
  ).toBe(dimensions.width);
}

async function openColdRoute(page: Page, path: string) {
  await page.goto('about:blank');
  await page.goto(`/#${path}`);
}

async function assertMotionEffectivelyZero(page: Page, label: string) {
  const offenders = await page.evaluate(() => {
    const toMilliseconds = (value: string) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) =>
          part.endsWith('ms') ? Number.parseFloat(part) : Number.parseFloat(part) * 1000
        )
        .filter((duration) => Number.isFinite(duration) && duration > 1);
    const css = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .flatMap((element) => {
        const style = getComputedStyle(element);
        const durations = [
          ...toMilliseconds(style.transitionDuration),
          ...toMilliseconds(style.animationDuration),
        ];
        return durations.length
          ? [{ element: `${element.tagName}.${String(element.className)}`, durations }]
          : [];
      });
    const animations = document
      .getAnimations()
      .map((animation) => Number(animation.effect?.getTiming().duration ?? 0))
      .filter((duration) => duration > 1);
    return {
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      css: css.slice(0, 20),
      animations,
    };
  });
  expect(offenders.reduced, label).toBe(true);
  expect({ css: offenders.css, animations: offenders.animations }, label).toEqual({
    css: [],
    animations: [],
  });
}

function isRouteMatrixProject(projectName: string) {
  return projectName === 'desktop-chromium' || /^(tablet|mobile).*chromium$/.test(projectName);
}

async function assertActiveDestination(page: Page, module: string, destination: string) {
  const width = page.viewportSize()?.width ?? 0;
  if (width <= 768) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.locator('#mobile-primary-navigation');
    await expect(drawer.getByRole('region', { name: module, exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: destination, exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await page.keyboard.press('Escape');
    return;
  }

  const moduleButton = page.getByRole('button', { name: module, exact: true });
  await expect(moduleButton).toHaveAttribute('aria-pressed', 'true');
  if (width < 1200) {
    await expect(
      page.getByRole('link', { name: destination, exact: true, includeHidden: true })
    ).toHaveAttribute('aria-current', 'page');
    return;
  }
  await expect(page.getByRole('link', { name: destination, exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
}

test.beforeEach(async ({ page, context }) => {
  await seedEnglish(context);
  await mockManagementApi(page);
});

test('visual manifests cover every routed page family', async ({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const routeSource = await readFile(
    fileURLToPath(new URL('../src/router/mainRouteDefinitions.tsx', import.meta.url)),
    'utf8'
  );
  const declaredPaths = [...routeSource.matchAll(/\bpath:\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  );
  const routedPageFamilies = new Set(
    declaredPaths.filter((path) => path !== 'models').map((path) => path.replace('/:index', '/new'))
  );
  const manifestPageFamilies = new Set([
    ...PANEL_MANIFEST.map((entry) => entry.path),
    ...NESTED_PANEL_MANIFEST.map((entry) => entry.path.replace(/\/models$/, '')),
    '/dashboard',
    '/settings',
    '/api-keys',
    '/ai-providers/*',
    '*',
  ]);
  expect([...routedPageFamilies].sort()).toEqual([...manifestPageFamilies].sort());
  expect(declaredPaths.filter((path) => path === 'models')).toHaveLength(
    NESTED_PANEL_MANIFEST.filter((entry) => entry.path.endsWith('/models')).length * 2
  );
});

test('preserves authentication, guard, and manual-login deep-link behavior', async ({ page }) => {
  await page.goto('/#/config');
  await expect(page).toHaveURL(/#\/login/);

  await loginViaUi(page);

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'AIPROXY overview' })).toBeVisible();
});

test('manifest covers every normal destination and readiness with a real interaction', async ({
  page,
}, testInfo) => {
  test.skip(!isRouteMatrixProject(testInfo.project.name));
  await loginViaUi(page, VALID_KEY, true);

  for (const entry of PANEL_MANIFEST) {
    await openColdRoute(page, entry.path);
    await expect(
      page.getByRole('heading', { name: entry.heading, exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText('Unexpected Application Error!')).toHaveCount(0);
    if (entry.module !== 'Readiness') {
      await assertActiveDestination(page, entry.module, entry.destination);
    }
    const region = page
      .getByRole('region', { name: entry.region, exact: true })
      .or(page.getByText(entry.region, { exact: true }))
      .first();
    await expect(region).toBeVisible();
    const interaction = page
      .getByRole(entry.interaction.role, { name: entry.interaction.name, exact: true })
      .first();
    await expect(interaction).toBeVisible();
    await interaction.click();
    await expect(page.getByText('Unexpected Application Error!'), entry.id).toHaveCount(0);
    await assertNoViewportOverflow(page, entry.id);
  }
});

test('preserves aliases, wildcard redirect, and nested destination ownership', async ({
  page,
}, testInfo) => {
  test.skip(!isRouteMatrixProject(testInfo.project.name));
  await loginViaUi(page, VALID_KEY, true);
  await openColdRoute(page, '/dashboard');
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'AIPROXY overview' })).toBeVisible();
  for (const alias of ['/settings', '/api-keys']) {
    await openColdRoute(page, alias);
    await expect(page).toHaveURL(/#\/config$/);
  }
  await openColdRoute(page, '/not-a-route');
  await expect(page).toHaveURL(/#\/$/);

  for (const entry of NESTED_PANEL_MANIFEST) {
    await openColdRoute(page, entry.path);
    await assertActiveDestination(page, 'Providers', entry.owner);
    expect(new URL(page.url()).hash).toBe(`#${entry.path}`);
    const heading = page.getByRole('heading', { name: entry.heading, exact: true });
    await expect(heading.first()).toBeVisible();
  }
});

test('desktop geometry keeps rail, context navigation, top bar, and workspace inside the viewport', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('desktop-') &&
      testInfo.project.name !== 'reduced-motion-desktop'
  );
  await loginViaUi(page);
  const rail = page.locator('.module-rail');
  const context = page.locator('.context-navigation');
  const topbar = page.locator('.route-topbar');
  await expect(rail).toHaveCSS('width', '72px');
  await expect(context).toHaveCSS('width', '240px');
  await expect(topbar).toHaveCSS('height', '60px');
  await assertNoViewportOverflow(page);
  await expect(page.locator('.route-workspace')).toBeInViewport();
});

test('768px uses the focus-trapped mobile drawer and restores trigger focus', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-boundary-chromium');
  await loginViaUi(page);
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(page.locator('#mobile-primary-navigation')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  const undersizedTargets = await page
    .locator('#mobile-primary-navigation button, #mobile-primary-navigation a')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute('aria-label') ?? element.textContent,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter(({ width, height }) => width < 44 || height < 44)
    );
  expect(undersizedTargets).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-primary-navigation')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await assertNoViewportOverflow(page);
});

test('769px uses the nonmodal context overlay', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'tablet-boundary-chromium');
  await loginViaUi(page);
  await page.getByRole('button', { name: 'Providers' }).click();
  await expect(page.locator('#tablet-context-navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tablet-context-navigation')).toHaveCount(0);
  await assertNoViewportOverflow(page);
});

test('reduced motion neutralizes route, overlay, drawer, popover, and modal motion', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('reduced-motion-'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginViaUi(page, VALID_KEY, true);
  await page.goto('/#/operations');
  await expect(page.getByRole('heading', { name: 'Live Operations' })).toBeVisible();
  await assertMotionEffectivelyZero(page, 'route transition');

  if (testInfo.project.name === 'reduced-motion-mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.locator('#mobile-primary-navigation')).toBeVisible();
    await assertMotionEffectivelyZero(page, 'mobile drawer');
    await page.keyboard.press('Escape');
  } else if (testInfo.project.name === 'reduced-motion-tablet') {
    await page.getByRole('button', { name: 'Providers', exact: true }).click();
    await expect(page.locator('#tablet-context-navigation')).toBeVisible();
    await assertMotionEffectivelyZero(page, 'tablet overlay');
    await page.keyboard.press('Escape');
  } else {
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'Language' })).toBeVisible();
    await assertMotionEffectivelyZero(page, 'utility popover');
    await page.keyboard.press('Escape');
  }

  await openColdRoute(page, '/auth-files');
  await page.getByRole('button', { name: 'Delete All', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await assertMotionEffectivelyZero(page, 'confirmation modal');
});
