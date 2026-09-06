// JSON responses for the GET routes (SPEC 4): every success sets the shared Cache-Control header and
// errors use `{ error: { code, message } }` with 400 (bad query) or 404 (unknown school/subject/slug).

export const API_CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';

export type ApiErrorCode = 'bad_query' | 'not_found' | 'internal' | (string & {});

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
    ...init.headers,
  });
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function errorResponse(status: number, code: ApiErrorCode, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  // 4xx answers are as static as the data; 5xx must never be cached.
  return jsonResponse(body, { status, cacheControl: status >= 500 ? null : undefined });
}

/** 400 — a query param failed validation (SPEC 4). */
export function badRequest(message: string, code: ApiErrorCode = 'bad_query'): Response {
  return errorResponse(400, code, message);
}

/** 404 — unknown school / subject / professor. */
export function notFound(message: string, code: ApiErrorCode = 'not_found'): Response {
  return errorResponse(404, code, message);
}

/** 500 — never leaks a stack trace. */
export function internalError(message = 'Something went wrong'): Response {
  return errorResponse(500, 'internal', message);
}
