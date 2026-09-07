// Shared plumbing for the GET route handlers (SPEC 4): Next 16 context shape, school resolution (404),
// per-IP rate limiting (429) and a wrapper that turns thrown errors into the `{ error: { code, message } }`
// shape without leaking stack traces. Every handler is `GET(req, ctx)` → `withApiErrors(req, async () => Response)`.
import type { School, SchoolId } from '@/lib/domain/types';
import { toSchoolId } from '@/lib/config/schools';
import { getRepository, RepositoryNotFoundError, type Repository } from '@/lib/repo';
import { checkRateLimit, clientKey, READ_RATE_LIMIT, type RateLimitPolicy } from './rateLimit';
import { internalError, notFound, tooManyRequests } from './respond';

/** Next 16 route-handler context: params is a Promise. */
export interface RouteContext<P extends Record<string, string> = Record<string, string>> {
  params: Promise<P>;
}

export type SchoolParams = { school: string };
export type SlugParams = SchoolParams & { slug: string };
export type CourseParams = SchoolParams & { subject: string; number: string };

export type ResolvedSchool = { ok: true; schoolId: SchoolId; school: School; repo: Repository } | { ok: false; response: Response };

/**
 * Lower-cases and validates the `[school]` segment and loads the School record; unknown → 404 Response.
 * The raw segment is never echoed: only the registry-validated id may appear in a message.
 */
export async function resolveSchool(rawSchool: string | undefined, repo: Repository = getRepository()): Promise<ResolvedSchool> {
  const schoolId = toSchoolId(rawSchool);
  if (!schoolId) return { ok: false, response: notFound('Unknown school') };
  const school = await repo.getSchool(schoolId);
  if (!school) return { ok: false, response: notFound(`No data for school "${schoolId}"`) };
  return { ok: true, schoolId, school, repo };
}

/** Hook for tests / observability; defaults to console.error. */
export type ApiErrorLogger = (error: unknown) => void;
let logger: ApiErrorLogger = (error) => console.error('[api]', error);
export function setApiErrorLogger(next: ApiErrorLogger | null): void {
  logger = next ?? ((error) => console.error('[api]', error));
}

export interface ApiHandlerOptions {
  /** Per-IP policy for this route (default READ_RATE_LIMIT); `null` disables limiting for the route. */
  rateLimit?: RateLimitPolicy | null;
  /** Bucket name so routes with different policies do not share a window (default 'api'). */
  bucket?: string;
}

/**
 * Applies the per-IP limiter, then runs a handler body and maps failures: a missing processed dataset →
 * 404, anything else → 500 with a generic message (never the stack). Successful bodies return their own
 * Response untouched.
 */
export async function withApiErrors(req: Request, body: () => Promise<Response>, options: ApiHandlerOptions = {}): Promise<Response> {
  const policy = options.rateLimit === undefined ? READ_RATE_LIMIT : options.rateLimit;
  if (policy) {
    const verdict = checkRateLimit(`${options.bucket ?? 'api'}:${clientKey(req)}`, policy);
    if (!verdict.allowed) return tooManyRequests(verdict.retryAfterSec, verdict.limit);
  }
  try {
    return await body();
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) return notFound('Processed data not found for this school');
    logger(error);
    return internalError();
  }
}
