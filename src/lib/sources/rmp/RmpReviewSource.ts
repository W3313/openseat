// ReviewSource for the unofficial RateMyProfessors GraphQL endpoint (SPEC 6.2, SOURCE_FACTS 3).
// Constructed by the registry only when RMP_ENABLED=1 AND DATA_MODE=live. Every public method is
// fail-soft: any network, schema or auth problem logs and returns [] — ingestion never crashes on RMP.
// Nothing fetched here is ever committed; the user is responsible for ToS compliance.
import type { SchoolId } from '@/lib/domain/types';
import type { RawProfessor, RawReview, ReviewSource, SourceInfo } from '@/lib/sources/types';
import { type DepartmentMap, departmentsFor, loadDepartments } from '@/lib/sources/uiuc/departments';
import {
  RMP_GRAPHQL_ENDPOINT,
  SCHOOL_SEARCH_QUERY,
  SchoolSearchResponseSchema,
  TEACHER_RATINGS_QUERY,
  TEACHER_SEARCH_QUERY,
  TeacherRatingsResponseSchema,
  TeacherSearchResponseSchema,
  type TeacherNode,
  normalizeCourseLabel,
  normalizeGrade,
  normalizeRmpDate,
  splitRatingTags,
  wouldTakeAgainFlag,
} from './queries';

export const RMP_SOURCE_INFO: SourceInfo = {
  id: 'rmp-graphql',
  label: 'RateMyProfessors (unofficial)',
  url: 'https://www.ratemyprofessors.com',
  license: null,
};

/** Search text used to look up the school id when RMP_SCHOOL_ID is unset. */
export const SCHOOL_SEARCH_TEXT: Record<SchoolId, string> = {
  uiuc: 'University of Illinois at Urbana-Champaign',
};

