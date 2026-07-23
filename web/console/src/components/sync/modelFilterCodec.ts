/**
 * Encode/decode the persisted `model-filter` regex string against a
 * human-friendly list of model IDs. The form storage shape never changes —
 * filters are always saved as a single regex string. The `list` UI mode
 * simply serialises chips to a canonical regex (`^(?:A|B|C)$`) that the
 * decoder can recognise on load.
 */

const REGEX_META = /[.*+?^${}()|[\]\\/]/g;

export function escapeRegex(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

/**
 * Serialise a list of model IDs to a canonical anchored alternation regex.
 * Returns an empty string when the list has no entries so callers can omit
 * `model-filter` from the persisted target.
 */
export function encodeListAsRegex(ids: string[]): string {
  const cleaned = ids.map((id) => id.trim()).filter((id) => id.length > 0);
  if (cleaned.length === 0) return '';
  return `^(?:${cleaned.map(escapeRegex).join('|')})$`;
}

export interface DecodedFilter {
  /** UI mode to render: chips list or raw regex. */
  mode: 'list' | 'regex';
  /** Model IDs decoded from the canonical list shape; empty in regex mode. */
  ids: string[];
  /** Original raw string preserved verbatim for regex-mode editing. */
  raw: string;
}

/**
 * Detect whether `filter` was produced by `encodeListAsRegex` and decode it back
 * to model IDs. Any deviation from the canonical shape returns `regex` mode so
 * existing patterns (e.g. `^glm-5`) round-trip unchanged.
 */
export function decodeRegexAsList(filter: string): DecodedFilter {
  const raw = filter ?? '';
  const trimmed = raw.trim();

  if (trimmed === '') {
    return { mode: 'list', ids: [], raw };
  }

  if (!trimmed.startsWith('^(?:') || !trimmed.endsWith(')$')) {
    return { mode: 'regex', ids: [], raw };
  }

  const inner = trimmed.slice(4, -2);
  if (inner.length === 0) {
    return { mode: 'regex', ids: [], raw };
  }

  // Split on top-level `|` without touching escaped alternates. Since the
  // canonical encoding escapes every regex metacharacter inside an ID, a
  // `|` only ever appears as a separator — never inside an alternate.
  const parts = splitAlternation(inner);
  if (parts === null) {
    return { mode: 'regex', ids: [], raw };
  }

  const ids: string[] = [];
  for (const part of parts) {
    const decoded = tryUnescape(part);
    if (decoded === null) {
      return { mode: 'regex', ids: [], raw };
    }
    ids.push(decoded);
  }

  // Round-trip check: ensure the decoded list re-encodes to the exact input.
  // This catches edge cases where the input happens to look list-shaped but
  // wouldn't survive a save/load cycle losslessly.
  if (encodeListAsRegex(ids) !== trimmed) {
    return { mode: 'regex', ids: [], raw };
  }

  return { mode: 'list', ids, raw };
}

function splitAlternation(inner: string): string[] | null {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\') {
      // Escape: consume two characters as one unit.
      if (i + 1 >= inner.length) return null;
      current += ch + inner[i + 1];
      i += 1;
      continue;
    }
    if (ch === '|') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function tryUnescape(part: string): string | null {
  let out = '';
  for (let i = 0; i < part.length; i++) {
    const ch = part[i];
    if (ch === '\\') {
      if (i + 1 >= part.length) return null;
      out += part[i + 1];
      i += 1;
      continue;
    }
    // Bare metacharacter inside what should be a literal alternate — not a list.
    if ('.*+?^${}()|[]/\\'.includes(ch)) return null;
    out += ch;
  }
  return out;
}
