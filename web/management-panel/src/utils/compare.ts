export function areStringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function areKeyValueEntriesEqual(
  a: readonly { key: string; value: string }[],
  b: readonly { key: string; value: string }[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.key !== right.key || left.value !== right.value) return false;
  }
  return true;
}

export function areModelEntriesEqual(
  a: readonly {
    name: string;
    alias: string;
    regex?: boolean;
    thinking?: unknown;
    thinkingLevels?: readonly string[];
  }[],
  b: readonly {
    name: string;
    alias: string;
    regex?: boolean;
    thinking?: unknown;
    thinkingLevels?: readonly string[];
  }[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.name !== right.name || left.alias !== right.alias) return false;
    if (Boolean(left.regex) !== Boolean(right.regex)) return false;
    const leftThinkingLevels = left.thinkingLevels ?? [];
    const rightThinkingLevels = right.thinkingLevels ?? [];
    if (!areStringArraysEqual(leftThinkingLevels, rightThinkingLevels)) return false;
    if (JSON.stringify(left.thinking ?? null) !== JSON.stringify(right.thinking ?? null)) {
      return false;
    }
  }
  return true;
}
