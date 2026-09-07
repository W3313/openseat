// GET /api/schools/[school]/professors/[slug]/summary (SPEC 4, 9.7). Cached ProfessorSummary when the
// inputHash still matches (`cached: true`), else the request-time extractive summary (`cached: false`).
// A model is called only when SUMMARY_ON_DEMAND=1 AND the request carries SUMMARY_ON_DEMAND_TOKEN in
// `x-profpeek-key` AND the per-instance budget allows it (src/lib/api/summary.ts); anonymous requests never
// reach a provider. reviewCount < 3 → { summary: null, cached: false, reason: 'too_few_reviews' }.
import { SlugSchema } from '@/lib/api/query';
import { jsonResponse, notFound } from '@/lib/api/respond';
import { SUMMARY_RATE_LIMIT } from '@/lib/api/rateLimit';
import { buildSummaryResponse, isOnDemandAuthorized } from '@/lib/api/summary';
import { resolveSchool, withApiErrors, type RouteContext, type SlugParams } from '@/lib/api/handlers';

/** Hard ceiling on function time: the on-demand provider call is capped at 8 s inside buildSummaryResponse. */
export const maxDuration = 10;

export async function GET(req: Request, ctx: RouteContext<SlugParams>): Promise<Response> {
  return withApiErrors(req, async () => {
    const params = await ctx.params;
    const resolved = await resolveSchool(params.school);
    if (!resolved.ok) return resolved.response;

    const slug = SlugSchema.safeParse(params.slug);
    if (!slug.success) return notFound('Unknown professor'); // the raw segment is never echoed
    const detail = await resolved.repo.getProfessorBySlug(resolved.schoolId, slug.data);
    if (!detail) return notFound(`Unknown professor "${slug.data}" for ${resolved.schoolId}`);
    const body = await buildSummaryResponse(detail, resolved.repo, { onDemandAuthorized: isOnDemandAuthorized(req) });
    // A freshly generated (uncached) answer must not be pinned in the CDN for a day; the extractive/cached ones may.
    return jsonResponse(body, body.cached || body.summary?.source === 'extractive' || body.summary === null ? {} : { cacheControl: null });
  }, { rateLimit: SUMMARY_RATE_LIMIT, bucket: 'summary' });
}
