// GET /api/schools/[school]/rankings?subject=CS&sort=rating&open=1&course=225 (SPEC 4). Loads the
// precomputed per-subject payload and applies the same pure applyRankingsQuery() the page uses.
import type { RankingsResponse } from '@/lib/domain/types';
import { parseQuery, RankingsQuerySchema, toRankingsQuery } from '@/lib/api/query';
import { badRequest, jsonResponse, notFound } from '@/lib/api/respond';
import { resolveSchool, withApiErrors, type RouteContext, type SchoolParams } from '@/lib/api/handlers';
import { applyRankingsQuery } from '@/lib/scoring/rank';

export async function GET(req: Request, ctx: RouteContext<SchoolParams>): Promise<Response> {
  return withApiErrors(async () => {
    const query = parseQuery(RankingsQuerySchema, req);
    if (!query.ok) return badRequest(query.message);
    const { school } = await ctx.params;
    const resolved = await resolveSchool(school);
    if (!resolved.ok) return resolved.response;

    const payload = await resolved.repo.getRankingsPayload(resolved.schoolId, query.data.subject);
    if (!payload) return notFound(`Unknown subject "${query.data.subject}" for ${resolved.schoolId}`);
    const body: RankingsResponse = applyRankingsQuery(payload, toRankingsQuery(query.data));
    return jsonResponse(body);
  });
}
