/**
 * Renders a trace as plain text for the clipboard.
 *
 * The format is the `curl -v` transcript an operator already knows how to read — `>` for
 * what was sent, `<` for what came back — so a pasted trace needs no explanation in a bug
 * report. Input is an already-redacted `DebugTrace`; this module adds no masking of its
 * own and must never be handed an unredacted trace.
 */

import type { DebugRequestSnapshot, DebugResponseSnapshot, DebugTrace } from './types';

export interface TraceTextParts {
  /** Translated row label, e.g. `auth · key #2`. */
  label: string;
  /** Translated outcome message. */
  message: string;
}

const prefixLines = (text: string, prefix: string): string[] =>
  text.split('\n').map((line) => `${prefix}${line}`);

/** The trace view renders these same lines, so what is displayed is what gets copied. */
export function requestLines(request: DebugRequestSnapshot): string[] {
  const lines = [`> ${request.method} ${request.url}`];
  for (const [name, value] of request.headers) {
    lines.push(`> ${name}: ${value}`);
  }
  if (request.body) {
    lines.push('>', ...prefixLines(request.body, '> '));
  }
  return lines;
}

export function responseLines(response: DebugResponseSnapshot): string[] {
  const lines = [`< HTTP ${response.status}`];
  for (const [name, value] of response.headers) {
    lines.push(`< ${name}: ${value}`);
  }
  if (response.body) {
    lines.push('<', ...prefixLines(response.body, '< '));
  }
  return lines;
}

export function formatTraceText(trace: DebugTrace, parts: TraceTextParts): string {
  const lines: string[] = [
    `[${trace.status}] ${parts.label} · ${trace.lane} · ${trace.timing.totalMs} ms`,
    parts.message,
  ];

  if (trace.request) {
    lines.push('', ...requestLines(trace.request));
  }
  if (trace.response) {
    lines.push('', ...responseLines(trace.response));
  }

  return lines.join('\n');
}
