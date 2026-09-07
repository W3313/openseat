// GET /api/schools/[school]/sections?subject=CS — this term's sections for a subject (SPEC 4). Used by
// CompareTable and the schedule-fit presets. `subject` is required, upper-cased, /^[A-Z]{2,5}$/.
import type { SectionsResponse } from '@/lib/api/types';
import { parseQuery, SectionsQuerySchema } from '@/lib/api/query';
import { badRequest, jsonResponse, notFound } from '@/lib/api/respond';
import { resolveSchool, withApiErrors, type RouteContext, type SchoolParams } from '@/lib/api/handlers';

export async function GET(req: Request, ctx: RouteContext<SchoolParams>): Promise<Response> {
  return withApiErrors(req, async () => {
    const query = parseQuery(SectionsQuerySchema, req);
    if (!query.ok) return badRequest(query.message);
    const { school } = await ctx.params;
    const resolved = await resolveSchool(school);
    if (!resolved.ok) return resolved.response;
    const { repo, schoolId } = resolved;

    const subjects = await repo.getSubjects(schoolId);
    if (!subjects.some((s) => s.code === query.data.subject)) {
      return notFound(`Unknown subject "${query.data.subject}" for ${schoolId}`);
    }
    const [sections, meta] = await Promise.all([repo.getSections(schoolId, query.data.subject), repo.getMeta(schoolId)]);
    const body: SectionsResponse = { term: meta.scheduleTerm, seatsFetchedAt: meta.seatsFetchedAt, sections };
    return jsonResponse(body);
  });
}
