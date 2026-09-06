// Decision logic behind GET /api/schools/[school]/professors/[slug]/summary (SPEC 4, 9.7). Kept out of the
// route file because Next only allows HTTP-method exports there. Cached entry with a matching inputHash →
// `cached: true`; otherwise the deterministic extractive summary is computed at request time (never
// persisted). A model is called from here only when SUMMARY_ON_DEMAND=1 and a key is configured.
import type { ProfessorDetail, ProfessorSummary } from '@/lib/domain/types';
import { MIN_REVIEWS_RANKED } from '@/lib/domain/constants';
import { env } from '@/lib/config/env';
import { extractiveSummary, getCachedSummary, getOrCreateSummary, isCacheHit, resolveSummaryProvider, selectReviews } from '@/lib/ai';
import type { Repository } from '@/lib/repo';
import type { SummaryResponse } from './types';

export async function buildSummaryResponse(detail: ProfessorDetail, repo: Pick<Repository, 'getSummary'>): Promise<SummaryResponse> {
  if (detail.scores.reviewCount < MIN_REVIEWS_RANKED) return { summary: null, cached: false, reason: 'too_few_reviews' };
  const selected = selectReviews(detail.reviews);
  const cached: ProfessorSummary | null =
    detail.summary ?? (await repo.getSummary(detail.professor.id)) ?? (await getCachedSummary(detail.professor.id));
  if (isCacheHit(detail, selected, cached)) return { summary: cached, cached: true };
  if (env.SUMMARY_ON_DEMAND && resolveSummaryProvider() !== 'extractive') {
    const generated = await getOrCreateSummary(detail, { allowClaude: true, force: true });
    if (generated) return { summary: generated, cached: false };
  }
  return { summary: extractiveSummary(detail, selected), cached: false };
}
