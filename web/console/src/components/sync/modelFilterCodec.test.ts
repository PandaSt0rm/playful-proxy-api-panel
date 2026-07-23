import { describe, it, expect } from 'vitest';
import { escapeRegex, encodeListAsRegex, decodeRegexAsList } from './modelFilterCodec';

describe('escapeRegex', () => {
  it('returns a plain alphanumeric string unchanged', () => {
    expect(escapeRegex('gpt4o')).toBe('gpt4o');
  });

  it('escapes a single dot with a backslash', () => {
    expect(escapeRegex('gpt-4.1')).toBe('gpt-4\\.1');
  });

  it('leaves the hyphen unescaped since it is not a top-level metacharacter', () => {
    expect(escapeRegex('claude-3-opus')).toBe('claude-3-opus');
  });

  it('escapes every regex metacharacter present in the string', () => {
    expect(escapeRegex('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o/p')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o\\/p'
    );
  });

  it('returns an empty string for empty input', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('escapes a backslash by doubling it', () => {
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });
});

describe('encodeListAsRegex', () => {
  it('wraps a single id in an anchored non-capturing group', () => {
    expect(encodeListAsRegex(['gpt-4o'])).toBe('^(?:gpt-4o)$');
  });

  it('joins multiple ids with a pipe inside the group', () => {
    expect(encodeListAsRegex(['a', 'b', 'c'])).toBe('^(?:a|b|c)$');
  });

  it('returns an empty string for an empty list', () => {
    expect(encodeListAsRegex([])).toBe('');
  });

  it('returns an empty string when every id is blank or whitespace', () => {
    expect(encodeListAsRegex(['', '   ', '\t'])).toBe('');
  });

  it('trims surrounding whitespace from each id before encoding', () => {
    expect(encodeListAsRegex(['  gpt-4o  ', ' claude '])).toBe('^(?:gpt-4o|claude)$');
  });

  it('drops blank ids while keeping non-blank ones', () => {
    expect(encodeListAsRegex(['a', '', 'b'])).toBe('^(?:a|b)$');
  });

  it('escapes metacharacters in each id', () => {
    expect(encodeListAsRegex(['gpt-4.1', 'o1'])).toBe('^(?:gpt-4\\.1|o1)$');
  });

  it('preserves duplicate ids verbatim without deduplication', () => {
    expect(encodeListAsRegex(['a', 'a'])).toBe('^(?:a|a)$');
  });

  it('handles a large list by joining all entries', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `m${i}`);

    const result = encodeListAsRegex(ids);

    expect(result).toBe(`^(?:${ids.join('|')})$`);
  });
});

describe('decodeRegexAsList', () => {
  it('returns empty list mode for an empty string', () => {
    expect(decodeRegexAsList('')).toEqual({ mode: 'list', ids: [], raw: '' });
  });

  it('returns empty list mode for whitespace-only input but preserves raw', () => {
    expect(decodeRegexAsList('   ')).toEqual({ mode: 'list', ids: [], raw: '   ' });
  });

  it('treats null-coalesced undefined as empty list mode', () => {
    expect(decodeRegexAsList(undefined as unknown as string)).toEqual({
      mode: 'list',
      ids: [],
      raw: '',
    });
  });

  it('decodes a single-id canonical regex back to one id', () => {
    expect(decodeRegexAsList('^(?:gpt-4o)$')).toEqual({
      mode: 'list',
      ids: ['gpt-4o'],
      raw: '^(?:gpt-4o)$',
    });
  });

  it('decodes a multi-id canonical regex back to the ordered list', () => {
    expect(decodeRegexAsList('^(?:a|b|c)$')).toEqual({
      mode: 'list',
      ids: ['a', 'b', 'c'],
      raw: '^(?:a|b|c)$',
    });
  });

  it('unescapes escaped metacharacters inside an alternate', () => {
    expect(decodeRegexAsList('^(?:gpt-4\\.1)$')).toEqual({
      mode: 'list',
      ids: ['gpt-4.1'],
      raw: '^(?:gpt-4\\.1)$',
    });
  });

  it('treats a non-canonical regex as regex mode with no ids', () => {
    expect(decodeRegexAsList('^glm-5')).toEqual({ mode: 'regex', ids: [], raw: '^glm-5' });
  });

  it('treats a regex missing the trailing anchor as regex mode', () => {
    expect(decodeRegexAsList('^(?:a|b)')).toEqual({ mode: 'regex', ids: [], raw: '^(?:a|b)' });
  });

  it('treats an empty alternation group as regex mode', () => {
    expect(decodeRegexAsList('^(?:)$')).toEqual({ mode: 'regex', ids: [], raw: '^(?:)$' });
  });

  it('treats a list-shaped wrapper containing a bare metacharacter as regex mode', () => {
    expect(decodeRegexAsList('^(?:a.b)$')).toEqual({ mode: 'regex', ids: [], raw: '^(?:a.b)$' });
  });

  it('treats a trailing dangling escape inside the group as regex mode', () => {
    expect(decodeRegexAsList('^(?:a\\)$')).toEqual({ mode: 'regex', ids: [], raw: '^(?:a\\)$' });
  });

  it('treats an empty alternate produced by a leading pipe as regex mode', () => {
    expect(decodeRegexAsList('^(?:|a)$')).toEqual({ mode: 'regex', ids: [], raw: '^(?:|a)$' });
  });

  it('preserves surrounding whitespace in raw while decoding the trimmed body', () => {
    expect(decodeRegexAsList('  ^(?:a|b)$  ')).toEqual({
      mode: 'list',
      ids: ['a', 'b'],
      raw: '  ^(?:a|b)$  ',
    });
  });

  it.each([
    ['single plain id', ['gpt-4o']],
    ['multiple plain ids', ['a', 'b', 'c']],
    ['ids with dots', ['gpt-4.1', 'gpt-4.5']],
    ['ids with hyphens and digits', ['claude-3-opus', 'o1-preview']],
    ['ids needing metacharacter escapes', ['a+b', 'c*d', 'e?f', 'g(h)']],
    ['ids containing pipes', ['a|b', 'c']],
    ['ids containing backslashes', ['a\\b', 'c']],
    ['ids containing square brackets', ['m[1]', 'm[2]']],
    ['a large id list', Array.from({ length: 40 }, (_, i) => `model-${i}.v${i}`)],
  ])('round-trips %s losslessly through encode then decode', (_label, ids) => {
    const encoded = encodeListAsRegex(ids);

    const decoded = decodeRegexAsList(encoded);

    expect(decoded).toEqual({ mode: 'list', ids, raw: encoded });
  });

  it('round-trips trimmed ids: blanks are dropped before encoding so decode yields the cleaned list', () => {
    const encoded = encodeListAsRegex(['  a  ', '', 'b']);

    const decoded = decodeRegexAsList(encoded);

    expect(decoded).toEqual({ mode: 'list', ids: ['a', 'b'], raw: '^(?:a|b)$' });
  });
});
