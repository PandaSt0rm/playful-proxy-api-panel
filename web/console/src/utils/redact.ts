/**
 * Value-level secret masking for provider debug traces.
 *
 * Why this exists rather than reusing the existing redactors:
 * - `DiagnosticsPage`'s local `redactDetail` and the backend's `control.RedactYAML`
 *   both match on the *key name* and blank the whole value. In a wire trace the
 *   secret sits inside a string (`"> authorization: Bearer sk-proj-..."`), so a
 *   key-name rule never fires and the credential renders verbatim.
 * - Blanking also destroys the diagnostic itself: an operator debugging "which of my
 *   five keys is dead" needs to tell the keys apart. Masking keeps a short prefix and
 *   suffix so two credentials stay distinguishable while the secret does not survive.
 *
 * Apply at trace construction, never at render. Nothing unmasked should reach component
 * state, the clipboard, or an endpoint that persists it.
 */

/** Matches the mask glyph used by the backend redactor so masking reads the same console-wide. */
const MASK = '••••';

const PREFIX_LENGTH = 8;
const SUFFIX_LENGTH = 4;

/**
 * Below this length a partial mask would reveal more than it hides, so the value is
 * replaced outright. Prefix plus suffix is 12; requiring 20 keeps at least 8 characters
 * masked in every partially-masked value.
 */
const MIN_PARTIAL_MASK_LENGTH = 20;

/** Header names whose entire value is a credential regardless of its shape. */
const SECRET_HEADER_NAMES = [
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-goog-api-key',
  'x-api-token',
  'api-key',
  'apikey',
  'cookie',
  'set-cookie',
] as const;

const SECRET_HEADER_NAME_SET: ReadonlySet<string> = new Set(SECRET_HEADER_NAMES);

/** Object keys that carry credentials in JSON payloads and probe detail blobs. */
const SECRET_KEY_PATTERN = /(?:^|[-_])(?:api[-_]?key|key|token|secret|password|credential)s?$/i;

/** Auth schemes worth preserving: knowing the scheme is diagnostic, the token is not. */
const AUTH_SCHEME_PATTERN = /^(?:bearer|basic|token)\s+/i;

/**
 * Credential shapes emitted by the providers this console talks to. Deliberately anchored
 * to known prefixes rather than "any long opaque string" — a generic rule would mask model
 * IDs, request IDs, and base64 image payloads.
 */
const SECRET_TOKEN_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI, Anthropic (sk-ant-), OpenRouter (sk-or-v1-)
  /AIza[A-Za-z0-9_-]{20,}/g, // Google / Gemini
  /xai-[A-Za-z0-9_-]{16,}/g, // xAI
  /gsk_[A-Za-z0-9_-]{16,}/g, // Groq
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT (OAuth access tokens)
];

const BEARER_PATTERN = /(bearer\s+)(\S+)/gi;

const SECRET_HEADER_LINE_PATTERN = new RegExp(
  `^([^\\n:]*\\b(?:${SECRET_HEADER_NAMES.join('|')})\\s*:\\s*)(.+)$`,
  'gim'
);

/**
 * Replaces the middle of a credential with the mask glyph, keeping enough of both ends to
 * tell two credentials apart. Short values are replaced entirely.
 */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.length < MIN_PARTIAL_MASK_LENGTH) return MASK;
  return `${trimmed.slice(0, PREFIX_LENGTH)}${MASK}${trimmed.slice(-SUFFIX_LENGTH)}`;
}

/** Masks a credential while preserving a leading auth scheme (`Bearer`, `Basic`, `Token`). */
export function maskCredential(value: string): string {
  const scheme = AUTH_SCHEME_PATTERN.exec(value);
  if (!scheme) return maskSecret(value);
  return `${scheme[0]}${maskSecret(value.slice(scheme[0].length))}`;
}

/**
 * Masks every credential-shaped token in free text. Safe to run over whole trace bodies,
 * response payloads, and error messages.
 */
export function redactSecretText(text: string): string {
  // Each pass skips values that already carry the mask glyph. Redaction must be
  // idempotent: traces are re-scanned when nested structures pass through `redactDeep`,
  // and a second unguarded pass would chew `Bearer sk-proj-••••6789` down to `Bearer ••••`,
  // destroying the prefix an operator uses to tell two keys apart.
  let result = text.replace(SECRET_HEADER_LINE_PATTERN, (match, label: string, secret: string) =>
    secret.includes(MASK) ? match : `${label}${maskCredential(secret)}`
  );
  result = result.replace(BEARER_PATTERN, (match, scheme: string, token: string) =>
    token.includes(MASK) ? match : `${scheme}${maskSecret(token)}`
  );
  for (const pattern of SECRET_TOKEN_PATTERNS) {
    result = result.replace(pattern, (match) => maskSecret(match));
  }
  return result;
}

/** True when a header or object key names a credential outright. */
export function isSecretName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return SECRET_HEADER_NAME_SET.has(normalized) || SECRET_KEY_PATTERN.test(normalized);
}

/**
 * Masks header values. Credential-named headers are masked whole; every other value is
 * still scanned, because keys leak through custom headers too.
 */
export function redactHeaderEntries(
  entries: readonly (readonly [string, string])[]
): [string, string][] {
  return entries.map(([name, value]) => [
    name,
    isSecretName(name) ? maskCredential(value) : redactSecretText(value),
  ]);
}

/**
 * Recursively masks a decoded JSON value. Strings are scanned; a value under a
 * credential-named key is masked whole, since those carry secrets matching no known prefix
 * (custom gateways, self-hosted deployments).
 */
export function redactDeep(value: unknown, keyName = ''): unknown {
  if (typeof value === 'string') {
    return isSecretName(keyName) ? maskCredential(value) : redactSecretText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, keyName));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactDeep(entryValue, entryKey),
      ])
    );
  }
  return value;
}
