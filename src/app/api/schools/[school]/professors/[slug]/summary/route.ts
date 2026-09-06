// GET /api/schools/[school]/professors/[slug]/summary (SPEC 4, 9.7). Cached ProfessorSummary when the
// inputHash still matches (`cached: true`), else the request-time extractive summary (`cached: false`).
// NEVER calls Claude. reviewCount < 3 → { summary: null, cached: false, reason: 'too_few_reviews' }.
import { SlugSchema } from '@/lib/api/query';
import { jsonResponse, notFound } from '@/lib/api/respond';
import { buildSummaryResponse } from '@/lib/api/summary';
import { resolveSchool, withApiErrors, type RouteContext, type SlugParams } from '@/lib/api/handlers';

export async function GET(_req: Request, ctx: RouteContext<SlugParams>): Promise<Response> {
  return withApiErrors(async () => {
    const params = await ctx.params;
    const resolved = await resolveSchool(params.school);
    if (!resolved.ok) return resolved.response;

    const slug = SlugSchema.safeParse(params.slug);
    if (!slug.success) return notFound(`Unknown professor "${params.slug}"`);
    const detail = await resolved.repo.getProfessorBySlug(resolved.schoolId, slug.data);
    if (!detail) return notFound(`Unknown professor "${slug.data}" for ${resolved.schoolId}`);
    return jsonResponse(await buildSummaryResponse(detail, resolved.repo));
  });
}
