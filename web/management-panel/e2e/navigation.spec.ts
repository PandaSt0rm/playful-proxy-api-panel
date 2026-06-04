import { test, expect } from '@playwright/test';
import { mockManagementApi, seedEnglish, loginViaUi } from './fixtures';

test.beforeEach(async ({ page, context }) => {
  await seedEnglish(context);
  await mockManagementApi(page);
});

test('navigates between sections via the sidebar after logging in', async ({ page }) => {
  await loginViaUi(page);
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();

  // Scope to the sidebar landmark — several section names (e.g. "AI Providers")
  // also appear as dashboard bento-card links, so an unscoped role query is
  // ambiguous.
  const sidebar = page.getByRole('complementary');

  await sidebar.getByRole('link', { name: 'Config Panel', exact: true }).click();

  await expect(page).toHaveURL(/#\/config/);

  await sidebar.getByRole('link', { name: 'AI Providers', exact: true }).click();

  await expect(page).toHaveURL(/#\/ai-providers/);

  await sidebar.getByRole('link', { name: 'Logs Viewer', exact: true }).click();

  await expect(page).toHaveURL(/#\/logs/);
});

test('sends an unauthenticated deep-link to login, then to the dashboard after manual login', async ({ page }) => {
  await page.goto('/#/config');

  // The guard bounces an unauthenticated deep-link to the login screen.
  await expect(page).toHaveURL(/#\/login/);

  await loginViaUi(page);

  // Manual login lands on the dashboard root (only the auto-login path restores
  // the originally requested route), so the app shows the dashboard, not /config.
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
});
