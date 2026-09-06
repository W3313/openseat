// Response shapes of the GET routes (SPEC 4). Pages fetch the same Repository directly; these types
// exist so route handlers, CompareTable/ShortlistDrawer fetches and the README curl examples agree.
import type {
  DataMode, MetaCounts, ProfessorSummary, School, Section, Subject, TermCode,
} from '@/lib/domain/types';

export type { ApiErrorBody } from './respond';

/** GET /api/health */
export interface HealthResponse {
  ok: true;
  mode: DataMode;
  builtAt: string;
  datasetHash: string;
  currentTerm: TermCode;
  seatsFetchedAt: string;
  counts: MetaCounts;
  aiSummaries: { claude: number; openaiCompatible: number; extractive: number };
}

/** GET /api/schools */
export interface SchoolsResponse {
  schools: School[];
}

/** GET /api/schools/[school]/subjects — only subjects with ≥ 1 professor. */
export interface SubjectsResponse {
  subjects: Subject[];
}

/** GET /api/schools/[school]/sections?subject=CS */
export interface SectionsResponse {
  term: TermCode;
  seatsFetchedAt: string;
  sections: Section[];
}

/** GET /api/schools/[school]/professors/[slug]/summary */
export interface SummaryResponse {
  summary: ProfessorSummary | null;
  cached: boolean;
  reason?: 'too_few_reviews';
}
