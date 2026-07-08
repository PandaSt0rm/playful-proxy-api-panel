import { describe, it, expect, vi, beforeEach } from 'vitest';
import i18n from '@/i18n';
import type { TFunction } from 'i18next';
import type { AuthFileItem } from '@/types';

// Mock ONLY the boundaries this module owns: the network helper (apiCallApi)
// and the auth-file downloader (authFilesApi). getApiCallErrorMessage and the
// rest of @/services/api stay real so error-message shaping is exercised, not
// stubbed. vi.hoisted keeps the spies reachable inside the hoisted mock factory.
const { requestMock, downloadTextMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  downloadTextMock: vi.fn(),
}));

vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  return {
    ...actual,
    apiCallApi: { request: requestMock },
    authFilesApi: { ...actual.authFilesApi, downloadText: downloadTextMock },
  };
});

// Imported after the mock factory is registered so the config closures capture
// the mocked apiCallApi.
import { CLAUDE_CONFIG, CODEX_CONFIG, XAI_CONFIG } from './quotaConfigs';
import { useQuotaStore } from '@/stores';
import { XAI_BILLING_URL, XAI_REQUEST_HEADERS } from '@/utils/quota';

// Deterministic English translator (test setup pins i18n to 'en').
const t = i18n.getFixedT('en') as unknown as TFunction;

// Minimal AuthFileItem helper. Codex/Claude only need name + auth_index, plus
// the codex account id surfaced via id_token.
const makeFile = (overrides: Partial<AuthFileItem> = {}): AuthFileItem =>
  ({ name: 'cred.json', auth_index: '3', ...overrides }) as AuthFileItem;

const okResult = (body: unknown, statusCode = 200) => ({
  statusCode,
  header: {},
  bodyText: typeof body === 'string' ? body : JSON.stringify(body),
  body,
});

beforeEach(() => {
  requestMock.mockReset();
  downloadTextMock.mockReset();
  useQuotaStore.setState({
    antigravityQuota: {},
    claudeQuota: {},
    codexQuota: {},
    geminiCliQuota: {},
    kimiQuota: {},
    zaiQuota: {},
    xaiQuota: {},
  });
});

// ---------------------------------------------------------------------------
// CODEX: state builders (pure)
// ---------------------------------------------------------------------------

describe('CODEX_CONFIG state builders', () => {
  it('buildLoadingState produces a loading state with no windows', () => {
    const state = CODEX_CONFIG.buildLoadingState();

    expect(state).toEqual({ status: 'loading', windows: [] });
  });

  it('buildSuccessState carries through windows and plan type', () => {
    const windows = [
      { id: 'five-hour', label: '5h', usedPercent: 10, resetLabel: '-' },
    ];

    const state = CODEX_CONFIG.buildSuccessState({ planType: 'pro', windows });

    expect(state).toEqual({ status: 'success', windows, planType: 'pro' });
  });

  it('buildErrorState records the message and status code', () => {
    const state = CODEX_CONFIG.buildErrorState('boom', 429);

    expect(state).toEqual({ status: 'error', windows: [], error: 'boom', errorStatus: 429 });
  });

  it('buildErrorState leaves errorStatus undefined when no status is given', () => {
    const state = CODEX_CONFIG.buildErrorState('boom');

    expect(state).toEqual({ status: 'error', windows: [], error: 'boom', errorStatus: undefined });
  });
});

// ---------------------------------------------------------------------------
// CODEX: fetchQuota guard paths (no network)
// ---------------------------------------------------------------------------

describe('CODEX_CONFIG.fetchQuota guards', () => {
  it('throws the missing auth_index message when no auth index resolves', async () => {
    const file = makeFile({ auth_index: undefined, authIndex: undefined });

    await expect(CODEX_CONFIG.fetchQuota(file, t)).rejects.toThrow('Auth file missing auth_index');

    expect(requestMock).not.toHaveBeenCalled();
  });

  it('throws the missing account ID message when no chatgpt account id is present', async () => {
    const file = makeFile();

    await expect(CODEX_CONFIG.fetchQuota(file, t)).rejects.toThrow(
      'Codex credential missing ChatGPT account ID'
    );
  });
});

