import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import {
  CLAUDE_CONFIG,
  ANTIGRAVITY_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG,
  XAI_CONFIG,
  ZAI_CONFIG,
} from './quotaConfigs';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  KimiQuotaState,
  XaiQuotaState,
  ZaiQuotaState,
} from '@/types';

// Echo translator: returns the key, or `key:count` for count-based lookups.
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts && 'count' in opts ? `${key}:${opts.count}` : key) as unknown as TFunction;

describe('getSummary normalizers', () => {
  it('claude converts used% windows to remaining and surfaces plan + extra usage', () => {
    const state: ClaudeQuotaState = {
      status: 'success',
      windows: [{ id: '5h', label: '5h', usedPercent: 40, resetLabel: 'R1' }],
      planType: 'plan_max',
      extraUsage: { is_enabled: true, used_credits: 150, monthly_limit: 500 },
    };
    const summary = CLAUDE_CONFIG.getSummary(state, t);
    expect(summary.meters).toEqual([
      { id: '5h', label: '5h', remainingPercent: 60, resetLabel: 'R1' },
    ]);
    expect(summary.extras).toEqual([
      { id: 'plan', label: 'claude_quota.plan_label', value: 'claude_quota.plan_max' },
      { id: 'extra', label: 'claude_quota.extra_usage_label', value: '$1.50 / $5.00' },
    ]);
  });

  it('codex marks pro plans as premium and converts used% to remaining', () => {
    const state: CodexQuotaState = {
      status: 'success',
      windows: [{ id: 'w', label: 'Primary', usedPercent: 25, resetLabel: 'R' }],
      planType: 'pro',
    };
    const summary = CODEX_CONFIG.getSummary(state, t);
    expect(summary.meters[0].remainingPercent).toBe(75);
    expect(summary.extras[0]).toMatchObject({ id: 'plan', premium: true });
  });

  it('antigravity converts remaining fractions to percent', () => {
    const state: AntigravityQuotaState = {
      status: 'success',
      groups: [{ id: 'g', label: 'Group', models: ['m'], remainingFraction: 0.4 }],
    };
    const summary = ANTIGRAVITY_CONFIG.getSummary(state, t);
    expect(summary.meters[0].remainingPercent).toBe(40);
    expect(summary.extras).toEqual([]);
  });

  it('gemini surfaces tier/credits and bucket amounts', () => {
    const state: GeminiCliQuotaState = {
      status: 'success',
      buckets: [
        {
          id: 'b',
          label: 'Flash',
          remainingFraction: 0.5,
          remainingAmount: 120,
          resetTime: undefined,
          tokenType: null,
        },
      ],
      tierLabel: 'Ultra',
      tierId: 'g1-ultra-tier',
      creditBalance: 300,
    };
    const summary = GEMINI_CLI_CONFIG.getSummary(state, t);
    expect(summary.meters[0]).toMatchObject({
      remainingPercent: 50,
      amountLabel: 'gemini_cli_quota.remaining_amount:120',
    });
    expect(summary.extras).toEqual([
      { id: 'tier', label: 'gemini_cli_quota.tier_label', value: 'Ultra', premium: true },
      {
        id: 'credits',
        label: 'gemini_cli_quota.credit_label',
        value: 'gemini_cli_quota.credit_amount:300',
      },
    ]);
  });

  it('kimi converts used/limit rows to remaining with an amount label', () => {
    const state: KimiQuotaState = {
      status: 'success',
      rows: [{ id: 'r', label: 'RPM', used: 30, limit: 100 }],
    };
    const summary = KIMI_CONFIG.getSummary(state, t);
    expect(summary.meters[0]).toMatchObject({ remainingPercent: 70, amountLabel: '30 / 100' });
  });

  it('xai converts used/limit rows to remaining and surfaces plan type', () => {
    const state: XaiQuotaState = {
      status: 'success',
      rows: [{ id: 'monthly-credits', label: 'Monthly', used: 25, limit: 100, resetHint: '04/01' }],
      planType: 'SuperGrok',
    };
    const summary = XAI_CONFIG.getSummary(state, t);
    expect(summary.meters[0]).toMatchObject({
      remainingPercent: 75,
      amountLabel: '25 / 100',
    });
    expect(summary.extras).toEqual([
      { id: 'plan', label: 'xai_quota.plan_label', value: 'SuperGrok' },
    ]);
  });

  it('zai keeps remaining percent and pairs current/limit amounts', () => {
    const state: ZaiQuotaState = {
      status: 'success',
      rows: [
        {
          id: 'r',
          label: 'Daily',
          usedPercent: 20,
          remainingPercent: 80,
          currentValue: 20,
          limit: 100,
        },
      ],
    };
    const summary = ZAI_CONFIG.getSummary(state, t);
    expect(summary.meters[0].remainingPercent).toBe(80);
    expect(summary.meters[0].amountLabel).toContain('/');
  });

  it('reports an empty-message key when a successful state has no meters', () => {
    const summary = CLAUDE_CONFIG.getSummary({ status: 'success', windows: [] }, t);
    expect(summary.meters).toHaveLength(0);
    expect(summary.emptyMessageKey).toBe('claude_quota.empty_windows');
  });
});
