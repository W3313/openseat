// GET /api/schools/[school]/courses/[subject]/[number]?sort=&open= — course view payload (SPEC 4, F20).
// Same RankingsResponse as /rankings, restricted to one course, with scope { kind: 'course', courseId }.
// Malformed or unknown path segments → 404 (they are identifiers, not query params).
import type { RankingsResponse } from '@/lib/domain/types';
import { CourseNumberSchema, CourseRankingsQuerySchema, parseQuery, SubjectCodeSchema, toRankingsQuery } from '@/lib/api/query';
import { badRequest, jsonResponse, notFound } from '@/lib/api/respond';
import { resolveSchool, withApiErrors, type CourseParams, type RouteContext } from '@/lib/api/handlers';
import { applyRankingsQuery } from '@/lib/scoring/rank';

export async function GET(req: Request, ctx: RouteContext<CourseParams>): Promise<Response> {
  return withApiErrors(req, async () => {
    const query = parseQuery(CourseRankingsQuerySchema, req);
    if (!query.ok) return badRequest(query.message);
    const params = await ctx.params;
    const resolved = await resolveSchool(params.school);
    if (!resolved.ok) return resolved.response;

    const subject = SubjectCodeSchema.safeParse(params.subject);
    const number = CourseNumberSchema.safeParse(params.number);
    if (!subject.success || !number.success) return notFound('Unknown course'); // raw segments are never echoed

    const payload = await resolved.repo.getRankingsPayload(resolved.schoolId, subject.data);
    if (!payload) return notFound(`Unknown subject "${subject.data}" for ${resolved.schoolId}`);
    const course = payload.courses.find((c) => c.number === number.data);
    if (!course) return notFound(`Unknown course "${subject.data} ${number.data}" for ${resolved.schoolId}`);

    const response = applyRankingsQuery(payload, toRankingsQuery({ ...query.data, course: number.data }));
    const body: RankingsResponse = { ...response, scope: { kind: 'course', courseId: course.courseId } };
    return jsonResponse(body);
  });
}
