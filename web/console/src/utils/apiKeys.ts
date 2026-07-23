/**
 * Shared API-key list helpers.
 */

/**
 * Normalize an arbitrary API-key payload (array of strings or objects) into a
 * de-duplicated list of trimmed key strings. Tolerates the several shapes the
 * server uses for a key entry (`api-key` / `apiKey` / `key` / `Key`).
 */
export function normalizeApiKeyList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];

  input.forEach((item) => {
    const record =
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    const value =
      typeof item === 'string'
        ? item
        : record
          ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
          : '';
    const trimmed = String(value ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push(trimmed);
  });

  return keys;
}
