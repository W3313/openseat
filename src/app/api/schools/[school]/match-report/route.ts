// GET /api/schools/[school]/match-report?method=initial — join audit for /about#matching (SPEC 4, F21).
// `method` optionally filters `entries`; `coverage` always describes the whole report.
import type { MatchReport } from '@/lib/domain/types';
import { MatchReportQuerySchema, parseQuery } from '@/lib/api/query';
import { badRequest, jsonResponse } from '@/lib/api/respond';
import { resolveSchool, withApiErrors, type RouteContext, type SchoolParams } from '@/lib/api/handlers';

export async function GET(req: Request, ctx: RouteContext<SchoolParams>): Promise<Response> {
  return withApiErrors(async () => {
    const query = parseQuery(MatchReportQuerySchema, req);
    if (!query.ok) return badRequest(query.message);
    const { school } = await ctx.params;
    const resolved = await resolveSchool(school);
    if (!resolved.ok) return resolved.response;

    const report = await resolved.repo.getMatchReport(resolved.schoolId);
    const method = query.data.method;
    const body: MatchReport = method ? { ...report, entries: report.entries.filter((e) => e.method === method) } : report;
    return jsonResponse(body);
  });
}
