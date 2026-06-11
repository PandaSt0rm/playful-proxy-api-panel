/**
 * Generic API call helper (proxied via management API).
 */

import type { AxiosRequestConfig } from 'axios';
import { apiClient } from './client';

export interface ApiCallRequest {
  authIndex?: string;
  method: string;
  url: string;
  header?: Record<string, string>;
  data?: string;
  proxyUrl?: string;
}

export interface ApiCallResult<T = unknown> {
  statusCode: number;
  header: Record<string, string[]>;
  bodyText: string;
  body: T | null;
}

// The upstream `/api-call` proxy returns headers as Go's http.Header shape
// (Record<string, string[]>), but tolerate a flat Record<string, string> too.
// Normalizing here removes an unchecked `as` cast that would silently lie about
// the value shape to downstream consumers.
const normalizeHeaderMap = (input: unknown): Record<string, string[]> => {
  if (input === null || typeof input !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      result[key] = value.map((item) => String(item));
    } else if (value !== undefined && value !== null) {
      result[key] = [String(value)];
    }
  }
  return result;
};

const normalizeBody = (input: unknown): { bodyText: string; body: unknown | null } => {
  if (input === undefined || input === null) {
    return { bodyText: '', body: null };
  }

  if (typeof input === 'string') {
    const text = input;
    const trimmed = text.trim();
    if (!trimmed) {
      return { bodyText: text, body: null };
    }
    try {
      return { bodyText: text, body: JSON.parse(trimmed) };
    } catch {
      return { bodyText: text, body: text };
    }
  }

  try {
    return { bodyText: JSON.stringify(input), body: input };
  } catch {
    return { bodyText: String(input), body: input };
  }
};

export const getApiCallErrorMessage = (result: ApiCallResult): string => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object';

  const status = result.statusCode;
  const body = result.body;
  const bodyText = result.bodyText;
  let message = '';

  if (isRecord(body)) {
    const errorValue = body.error;
    if (isRecord(errorValue) && typeof errorValue.message === 'string') {
      message = errorValue.message;
    } else if (typeof errorValue === 'string') {
      message = errorValue;
    }
    if (!message && typeof body.message === 'string') {
      message = body.message;
    }
  } else if (typeof body === 'string') {
    message = body;
  }

  if (!message && bodyText) {
    message = bodyText;
  }

  if (status && message) return `${status} ${message}`.trim();
  if (status) return `HTTP ${status}`;
  return message || 'Request failed';
};

/**
 * Extracts the transport-level failure detail from a rejected `/api-call`
 * request. The management proxy returns `{"error": "request failed", "detail":
 * "<underlying transport error>"}` when the upstream request never completed
 * (DNS, TLS, refused connection, timeout); the ApiError thrown by the client
 * keeps that body on `details`. Returns '' when no detail is available.
 */
export const getApiErrorDetail = (err: unknown): string => {
  if (err === null || typeof err !== 'object') return '';
  const details = (err as { details?: unknown }).details;
  if (details === null || typeof details !== 'object') return '';
  const detail = (details as Record<string, unknown>).detail;
  return typeof detail === 'string' ? detail.trim() : '';
};

export const apiCallApi = {
  request: async (
    payload: ApiCallRequest,
    config?: AxiosRequestConfig
  ): Promise<ApiCallResult> => {
    const response = await apiClient.post<Record<string, unknown>>('/api-call', payload, config);
    const parsedStatus = Number(response?.status_code ?? response?.statusCode);
    // Callers gate on `statusCode < 200 || statusCode >= 300`; a non-numeric or
    // absent status must fall back to 0 (an error per those guards) rather than
    // NaN, which would slip through both comparisons as a false success.
    const statusCode = Number.isFinite(parsedStatus) ? parsedStatus : 0;
    const header = normalizeHeaderMap(response?.header ?? response?.headers);
    const { bodyText, body } = normalizeBody(response?.body);

    return {
      statusCode,
      header,
      bodyText,
      body
    };
  }
};
