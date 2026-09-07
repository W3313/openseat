// JSON responses for the GET routes (SPEC 4): every success sets the shared Cache-Control header and
// errors use `{ error: { code, message } }` with 400 (bad query), 404 (unknown school/subject/slug) or
// 429 (rate limited). Error messages never echo raw request input (only values that passed validation).

export const API_CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';
/** 4xx answers are cached briefly: long enough to absorb a burst, short enough that a bogus URL does not occupy the CDN for a day. */
export const API_ERROR_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';

export type ApiErrorCode = 'bad_query' | 'not_found' | 'rate_limited' | 'internal' | (string & {});

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

export interface JsonResponseInit {
  status?: number;
  headers?: Record<string, string>;
  /** Override Cache-Control (default API_CACHE_CONTROL). Pass `null` to send `no-store`. */
  cacheControl?: string | null;
}

export function jsonResponse<T>(body: T, init: JsonResponseInit = {}): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': init.cacheControl === null ? 'no-store' : (init.cacheControl ?? API_CACHE_CONTROL),
    // Also set globally by next.config.ts; repeated here so direct handler calls (tests) carry it too.
    'x-content-type-options': 'nosniff',
    ...init.headers,
  });
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function errorResponse(status: number, code: ApiErrorCode, message: string, headers?: Record<string, string>): Response {
  const body: ApiErrorBody = { error: { code, message } };
  // 4xx answers get a short public cache; 429 and 5xx must never be cached.
  const cacheControl = status >= 500 || status === 429 ? null : API_ERROR_CACHE_CONTROL;
  return jsonResponse(body, { status, cacheControl, headers });
}

/** 400 — a query param failed validation (SPEC 4). */
export function badRequest(message: string, code: ApiErrorCode = 'bad_query'): Response {
  return errorResponse(400, code, message);
}

/** 404 — unknown school / subject / professor. */
export function notFound(message: string, code: ApiErrorCode = 'not_found'): Response {
  return errorResponse(404, code, message);
}

/** 429 — the per-instance limiter tripped. */
export function tooManyRequests(retryAfterSec: number, limit: number): Response {
  return errorResponse(429, 'rate_limited', 'Too many requests', {
    'retry-after': String(Math.max(1, Math.ceil(retryAfterSec))),
    'x-ratelimit-limit': String(limit),
    'x-ratelimit-remaining': '0',
  });
}

/** 500 — never leaks a stack trace. */
export function internalError(message = 'Something went wrong'): Response {
  return errorResponse(500, 'internal', message);
}
