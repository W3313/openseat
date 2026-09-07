// GET /api/health — liveness + provenance (SPEC 4). Reads meta.json of the default school; never touches
// an upstream source. Used by the footer, the README badge and the CI smoke test.
import type { HealthResponse } from '@/lib/api/types';
import { jsonResponse } from '@/lib/api/respond';
import { withApiErrors } from '@/lib/api/handlers';
import { DEFAULT_SCHOOL_ID } from '@/lib/config/schools';
import { getRepository } from '@/lib/repo';

export async function GET(req: Request): Promise<Response> {
  return withApiErrors(req, async () => {
    const meta = await getRepository().getMeta(DEFAULT_SCHOOL_ID);
    const body: HealthResponse = {
      ok: true,
      mode: meta.mode,
      builtAt: meta.builtAt,
      datasetHash: meta.datasetHash,
      currentTerm: meta.currentTerm,
      seatsFetchedAt: meta.seatsFetchedAt,
      counts: meta.counts,
      aiSummaries: { claude: meta.counts.summariesClaude, openaiCompatible: meta.counts.summariesOpenAiCompatible ?? 0, extractive: meta.counts.summariesExtractive },
    };
    return jsonResponse(body);
  });
}
