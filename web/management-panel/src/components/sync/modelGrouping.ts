/**
 * Group the flat sync-available-configs response into provider/channel
 * sections suitable for the grouped ModelPicker UI.
 */

import type { SyncAvailableConfigs } from '@/types';

export interface ModelGroup {
  /** Stable identifier used for React keys and search match. */
  key: string;
  /** Human-readable section label rendered in the picker. */
  label: string;
  /** Optional secondary line: account count for OAuth groups, etc. */
  sublabel?: string;
  /** Model IDs available in this group (already deduplicated upstream). */
  models: string[];
}

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  'claude-api-key': 'Claude (API key)',
  'codex-api-key': 'Codex (API key)',
  'gemini-api-key': 'Gemini (API key)',
  'vertex-api-key': 'Vertex (API key)',
};

const PROVIDER_TYPE_ORDER: Record<string, number> = {
  'claude-api-key': 0,
  'codex-api-key': 1,
  'gemini-api-key': 2,
  'vertex-api-key': 3,
  'openai-compatibility': 4,
};

export function groupModels(configs: SyncAvailableConfigs | null): ModelGroup[] {
  if (!configs) return [];

  const groups: ModelGroup[] = [];

  const oauth = [...(configs.oauth_channels ?? [])].sort((a, b) =>
    a.channel.localeCompare(b.channel)
  );

  for (const ch of oauth) {
    if (!ch.models || ch.models.length === 0) continue;
    const label = ch.display_name?.trim() || titleCase(ch.channel) + ' (OAuth)';
    const sublabel =
      typeof ch.account_count === 'number' && ch.account_count > 0
        ? `${ch.account_count} account${ch.account_count === 1 ? '' : 's'} · ${ch.channel}`
        : ch.channel;
    groups.push({
      key: `oauth:${ch.channel}`,
      label,
      sublabel,
      models: dedupePreservingOrder(ch.models),
    });
  }

  const providers = [...(configs.providers ?? [])].sort((a, b) => {
    const ra = PROVIDER_TYPE_ORDER[a.type] ?? 99;
    const rb = PROVIDER_TYPE_ORDER[b.type] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  for (const p of providers) {
    if (!p.models || p.models.length === 0) continue;
    let label: string;
    let sublabel: string | undefined;
    if (p.type === 'openai-compatibility') {
      label = p.name?.trim() || 'OpenAI-compatible';
      sublabel = 'OpenAI-compatible';
    } else {
      label = PROVIDER_TYPE_LABELS[p.type] ?? p.type;
      sublabel = p.type;
    }
    groups.push({
      key: `provider:${p.type}:${p.name ?? ''}`,
      label,
      sublabel,
      models: dedupePreservingOrder(p.models),
    });
  }

  return groups;
}

/** Find the first group containing a given model ID; used to render source hints next to chips. */
export function findModelSource(groups: ModelGroup[], modelId: string): ModelGroup | undefined {
  return groups.find((g) => g.models.includes(modelId));
}

function dedupePreservingOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function titleCase(s: string): string {
  const t = s.trim();
  if (t.length === 0) return '';
  return t[0].toUpperCase() + t.slice(1);
}
