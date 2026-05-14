import { configApi } from './config';
import {
  normalizeConcurrencyProviderKey,
  parseConcurrencyLimitDraft,
} from '@/utils/upstreamConcurrency';

export async function saveProviderConcurrencyDraft({
  providerKey,
  draftLimit,
  baselineProviderKey,
  baselineDraftLimit,
}: {
  providerKey: string;
  draftLimit: string;
  baselineProviderKey?: string;
  baselineDraftLimit?: string;
}) {
  const nextProvider = normalizeConcurrencyProviderKey(providerKey);
  const previousProvider = normalizeConcurrencyProviderKey(baselineProviderKey ?? providerKey);
  const nextDraft = draftLimit.trim();
  const previousDraft = String(baselineDraftLimit ?? '').trim();

  if (previousProvider && previousProvider !== nextProvider && previousDraft !== '') {
    await configApi.deleteUpstreamConcurrencyProvider(previousProvider);
  }

  if (!nextProvider) return;

  if (nextDraft === '') {
    if (previousDraft !== '' || previousProvider !== nextProvider) {
      await configApi.deleteUpstreamConcurrencyProvider(nextProvider);
    }
    return;
  }

  const limit = parseConcurrencyLimitDraft(nextDraft);
  if (limit === null || !Number.isFinite(limit)) {
    throw new Error('invalid concurrency limit');
  }

  if (nextProvider === previousProvider && nextDraft === previousDraft) return;
  await configApi.updateUpstreamConcurrencyProvider(nextProvider, limit);
}