// ---------------------------------------------------------------------------
// CODEX: fetchQuota happy/error paths through buildCodexQuotaWindows
// ---------------------------------------------------------------------------

describe('CODEX_CONFIG.fetchQuota window building', () => {
  const codexFile = makeFile({ id_token: { chatgpt_account_id: 'acct-1' } });

  it('throws empty_windows when the usage body is not parseable', async () => {
    requestMock.mockResolvedValue(okResult(''));

    await expect(CODEX_CONFIG.fetchQuota(codexFile, t)).rejects.toThrow('No quota data available');
  });

  it('classifies primary/secondary windows by limit_window_seconds into 5-hour and weekly', async () => {
    requestMock.mockResolvedValue(
      okResult({
        rate_limit: {
          primary_window: { used_percent: 40, limit_window_seconds: 18000 },
          secondary_window: { used_percent: 25, limit_window_seconds: 604800 },
        },
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows).toEqual([
      { id: 'five-hour', label: '5-hour limit', labelKey: 'codex_quota.primary_window', labelParams: undefined, usedPercent: 40, resetLabel: '-' },
      { id: 'weekly', label: 'Weekly limit', labelKey: 'codex_quota.secondary_window', labelParams: undefined, usedPercent: 25, resetLabel: '-' },
    ]);
  });

  it('still maps primary to five-hour and secondary to weekly when window seconds are absent (order fallback)', async () => {
    requestMock.mockResolvedValue(
      okResult({
        rate_limit: {
          primary_window: { used_percent: 12 },
          secondary_window: { used_percent: 88 },
        },
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows.map((w) => ({ id: w.id, usedPercent: w.usedPercent }))).toEqual([
      { id: 'five-hour', usedPercent: 12 },
      { id: 'weekly', usedPercent: 88 },
    ]);
  });

  it('forces usedPercent to 100 when the limit is reached and no percent is reported', async () => {
    requestMock.mockResolvedValue(
      okResult({
        rate_limit: {
          limit_reached: true,
          primary_window: { reset_at: 4102444800 },
        },
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows[0]?.usedPercent).toBe(100);
  });

  it('leaves usedPercent null when the limit is reached but there is no reset time', async () => {
    requestMock.mockResolvedValue(
      okResult({
        rate_limit: {
          limit_reached: true,
          primary_window: { limit_window_seconds: 18000 },
        },
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows[0]?.usedPercent).toBeNull();
  });

  it('treats allowed=false the same as limit reached for forcing 100 percent', async () => {
    requestMock.mockResolvedValue(
      okResult({
        rate_limit: {
          allowed: false,
          primary_window: { reset_at: 4102444800 },
        },
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows[0]?.usedPercent).toBe(100);
  });

  it('prefers an explicit used_percent over the limit-reached fallback', async () => {
    requestMock.mockResolvedValue(
      okResult({
        rate_limit: {
          limit_reached: true,
          primary_window: { used_percent: 73, reset_at: 4102444800 },
        },
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows[0]?.usedPercent).toBe(73);
  });

  it('builds code-review windows with their dedicated ids and labels', async () => {
    requestMock.mockResolvedValue(
      okResult({
        code_review_rate_limit: {
          primary_window: { used_percent: 5, limit_window_seconds: 18000 },
          secondary_window: { used_percent: 6, limit_window_seconds: 604800 },
        },
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows.map((w) => ({ id: w.id, label: w.label, usedPercent: w.usedPercent }))).toEqual([
      { id: 'code-review-five-hour', label: 'Code review 5-hour limit', usedPercent: 5 },
      { id: 'code-review-weekly', label: 'Code review weekly limit', usedPercent: 6 },
    ]);
  });

  it('builds additional rate-limit windows with a slugified id prefix and interpolated name', async () => {
    requestMock.mockResolvedValue(
      okResult({
        additional_rate_limits: [
          {
            limit_name: 'Code Review!',
            rate_limit: {
              primary_window: { used_percent: 10, limit_window_seconds: 18000 },
              secondary_window: { used_percent: 20, limit_window_seconds: 604800 },
            },
          },
        ],
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows).toEqual([
      { id: 'code-review-five-hour-0', label: 'Code Review! 5-hour limit', labelKey: 'codex_quota.additional_primary_window', labelParams: { name: 'Code Review!' }, usedPercent: 10, resetLabel: '-' },
      { id: 'code-review-weekly-0', label: 'Code Review! weekly limit', labelKey: 'codex_quota.additional_secondary_window', labelParams: { name: 'Code Review!' }, usedPercent: 20, resetLabel: '-' },
    ]);
  });

  it('falls back to an indexed name when an additional rate limit has no limit_name', async () => {
    requestMock.mockResolvedValue(
      okResult({
        additional_rate_limits: [
          {
            rate_limit: {
              primary_window: { used_percent: 1, limit_window_seconds: 18000 },
            },
          },
        ],
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows[0]).toEqual({
      id: 'additional-1-five-hour-0',
      label: 'additional-1 5-hour limit',
      labelKey: 'codex_quota.additional_primary_window',
      labelParams: { name: 'additional-1' },
      usedPercent: 1,
      resetLabel: '-',
    });
  });

  it('skips an additional entry that has no rate_limit object', async () => {
    requestMock.mockResolvedValue(
      okResult({
        additional_rate_limits: [{ limit_name: 'ignored' }],
      })
    );

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows).toEqual([]);
  });

  it('returns an empty window list when the payload has no rate limits at all', async () => {
    requestMock.mockResolvedValue(okResult({ plan_type: 'plus' }));

    const { windows } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(windows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CODEX: plan-type resolution (usage payload vs auth-file)
// ---------------------------------------------------------------------------

describe('CODEX_CONFIG.fetchQuota plan-type resolution', () => {
  const codexFile = makeFile({ id_token: { chatgpt_account_id: 'acct-1' } });

  it('lowercases the plan type taken from the usage payload', async () => {
    requestMock.mockResolvedValue(okResult({ plan_type: 'PRO' }));

    const { planType } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(planType).toBe('pro');
  });

  it('reads the camelCase planType field from the usage payload', async () => {
    requestMock.mockResolvedValue(okResult({ planType: 'Plus' }));

    const { planType } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(planType).toBe('plus');
  });

  it('falls back to the auth-file plan type when the usage payload has none', async () => {
    const fileWithPlan = makeFile({
      id_token: { chatgpt_account_id: 'acct-1' },
      plan_type: 'Team',
    });
    requestMock.mockResolvedValue(okResult({}));

    const { planType } = await CODEX_CONFIG.fetchQuota(fileWithPlan, t);

    expect(planType).toBe('team');
  });

  it('returns a null plan type when neither the payload nor the file carry one', async () => {
    requestMock.mockResolvedValue(okResult({}));

    const { planType } = await CODEX_CONFIG.fetchQuota(codexFile, t);

    expect(planType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CODEX: status-error path
// ---------------------------------------------------------------------------

describe('CODEX_CONFIG.fetchQuota error path', () => {
  const codexFile = makeFile({ id_token: { chatgpt_account_id: 'acct-1' } });

  it('throws a status-tagged error built from the response body on a non-2xx response', async () => {
    requestMock.mockResolvedValue({
      statusCode: 401,
      header: {},
      bodyText: '{"error":{"message":"bad token"}}',
      body: { error: { message: 'bad token' } },
    });

    const error = (await CODEX_CONFIG.fetchQuota(codexFile, t).catch((e: unknown) => e)) as Error & {
      status?: number;
    };

    expect(error.message).toBe('401 bad token');
    expect(error.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// CLAUDE: state builders (pure)
// ---------------------------------------------------------------------------

describe('CLAUDE_CONFIG state builders', () => {
  it('buildLoadingState produces a loading state with no windows', () => {
    const state = CLAUDE_CONFIG.buildLoadingState();

    expect(state).toEqual({ status: 'loading', windows: [] });
  });

  it('buildSuccessState carries through windows, extra usage and plan type', () => {
    const windows = [{ id: 'five-hour', label: '5h', usedPercent: 50, resetLabel: '-' }];
    const extraUsage = { is_enabled: true, monthly_limit: 1000, used_credits: 100, utilization: 0.1 };

    const state = CLAUDE_CONFIG.buildSuccessState({ windows, extraUsage, planType: 'plan_max' });

    expect(state).toEqual({ status: 'success', windows, extraUsage, planType: 'plan_max' });
  });

  it('buildErrorState records the message and status code', () => {
    const state = CLAUDE_CONFIG.buildErrorState('nope', 500);

    expect(state).toEqual({ status: 'error', windows: [], error: 'nope', errorStatus: 500 });
  });
});

// ---------------------------------------------------------------------------
// CLAUDE: fetchQuota guards & error paths
// ---------------------------------------------------------------------------

describe('CLAUDE_CONFIG.fetchQuota guards and errors', () => {
  it('throws the missing auth_index message when no auth index resolves', async () => {
    const file = makeFile({ auth_index: undefined, authIndex: undefined });

    await expect(CLAUDE_CONFIG.fetchQuota(file, t)).rejects.toThrow('Auth file missing auth_index');

    expect(requestMock).not.toHaveBeenCalled();
  });

  it('rethrows the underlying reason when the usage request rejects', async () => {
    const usageError = new Error('network down');
    // First call is usage, second is profile; both settle via allSettled.
    requestMock.mockRejectedValueOnce(usageError).mockResolvedValueOnce(okResult({}));

    await expect(CLAUDE_CONFIG.fetchQuota(makeFile(), t)).rejects.toThrow('network down');
  });

  it('throws a status-tagged error when the usage response is non-2xx', async () => {
    requestMock
      .mockResolvedValueOnce({ statusCode: 403, header: {}, bodyText: 'forbidden', body: 'forbidden' })
      .mockResolvedValueOnce(okResult({}));

    const error = (await CLAUDE_CONFIG.fetchQuota(makeFile(), t).catch((e: unknown) => e)) as Error & {
      status?: number;
    };

    expect(error.message).toBe('403 forbidden');
    expect(error.status).toBe(403);
  });

  it('throws empty_windows when the usage body is not parseable', async () => {
    requestMock.mockResolvedValueOnce(okResult('')).mockResolvedValueOnce(okResult({}));

    await expect(CLAUDE_CONFIG.fetchQuota(makeFile(), t)).rejects.toThrow('No quota data available');
  });
});

// ---------------------------------------------------------------------------
// CLAUDE: window building via buildClaudeQuotaWindows
// ---------------------------------------------------------------------------

describe('CLAUDE_CONFIG.fetchQuota window building', () => {
  it('builds one window per recognised usage key in the configured order', async () => {
    requestMock
      .mockResolvedValueOnce(
        okResult({
          five_hour: { utilization: 30, resets_at: '' },
          seven_day: { utilization: 70, resets_at: '' },
        })
      )
      .mockResolvedValueOnce(okResult({}));

    const { windows } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(windows).toEqual([
      { id: 'five-hour', label: '5-hour limit', labelKey: 'claude_quota.five_hour', usedPercent: 30, resetLabel: '-' },
      { id: 'seven-day', label: '7-day limit', labelKey: 'claude_quota.seven_day', usedPercent: 70, resetLabel: '-' },
    ]);
  });

  it('skips usage entries that have no utilization field', async () => {
    requestMock
      .mockResolvedValueOnce(
        okResult({
          five_hour: { utilization: 30, resets_at: '' },
          seven_day: { resets_at: '' },
        })
      )
      .mockResolvedValueOnce(okResult({}));

    const { windows } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(windows.map((w) => w.id)).toEqual(['five-hour']);
  });

  it('passes the extra_usage block through unchanged', async () => {
    const extraUsage = { is_enabled: true, monthly_limit: 5000, used_credits: 1234, utilization: 0.25 };
    requestMock
      .mockResolvedValueOnce(okResult({ five_hour: { utilization: 1, resets_at: '' }, extra_usage: extraUsage }))
      .mockResolvedValueOnce(okResult({}));

    const result = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(result.extraUsage).toEqual(extraUsage);
  });
});

// ---------------------------------------------------------------------------
// CLAUDE: plan-type resolution (profile payload + flag normalization)
// ---------------------------------------------------------------------------

describe('CLAUDE_CONFIG.fetchQuota plan-type resolution', () => {
  const usageOk = () => okResult({ five_hour: { utilization: 1, resets_at: '' } });

  it('resolves plan_max when the account has Claude Max', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(okResult({ account: { has_claude_max: true } }));

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBe('plan_max');
  });

  it('resolves plan_pro when the account has Claude Pro but not Max', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(okResult({ account: { has_claude_max: false, has_claude_pro: true } }));

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBe('plan_pro');
  });

  it('resolves plan_team for an active claude_team organization', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(
        okResult({ organization: { organization_type: 'CLAUDE_TEAM', subscription_status: 'ACTIVE' } })
      );

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBe('plan_team');
  });

  it('resolves plan_free when both Max and Pro flags are explicitly false', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(okResult({ account: { has_claude_max: false, has_claude_pro: false } }));

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBe('plan_free');
  });

  it('coerces a string "true" Max flag to plan_max', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(okResult({ account: { has_claude_max: 'true' } }));

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBe('plan_max');
  });

  it('coerces a numeric 1 Pro flag to plan_pro', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(okResult({ account: { has_claude_pro: 1 } }));

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBe('plan_pro');
  });

  it('returns a null plan type when the profile has no recognisable plan signals', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(okResult({ organization: { organization_type: 'other' } }));

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBeNull();
  });

  it('returns a null plan type when the profile request fails', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce({ statusCode: 500, header: {}, bodyText: '', body: null });

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBeNull();
  });

  it('does not treat a claude_team organization as team unless the subscription is active', async () => {
    requestMock
      .mockResolvedValueOnce(usageOk())
      .mockResolvedValueOnce(
        okResult({ organization: { organization_type: 'claude_team', subscription_status: 'canceled' } })
      );

    const { planType } = await CLAUDE_CONFIG.fetchQuota(makeFile(), t);

    expect(planType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Config filterFn behaviour (plan/file gating that drives quota fetching)
// ---------------------------------------------------------------------------

describe('CODEX_CONFIG / CLAUDE_CONFIG filterFn', () => {
  it('CODEX_CONFIG accepts an enabled codex auth file', () => {
    expect(CODEX_CONFIG.filterFn(makeFile({ provider: 'codex' }))).toBe(true);
  });

  it('CODEX_CONFIG rejects a disabled codex auth file', () => {
    expect(CODEX_CONFIG.filterFn(makeFile({ provider: 'codex', disabled: true }))).toBe(false);
  });

  it('CODEX_CONFIG rejects a non-codex provider', () => {
    expect(CODEX_CONFIG.filterFn(makeFile({ provider: 'claude' }))).toBe(false);
  });

  it('CLAUDE_CONFIG accepts an enabled claude auth file', () => {
    expect(CLAUDE_CONFIG.filterFn(makeFile({ provider: 'claude' }))).toBe(true);
  });

  it('CLAUDE_CONFIG rejects a disabled claude auth file', () => {
    expect(CLAUDE_CONFIG.filterFn(makeFile({ provider: 'claude', disabled: true }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// XAI: state builders, filter, fetchQuota guards + happy path
// ---------------------------------------------------------------------------

describe('XAI_CONFIG state builders', () => {
  it('buildLoadingState produces a loading state with no rows', () => {
    expect(XAI_CONFIG.buildLoadingState()).toEqual({ status: 'loading', rows: [] });
  });

  it('buildSuccessState carries through rows and plan type', () => {
    const rows = [{ id: 'included-credits', used: 10, limit: 100, labelKey: 'xai_quota.monthly_credits' }];
    expect(XAI_CONFIG.buildSuccessState({ rows, planType: 'SuperGrok' })).toEqual({
      status: 'success',
      rows,
      planType: 'SuperGrok',
    });
  });

  it('buildErrorState records the message and status code', () => {
    expect(XAI_CONFIG.buildErrorState('boom', 401)).toEqual({
      status: 'error',
      rows: [],
      error: 'boom',
      errorStatus: 401,
    });
  });
});

describe('XAI_CONFIG filterFn', () => {
  it('accepts an enabled xai auth file', () => {
    expect(XAI_CONFIG.filterFn(makeFile({ provider: 'xai' }))).toBe(true);
  });

  it('rejects a disabled xai auth file', () => {
    expect(XAI_CONFIG.filterFn(makeFile({ provider: 'xai', disabled: true }))).toBe(false);
  });

  it('rejects a non-xai provider', () => {
    expect(XAI_CONFIG.filterFn(makeFile({ provider: 'kimi' }))).toBe(false);
  });
});

describe('XAI_CONFIG.fetchQuota guards', () => {
  it('throws the missing auth_index message when no auth index resolves', async () => {
    const file = makeFile({ auth_index: undefined, authIndex: undefined });

    await expect(XAI_CONFIG.fetchQuota(file, t)).rejects.toThrow('Auth file missing auth_index');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('throws empty_data when the billing body is empty', async () => {
    requestMock.mockResolvedValue(okResult(''));

    await expect(XAI_CONFIG.fetchQuota(makeFile({ provider: 'xai' }), t)).rejects.toThrow(
      'No quota data available'
    );
  });

  it('throws empty_data when the billing body has no usable config fields', async () => {
    requestMock.mockResolvedValue(okResult({ config: {} }));

    await expect(XAI_CONFIG.fetchQuota(makeFile({ provider: 'xai' }), t)).rejects.toThrow(
      'No quota data available'
    );
  });

  it('propagates non-2xx status via createStatusError', async () => {
    requestMock.mockResolvedValue({
      statusCode: 403,
      header: {},
      bodyText: 'forbidden',
      body: null,
    });

    await expect(XAI_CONFIG.fetchQuota(makeFile({ provider: 'xai' }), t)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('XAI_CONFIG.fetchQuota happy path', () => {
  it('calls the Grok CLI billing endpoint with X-XAI-Token-Auth and returns rows', async () => {
    requestMock
      .mockResolvedValueOnce(
        okResult({
          config: {
            used: { val: 42 },
            monthlyLimit: { val: 500 },
            onDemandCap: { val: 1000 },
            billingPeriodEnd: '2030-06-01T00:00:00.000Z',
          },
          subscription_tier_display: 'SuperGrok',
        })
      )
      .mockResolvedValueOnce(okResult({ subscription_tier_display: 'SuperGrok Heavy' }));

    const result = await XAI_CONFIG.fetchQuota(makeFile({ provider: 'xai', auth_index: '9' }), t);

    expect(requestMock).toHaveBeenCalledWith({
      authIndex: '9',
      method: 'GET',
      url: XAI_BILLING_URL,
      header: { ...XAI_REQUEST_HEADERS },
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      id: 'included-credits',
      used: 42,
      limit: 500,
    });
    expect(result.rows[1]).toMatchObject({ id: 'on-demand-cap', limit: 1000 });
    // Billing-side plan wins when present.
    expect(result.planType).toBe('SuperGrok');
  });

  it('falls back to settings subscription_tier_display when billing has no plan', async () => {
    requestMock
      .mockResolvedValueOnce(
        okResult({
          config: {
            used: { val: 1750 },
            monthlyLimit: { val: 150000 },
            onDemandCap: { val: 0 },
          },
        })
      )
      .mockResolvedValueOnce(okResult({ subscription_tier_display: 'SuperGrok Heavy' }));

    const result = await XAI_CONFIG.fetchQuota(makeFile({ provider: 'xai' }), t);

    expect(result.rows[0]).toMatchObject({ used: 1750, limit: 150000 });
    expect(result.planType).toBe('SuperGrok Heavy');
  });

  it('still succeeds when the optional settings request fails', async () => {
    requestMock
      .mockResolvedValueOnce(
        okResult({
          config: { used: { val: 1 }, monthlyLimit: { val: 10 } },
        })
      )
      .mockRejectedValueOnce(new Error('network down'));

    const result = await XAI_CONFIG.fetchQuota(makeFile({ provider: 'xai' }), t);

    expect(result.rows).toHaveLength(1);
    expect(result.planType).toBeNull();
  });
});