export interface RmpReviewSourceOptions {
  schoolId?: string;                 // env RMP_SCHOOL_ID (skips the lookup)
  authHeader: string;                // env RMP_AUTH_HEADER (required; no default token is shipped)
  endpoint?: string;
  departments?: DepartmentMap;       // default: data/config/{school}/departments.json
  ratingsPerTeacher?: number;        // default 100
  pageSize?: number;                 // teacher search page size, default 50
  maxTeachersPerQuery?: number;      // default 500
  timeoutMs?: number;                // default 15000
  fetchImpl?: typeof fetch;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export class RmpReviewSource implements ReviewSource {
  readonly info = RMP_SOURCE_INFO;
  private readonly endpoint: string;
  private readonly authHeader: string;
  private readonly configuredSchoolId: string | null;
  private readonly departments: DepartmentMap | null;
  private readonly ratingsPerTeacher: number;
  private readonly pageSize: number;
  private readonly maxTeachers: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly log: NonNullable<RmpReviewSourceOptions['log']>;
  private resolvedSchoolId: string | null = null;

  constructor(opts: RmpReviewSourceOptions) {
    if (!opts.authHeader) throw new Error('RmpReviewSource requires authHeader (env RMP_AUTH_HEADER)');
    this.endpoint = opts.endpoint ?? RMP_GRAPHQL_ENDPOINT;
    this.authHeader = opts.authHeader;
    this.configuredSchoolId = opts.schoolId ?? null;
    this.departments = opts.departments ?? null;
    this.ratingsPerTeacher = opts.ratingsPerTeacher ?? 100;
    this.pageSize = opts.pageSize ?? 50;
    this.maxTeachers = opts.maxTeachersPerQuery ?? 500;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  async fetchProfessors(opts: { schoolId: SchoolId; subjects: string[] }): Promise<RawProfessor[]> {
    try {
      const schoolId = await this.resolveSchoolId(opts.schoolId);
      if (!schoolId) return [];
      const map = this.departments ?? loadDepartments(opts.schoolId);
      const wanted = departmentsFor(map, opts.subjects);
      if (wanted.length === 0) {
        this.log.warn(`[rmp] no department names configured for subjects ${opts.subjects.join(',')}`);
        return [];
      }
      const wantedLower = new Set(wanted.map((d) => d.toLowerCase()));
      const seen = new Map<string, RawProfessor>();
      for (const department of wanted) {
        const teachers = await this.searchTeachers(department, schoolId);
        for (const t of teachers) {
          if (seen.has(t.id)) continue;
          const dept = t.department?.trim() || null;
          if (dept && !wantedLower.has(dept.toLowerCase())) continue;   // name-text search is fuzzy; keep our departments only
          const firstName = (t.firstName ?? '').trim();
          const lastName = (t.lastName ?? '').trim();
          if (lastName === '') continue;
          seen.set(t.id, { sourceId: t.id, firstName, lastName, department: dept, isFictional: false });
        }
      }
      this.log.info(`[rmp] ${seen.size} professors across ${wanted.length} departments`);
      return [...seen.values()];
    } catch (err) {
      this.log.warn(`[rmp] fetchProfessors failed (returning []): ${describe(err)}`);
      return [];
    }
  }

  async fetchReviews(professorSourceId: string): Promise<RawReview[]> {
    try {
      const json = await this.graphql(TEACHER_RATINGS_QUERY, { id: professorSourceId, count: this.ratingsPerTeacher });
      const parsed = TeacherRatingsResponseSchema.safeParse(json);
      if (!parsed.success) {
        this.log.warn(`[rmp] ratings response for ${professorSourceId} failed validation (returning [])`);
        return [];
      }
      const edges = parsed.data.data.node?.ratings?.edges ?? [];
      const out: RawReview[] = [];
      for (const { node } of edges) {
        if (node.clarityRating === null || node.clarityRating === undefined) continue;
        out.push({
          sourceId: node.id,
          professorSourceId,
          courseLabel: normalizeCourseLabel(node.class),
          date: normalizeRmpDate(node.date),
          quality: node.clarityRating,
          difficulty: node.difficultyRating ?? null,
          wouldTakeAgain: wouldTakeAgainFlag(node.wouldTakeAgain),
          gradeReceived: normalizeGrade(node.grade),
          text: (node.comment ?? '').trim(),
          sourceTags: splitRatingTags(node.ratingTags),
          thumbsUp: node.thumbsUpTotal ?? 0,
          thumbsDown: node.thumbsDownTotal ?? 0,
        });
      }
      return out;
    } catch (err) {
      this.log.warn(`[rmp] fetchReviews(${professorSourceId}) failed (returning []): ${describe(err)}`);
      return [];
    }
  }

  // -------------------------------------------------------------------------------------- internals

  /** RMP_SCHOOL_ID if configured, else the first school search hit. Memoized. Null (logged) on failure. */
  async resolveSchoolId(schoolId: SchoolId): Promise<string | null> {
    if (this.configuredSchoolId) return this.configuredSchoolId;
    if (this.resolvedSchoolId) return this.resolvedSchoolId;
    const text = SCHOOL_SEARCH_TEXT[schoolId];
    const json = await this.graphql(SCHOOL_SEARCH_QUERY, { text });
    const parsed = SchoolSearchResponseSchema.safeParse(json);
    if (!parsed.success) {
      this.log.warn('[rmp] school search response failed validation; set RMP_SCHOOL_ID to skip the lookup');
      return null;
    }
    const nodes = parsed.data.data.newSearch.schools.edges.map((e) => e.node);
    const hit = nodes.find((n) => n.name.toLowerCase().includes('urbana')) ?? nodes[0];
    if (!hit) {
      this.log.warn(`[rmp] no school matched "${text}"; set RMP_SCHOOL_ID`);
      return null;
    }
    this.resolvedSchoolId = hit.id;
    this.log.info(`[rmp] school "${hit.name}" → ${hit.id}`);
    return hit.id;
  }

  private async searchTeachers(text: string, schoolID: string): Promise<TeacherNode[]> {
    const out: TeacherNode[] = [];
    let after: string | null = null;
    while (out.length < this.maxTeachers) {
      const json = await this.graphql(TEACHER_SEARCH_QUERY, { text, schoolID, first: this.pageSize, after });
      const parsed = TeacherSearchResponseSchema.safeParse(json);
      if (!parsed.success) {
        this.log.warn(`[rmp] teacher search "${text}" failed validation; stopping`);
        break;
      }
      const conn = parsed.data.data.newSearch.teachers;
      out.push(...conn.edges.map((e) => e.node));
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor || conn.edges.length === 0) break;
      after = conn.pageInfo.endCursor;
    }
    return out;
  }

  private async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: this.authHeader },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`RMP HTTP ${res.status}`);
    const json = (await res.json()) as { errors?: { message?: string }[] };
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      throw new Error(`RMP GraphQL error: ${json.errors.map((e) => e.message ?? 'unknown').join('; ')}`);
    }
    return json;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
