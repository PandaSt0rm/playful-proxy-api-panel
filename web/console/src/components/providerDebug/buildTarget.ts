import { buildHeaderObject, type HeaderEntry } from '@/utils/headers';
import type { DebugProviderFamily } from '@/features/providerDebug/families';
import type { DebugTarget } from '@/features/providerDebug/types';

/** The subset of a provider edit form the bench needs. */
export interface SingleKeyForm {
  apiKey: string;
  baseUrl?: string;
  headers: HeaderEntry[];
  modelEntries: Array<{ name: string }>;
  authIndex?: string;
}

/**
 * Builds a bench target from a single-credential provider form.
 *
 * Most provider families hold one key per entry; only the OpenAI-compatible editor manages
 * a list, and it builds its own target.
 */
export function buildSingleKeyTarget(input: {
  providerLabel: string;
  family: DebugProviderFamily;
  routedKind: string;
  form: SingleKeyForm;
  model?: string;
}): DebugTarget {
  const models = input.form.modelEntries.map((entry) => entry.name).filter((name) => name.trim());
  return {
    providerLabel: input.providerLabel,
    family: input.family,
    routedKind: input.routedKind,
    baseUrl: input.form.baseUrl ?? '',
    headers: buildHeaderObject(input.form.headers),
    keys: [{ apiKey: input.form.apiKey ?? '', authIndex: input.form.authIndex }],
    models,
    model: input.model?.trim() || models[0] || '',
  };
}
