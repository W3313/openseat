// GET /api/schools/[school]/subjects — subjects with ≥ 1 professor, for the combobox (SPEC 4).
import type { SubjectsResponse } from '@/lib/api/types';
import { jsonResponse } from '@/lib/api/respond';
import { resolveSchool, withApiErrors, type RouteContext, type SchoolParams } from '@/lib/api/handlers';

export async function GET(_req: Request, ctx: RouteContext<SchoolParams>): Promise<Response> {
  return withApiErrors(async () => {
    const { school } = await ctx.params;
    const resolved = await resolveSchool(school);
    if (!resolved.ok) return resolved.response;
    const subjects = (await resolved.repo.getSubjects(resolved.schoolId)).filter((s) => s.professorCount >= 1);
    const body: SubjectsResponse = { subjects };
    return jsonResponse(body);
  });
}
