import { test, expect, type Page } from '@playwright/test';
import { mockManagementApi, seedEnglish, loginViaUi, VALID_KEY } from './fixtures';
import { NESTED_PANEL_MANIFEST, PANEL_MANIFEST } from './panelManifest';

async function assertNoViewportOverflow(page: Page, label = 'viewport') {
  const dimensions = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflowing = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => !element.closest('.notification-container') && (rect.right > width + 1 || rect.left < -1))
      .slice(0, 20)
      .map(({ element, rect }) => ({ tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width }));
    return { width, scrollWidth: document.documentElement.scrollWidth, overflowing, hash: window.location.hash };
  });
  expect(dimensions.scrollWidth, JSON.stringify({ label, hash: dimensions.hash, overflowing: dimensions.overflowing })).toBe(dimensions.width);
}

async function openColdRoute(page: Page, path: string) {
  await page.goto('about:blank');
  await page.goto(`/#${path}`);
}

async function assertActiveDestination(page: Page, module: string, destination: string) {
  const width = page.viewportSize()?.width ?? 0;
  if (width <= 768) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.locator('#mobile-primary-navigation');
    await expect(drawer.getByRole('region', { name: module, exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: destination, exact: true })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    return;
  }

  const moduleButton = page.getByRole('button', { name: module, exact: true });
  await expect(moduleButton).toHaveAttribute('aria-pressed', 'true');
  if (width < 1200) {
    await expect(page.getByRole('link', { name: destination, exact: true, includeHidden: true })).toHaveAttribute('aria-current', 'page');
    return;
  }
  await expect(page.getByRole('link', { name: destination, exact: true })).toHaveAttribute('aria-current', 'page');
}

test.beforeEach(async ({ page, context }) => {
  await seedEnglish(context);
  await mockManagementApi(page);
});

test('preserves authentication, guard, and manual-login deep-link behavior', async ({ page }) => {
  await page.goto('/#/config');
  await expect(page).toHaveURL(/#\/login/);

  await loginViaUi(page);

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'AIPROXY overview' })).toBeVisible();
});

test('manifest covers every normal destination and readiness with a real interaction', async ({ page }) => {
  await loginViaUi(page, VALID_KEY, true);

  for (const entry of PANEL_MANIFEST) {
    await openColdRoute(page, entry.path);
    await expect(page.getByRole('heading', { name: entry.heading, exact: true }).first()).toBeVisible();
    await expect(page.getByText('Unexpected Application Error!')).toHaveCount(0);
    if (entry.module !== 'Readiness') {
      await assertActiveDestination(page, entry.module, entry.destination);
    }
    const region = page.getByRole('region', { name: entry.region, exact: true }).or(page.getByText(entry.region, { exact: true })).first();
    await expect(region).toBeVisible();
    const interaction = page.getByRole(entry.interaction.role, { name: entry.interaction.name, exact: true }).first();
    await expect(interaction).toBeVisible();
    await interaction.click();
    await expect(page.getByText('Unexpected Application Error!'), entry.id).toHaveCount(0);
    await assertNoViewportOverflow(page, entry.id);
  }
});

test('preserves aliases, wildcard redirect, and nested destination ownership', async ({ page }) => {
  await loginViaUi(page, VALID_KEY, true);
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
    const breadcrumb = page.getByText(entry.breadcrumb, { exact: true });
    if ((page.viewportSize()?.width ?? 0) <= 768) await expect(breadcrumb).not.toHaveCount(0);
    else await expect(breadcrumb.first()).toBeVisible();
  }
});

test('desktop geometry keeps rail, context navigation, top bar, and workspace inside the viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop-') && testInfo.project.name !== 'reduced-motion-desktop');
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

test('768px uses the focus-trapped mobile drawer and restores trigger focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-boundary-chromium');
  await loginViaUi(page);
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(page.locator('#mobile-primary-navigation')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
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

test('reduced motion removes the actual page-transition animation', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('reduced-motion-'));
  await loginViaUi(page);
  await page.goto('/#/operations');
  const durations = await page.locator('.page-transition').evaluate((element) =>
    element.getAnimations().map((animation) => Number(animation.effect?.getTiming().duration ?? 0)),
  );
  expect(durations.every((duration) => duration === 0)).toBe(true);
});
