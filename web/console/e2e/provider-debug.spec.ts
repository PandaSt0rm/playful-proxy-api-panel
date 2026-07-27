import { expect, test, type Page } from '@playwright/test';
import { loginViaUi, mockManagementApi, seedEnglish, seedTheme } from './fixtures';

/**
 * The provider debug bench opens in a drawer, so the manifest-driven visual sweep in
 * `visual-consistency.spec.ts` never sees it — that sweep only scans routed pages in their
 * default state. These cases cover what it cannot: the bench's own layout, with a populated
 * monospace transcript, at both a wide and a narrow viewport.
 */

const LIVE_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

async function assertNoViewportOverflow(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > document.documentElement.clientWidth + 1)
      .slice(0, 10)
      .map(({ element, rect }) => ({
        tag: element.tagName,
        className: String(element.className),
        right: rect.right,
      })),
  }));
  expect(result.scrollWidth, `${label} ${JSON.stringify(result)}`).toBe(result.clientWidth);
}

/** Fills the minimum draft configuration the bench needs to produce a real exchange. */
async function openBenchWithDraftConfig(page: Page): Promise<void> {
  await page.goto('/#/ai-providers/openai/new');
  await page.getByLabel('Base URL:').fill('https://api.example.com/v1');
  await page.getByPlaceholder('sk-... key').first().fill(LIVE_KEY);
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Provider debug/ })).toBeVisible();
}

test.describe('provider debug bench', () => {
  test.beforeEach(async ({ page, context }) => {
    await seedEnglish(context);
    await seedTheme(context, 'light');
    await mockManagementApi(page);
    await loginViaUi(page);
  });

  test('runs against unsaved draft configuration and shows the wire transcript', async ({
    page,
  }) => {
    await openBenchWithDraftConfig(page);

    await expect(page.getByRole('checkbox', { name: /Reachability/ })).toBeChecked();
    await expect(page.getByText(/No checks run yet/)).toBeVisible();

    await page.getByRole('button', { name: 'Run checks' }).click();
    await expect(page.getByRole('button', { name: 'Run checks' })).toBeEnabled();

    const rail = page.getByRole('list');
    await expect(rail.getByRole('button', { name: /Reachability/ })).toBeVisible();
    await expect(rail.getByRole('button', { name: /Key · key #1/ })).toBeVisible();
    await expect(rail.getByRole('button', { name: /Model catalog/ })).toBeVisible();

    // The transcript, its curl-style gutters, and the hop chain. Queries are scoped to the
    // drawer: the edit page behind it has its own "request" copy.
    const bench = page.getByRole('dialog', { name: /Provider debug/ });
    await expect(bench.getByRole('heading', { name: 'Request' })).toBeVisible();
    await expect(bench.getByRole('heading', { name: 'Response' })).toBeVisible();
    await expect(
      bench.getByText(/> GET https:\/\/api\.example\.com\/v1\/models/)
    ).toBeVisible();
    await expect(bench.getByText(/< HTTP 200/)).toBeVisible();
    await expect(bench.getByText('api.example.com', { exact: true })).toBeVisible();
  });

  test('never renders a live credential', async ({ page }) => {
    await openBenchWithDraftConfig(page);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await expect(page.getByRole('button', { name: 'Run checks' })).toBeEnabled();

    // Open the credential-bearing check explicitly. Reachability sends no key at all, so
    // asserting on the default selection would prove nothing about masking.
    await page.getByRole('list').getByRole('button', { name: /Key · key #1/ }).click();
    const bench = page.getByRole('dialog', { name: /Provider debug/ });
    await expect(bench.getByText(/> authorization: Bearer/i)).toBeVisible();

    const drawerText = (await bench.textContent()) ?? '';
    expect(drawerText).not.toContain(LIVE_KEY);
    // The prefix survives so an operator can still tell which key was used.
    expect(drawerText).toContain('sk-proj-••••6789');
  });

  test('keeps the bench inside the viewport with a populated transcript', async ({ page }) => {
    await openBenchWithDraftConfig(page);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await expect(page.getByRole('button', { name: 'Run checks' })).toBeEnabled();
    await expect(page.getByText(/< HTTP 200/)).toBeVisible();

    await assertNoViewportOverflow(page, 'bench at the project viewport');

    // The two-pane grid collapses to one column below the tablet breakpoint; a monospace
    // transcript is the classic min-width:auto blowout, so check the narrowest case too.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('dialog', { name: /Provider debug/ })).toBeVisible();
    await assertNoViewportOverflow(page, 'bench at 390px');
  });

  test('reports a missing base url instead of calling the provider', async ({ page }) => {
    await page.goto('/#/ai-providers/openai/new');
    await page.getByPlaceholder('sk-... key').first().fill(LIVE_KEY);
    await page.getByRole('button', { name: 'Debug', exact: true }).click();

    await page.getByRole('button', { name: 'Run checks' }).click();
    await expect(page.getByRole('button', { name: 'Run checks' })).toBeEnabled();
    await expect(page.getByText('Set a base URL before running checks.')).toBeVisible();
  });
});
