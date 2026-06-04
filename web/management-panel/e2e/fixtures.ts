import type { BrowserContext, Page } from '@playwright/test';

/**
 * E2E test fixtures and helpers.
 *
 * The CLIProxyAPI backend is not running during e2e. Instead we intercept every
 * management API request (any URL containing the `/v0/management/` path) and
 * serve deterministic responses, so the full
 * UI stack (hash routing, stores, rendering, interactions) is exercised against
 * a known-good API contract. The auth gate is honored: requests without the
 * correct `Authorization: Bearer` header get 401, which is what the login flow
 * checks.
 */

export const VALID_KEY = 'test-management-key';

// Minimal but shape-valid /config payload (snake_case as the server emits).
const CONFIG_FIXTURE = {
  debug: false,
  'request-log': true,
  'logging-to-file': false,
  'proxy-url': '',
  'request-retry': 3,
  'routing-strategy': 'round-robin',
  'api-keys': ['sk-example-key-1'],
  'openai-compatibility': [],
  'claude-api-key': [],
  'codex-api-key': [],
  'gemini-api-key': [],
  'vertex-api-key': [],
};

// Per-endpoint bodies; anything unmatched returns {} which the hardened
// normalizers treat as empty without crashing.
function bodyForPath(path: string): unknown {
  if (path.endsWith('/config')) return CONFIG_FIXTURE;
  if (path.endsWith('/models') || path.endsWith('/auth-files') || path.endsWith('/api-keys')) {
    return [];
  }
  return {};
}

/**
 * Install the management-API mock on a page. Requests authenticated with
 * VALID_KEY get fixture data; others get 401.
 */
export async function mockManagementApi(page: Page): Promise<void> {
  await page.route('**/v0/management/**', async (route) => {
    const request = route.request();
    const auth = request.headers()['authorization'] ?? '';
    const path = new URL(request.url()).pathname;

    if (auth !== `Bearer ${VALID_KEY}`) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unauthorized' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bodyForPath(path)),
    });
  });
}

/** Seed English so text-based selectors are deterministic regardless of host locale. */
export async function seedEnglish(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'cli-proxy-language',
      JSON.stringify({ state: { language: 'en' }, version: 0 })
    );
  });
}

/** Log in through the UI and wait for the authenticated app shell. */
export async function loginViaUi(page: Page, key: string = VALID_KEY): Promise<void> {
  await page.goto('/#/login');
  const keyInput = page.locator('input[type="password"]');
  await keyInput.waitFor({ state: 'visible' });
  await keyInput.fill(key);
  await keyInput.press('Enter');
}
