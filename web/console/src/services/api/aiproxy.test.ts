import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiproxyApi } from './aiproxy';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe('aiproxyApi contracts', () => {
  it('requests readiness, revision lists, sync drift defaults, pricing, budgets, and budget status', async () => {
    await aiproxyApi.readiness();
    await aiproxyApi.revisions();
    await aiproxyApi.syncDrift();
    await aiproxyApi.syncDrift(120);
    await aiproxyApi.pricing();
    await aiproxyApi.budgets();
    await aiproxyApi.budgetStatus();

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/aiproxy/readiness');
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/aiproxy/config-revisions');
    expect(apiClient.get).toHaveBeenNthCalledWith(
      3,
      '/aiproxy/sync-drift?stale_after_seconds=86400'
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(4, '/aiproxy/sync-drift?stale_after_seconds=120');
    expect(apiClient.get).toHaveBeenNthCalledWith(5, '/aiproxy/pricing');
    expect(apiClient.get).toHaveBeenNthCalledWith(6, '/aiproxy/budgets');
    expect(apiClient.get).toHaveBeenNthCalledWith(7, '/aiproxy/budget-status');
  });

  it('encodes revision paths and diagnostics history queries', async () => {
    await aiproxyApi.revision('rev / one');
    await aiproxyApi.diagnosticHistory('kind=auth-file&limit=50');

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/aiproxy/config-revisions/rev%20%2F%20one');
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      '/aiproxy/diagnostics?kind=auth-file&limit=50'
    );
  });

  it('posts restore and diagnostic request bodies', async () => {
    const diagnostic = { target: { kind: 'codex', auth_index: '1' }, check: 'models' };
    await aiproxyApi.restore('rev/1', 'sha');
    await aiproxyApi.diagnostics(diagnostic);

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/aiproxy/config-revisions/rev%2F1/restore', {
      expected_current_sha256: 'sha',
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/aiproxy/diagnostics', diagnostic);
  });

  it('creates, updates, and deletes encoded budget resources', async () => {
    const input = {
      name: 'Provider',
      scope: 'provider' as const,
      match: 'claude',
      period: 'month' as const,
      limit_usd: 10,
      warning_percent: 80,
      enabled: true,
    };
    await aiproxyApi.createBudget(input);
    await aiproxyApi.updateBudget('budget / one', input);
    await aiproxyApi.deleteBudget('budget / one');

    expect(apiClient.post).toHaveBeenCalledWith('/aiproxy/budgets', input);
    expect(apiClient.put).toHaveBeenCalledWith('/aiproxy/budgets/budget%20%2F%20one', input);
    expect(apiClient.delete).toHaveBeenCalledWith('/aiproxy/budgets/budget%20%2F%20one');
  });
});
