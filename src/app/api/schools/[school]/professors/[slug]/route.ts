// GET /api/schools/[school]/professors/[slug] — full ProfessorDetail for the detail and compare pages (SPEC 4).
import { SlugSchema } from '@/lib/api/query';
import { jsonResponse, notFound } from '@/lib/api/respond';
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
    return jsonResponse(detail);
  });
}
