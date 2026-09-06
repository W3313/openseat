// GET /api/schools — schools for the landing select (SPEC 4).
import type { SchoolsResponse } from '@/lib/api/types';
import { jsonResponse } from '@/lib/api/respond';
import { withApiErrors } from '@/lib/api/handlers';
import { getRepository } from '@/lib/repo';

export async function GET(): Promise<Response> {
  return withApiErrors(async () => {
    const schools = await getRepository().getSchools();
    const body: SchoolsResponse = { schools };
    return jsonResponse(body);
  });
}
