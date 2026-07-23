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
  if (path.endsWith('/aiproxy/readiness')) {
    return { status: 'attention', checks: [{ id: 'fixture-warning', required: false, status: 'warn', summary: 'Review the fixture route.', action_path: '/config' }] };
  }
  if (path.endsWith('/aiproxy/config-revisions')) {
    return { revisions: [], next_cursor: '', current_sha256: 'fixture' };
  }
  if (path.endsWith('/aiproxy/diagnostics')) {
    return { results: [] };
  }
  if (path.endsWith('/aiproxy/budgets')) {
    return { budgets: [] };
  }
  if (path.endsWith('/aiproxy/budget-status')) {
    return { statuses: [] };
  }
  if (path.endsWith('/aiproxy/sync-drift')) {
    return { reported_sync_state: [], stale_after_seconds: 86400 };
  }
  if (path.endsWith('/usage/summary')) {
    return { group_by: 'provider', rows: [], limit: 20 };
  }
  if (path.endsWith('/usage/status')) {
    return { enabled: true, path: '/data/usage.db', retention_days: 30, event_count: 0, oldest_ms: 0, newest_ms: 0 };
  }
  if (path.endsWith('/usage/events')) {
    return { events: [], limit: 200 };
  }
  if (path.endsWith('/usage')) {
    return { usage: { total_requests: 0, success_count: 0, failure_count: 0, total_tokens: 0, total_input_tokens: 0, total_cached_tokens: 0, cache_hit_rate: 0, average_latency_ms: 0, average_first_byte_latency_ms: 0, tps: 0, requests_by_hour: {} }, failed_requests: 0, storage: 'sqlite' };
  }
  if (path.endsWith('/logs')) {
    return { lines: [], 'line-count': 0, 'latest-timestamp': 0 };
  }
  if (path.endsWith('/config')) return CONFIG_FIXTURE;
  if (path.endsWith('/auth-files')) return { files: [{ name: 'fixture.json', type: 'gemini', authIndex: 'fixture-auth' }] };
  if (path.endsWith('/gemini-api-key')) return [{ apiKey: 'fixture-secret', prefix: 'Fixture Gemini', authIndex: 'fixture-gemini' }];
  if (path.endsWith('/models') || path.endsWith('/api-keys')) return [];
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

    const body =
      request.method() === 'POST' && path.endsWith('/aiproxy/diagnostics')
        ? {
            id: 'fixture-diagnostic',
            checked_at: '2026-07-23T12:00:00Z',
            target: { kind: 'gemini-api-key', auth_index: 'fixture-gemini', label: 'Fixture Gemini' },
            check: 'models',
            status: 'pass',
            latency_ms: 12,
            category: 'catalog',
            message: 'Catalog reachable.',
            model_count: 1,
          }
        : bodyForPath(path);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
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
export async function loginViaUi(page: Page, key: string = VALID_KEY, rememberPassword = false): Promise<void> {
  await page.goto('/#/login');
  const keyInput = page.locator('input[type="password"]');
  await keyInput.waitFor({ state: 'visible' });
  await keyInput.fill(key);
  if (rememberPassword) await page.getByText('Remember password', { exact: true }).click();
  await keyInput.press('Enter');
  if (key === VALID_KEY) {
    await page.waitForURL(/#\/$/);
    await page.getByRole('heading', { name: 'AIPROXY overview' }).waitFor({ state: 'visible' });
  }
}
