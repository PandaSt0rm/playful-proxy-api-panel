import { test, expect } from '@playwright/test';
import { mockManagementApi, seedEnglish, loginViaUi, VALID_KEY } from './fixtures';

test.beforeEach(async ({ page, context }) => {
  await seedEnglish(context);
  await mockManagementApi(page);
});

test('logs in with a valid key and reaches the authenticated app shell', async ({ page }) => {
  await loginViaUi(page, VALID_KEY);

  // After a successful login the app leaves the /login route and lands on the
  // dashboard, whose hero heading reads "Welcome Back".
  await expect(page).not.toHaveURL(/#\/login/);
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
});

test('shows an error and stays on the login screen with an invalid key', async ({ page }) => {
  await loginViaUi(page, 'wrong-key');

  await expect(page).toHaveURL(/#\/login/);
  // The inline error box shows the bare message (the toast adds a "Login
  // failed:" prefix, so an exact match targets the error box specifically).
  await expect(
    page.getByText('Authentication failed, invalid management key', { exact: true })
  ).toBeVisible();
});

test('redirects an unauthenticated visit to a protected route back to login', async ({ page }) => {
  await page.goto('/#/');

  await expect(page).toHaveURL(/#\/login/);
});
