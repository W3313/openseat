// Decision logic behind GET /api/schools/[school]/professors/[slug]/summary (SPEC 4, 9.7). Kept out of the
// route file because Next only allows HTTP-method exports there. Cached entry with a matching inputHash →
// `cached: true`; otherwise the deterministic extractive summary is computed at request time (never
// persisted).
//
// Request-time model calls are triple-gated so an anonymous visitor can never spend the operator's quota:
//   1. SUMMARY_ON_DEMAND=1 and a provider key must be configured (default off);
//   2. the request must carry the shared secret SUMMARY_ON_DEMAND_TOKEN in `x-profpeek-key` (a warmer or
//      cron the operator runs — never the public UI, which does not fetch this route at all);
//   3. a per-instance budget (ON_DEMAND_BUDGET_*) caps generations per minute and per day; past it the
//      route serves the extractive summary and logs a warning.
// Concurrent requests for the same professor share one in-flight call, a successful generation is primed
// into the module-level summary cache, and the provider is invoked with zero 429 retries and a short
// timeout so a stuck upstream cannot pin a serverless function.
import { timingSafeEqual } from 'node:crypto';
import type { ProfessorDetail, ProfessorSummary, Review } from '@/lib/domain/types';
import { MIN_REVIEWS_RANKED } from '@/lib/domain/constants';
import { env } from '@/lib/config/env';
import {
  extractiveSummary, getCachedSummary, getOrCreateSummary, isCacheHit, primeSummaryCache, resolveSummaryProvider, selectReviews,
  selectedIds,
} from '@/lib/ai';
import type { Repository } from '@/lib/repo';
import { checkRateLimit, type RateLimitPolicy } from './rateLimit';
import type { SummaryResponse } from './types';

/** Header a trusted caller sends with SUMMARY_ON_DEMAND_TOKEN to authorise a model call. */
export const ON_DEMAND_HEADER = 'x-profpeek-key';
/** Provider timeout inside a request; the route's maxDuration is 10 s. */
export const ON_DEMAND_TIMEOUT_MS = 8_000;
/** Per-instance generation budget (falls through to the extractive summary when exhausted). */
export const ON_DEMAND_BUDGET_PER_MINUTE: RateLimitPolicy = { limit: 5, windowMs: 60_000 };
export const ON_DEMAND_BUDGET_PER_DAY: RateLimitPolicy = { limit: 100, windowMs: 86_400_000 };

export interface SummaryRequestContext {
  /** True only when the request carried a valid SUMMARY_ON_DEMAND_TOKEN (see isOnDemandAuthorized). */
  onDemandAuthorized?: boolean;
}

/** Constant-time comparison of the request's `x-profpeek-key` against SUMMARY_ON_DEMAND_TOKEN. */
export function isOnDemandAuthorized(req: Request, token: string | undefined = env.SUMMARY_ON_DEMAND_TOKEN): boolean {
  if (!token) return false;
  const presented = req.headers.get(ON_DEMAND_HEADER);
  if (!presented) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(token, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hook for tests / observability; defaults to console.warn. */
let warn: (message: string, detail?: Record<string, unknown>) => void = (message, detail) => console.warn(`[summary] ${message}`, detail ?? '');
export function setSummaryWarnLogger(next: typeof warn | null): void {
  warn = next ?? ((message, detail) => console.warn(`[summary] ${message}`, detail ?? ''));
}

const inflight = new Map<string, Promise<ProfessorSummary | null>>();

/** Tests: forget in-flight generations. */
export function resetOnDemandState(): void {
  inflight.clear();
}

function inflightKey(detail: ProfessorDetail, selected: readonly Review[]): string {
  return `${detail.professor.id}:${selectedIds(selected).join(',')}:${detail.scores.reviewCount}`;
}

/** Start one provider call for this input; concurrent callers join it through `inflight`. */
function startGeneration(key: string, detail: ProfessorDetail): Promise<ProfessorSummary | null> {
  const run = getOrCreateSummary(detail, { allowClaude: true, force: true, maxRateLimitRetries: 0, timeoutMs: ON_DEMAND_TIMEOUT_MS })
    .then((generated) => {
      // getOrCreateSummary falls back to extractive on any provider failure; only a model-written entry is worth memoising.
      if (generated && generated.source !== 'extractive') primeSummaryCache([generated]);
      return generated;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export async function buildSummaryResponse(
  detail: ProfessorDetail,
  repo: Pick<Repository, 'getSummary'>,
  context: SummaryRequestContext = {},
): Promise<SummaryResponse> {
  if (detail.scores.reviewCount < MIN_REVIEWS_RANKED) return { summary: null, cached: false, reason: 'too_few_reviews' };
  const selected = selectReviews(detail.reviews);
  const cached: ProfessorSummary | null =
    detail.summary ?? (await repo.getSummary(detail.professor.id)) ?? (await getCachedSummary(detail.professor.id));
  if (isCacheHit(detail, selected, cached)) return { summary: cached, cached: true };

  if (env.SUMMARY_ON_DEMAND && context.onDemandAuthorized === true && resolveSummaryProvider() !== 'extractive') {
    const key = inflightKey(detail, selected);
    let pending = inflight.get(key); // joining a call already in flight costs nothing, so it is not charged to the budget
    if (!pending) {
      const minute = checkRateLimit('on-demand:minute', ON_DEMAND_BUDGET_PER_MINUTE);
      const day = minute.allowed ? checkRateLimit('on-demand:day', ON_DEMAND_BUDGET_PER_DAY) : minute;
      if (minute.allowed && day.allowed) pending = startGeneration(key, detail);
      else warn('on-demand budget exhausted; serving extractive summary', { professorId: detail.professor.id, retryAfterSec: day.retryAfterSec });
    }
    if (pending) {
      const generated = await pending;
      if (generated) return { summary: generated, cached: false };
    }
  }
  return { summary: extractiveSummary(detail, selected), cached: false };
}
