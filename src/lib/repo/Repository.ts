import type {
  Course, GradeRow, MatchReport, Meta, Professor, ProfessorDetail, ProfessorSummary, RankingsPayload, School, SchoolId, Section, Subject,
} from '@/lib/domain/types';

/**
 * Read side of data/processed/<school>/ (MULTI_SCHOOL_DESIGN §3). Per-subject files (grades/<SUBJECT>.json,
 * rankings/<SUBJECT>.json, professors-detail/<SUBJECT>.json) are loaded lazily and cached.
 */
export interface Repository {
  /** Enabled schools (SCHOOLS allowlist) that have a processed dataset, in registry order. */
  getSchools(): Promise<School[]>;
  getSchool(schoolId: string): Promise<School | null>;
  getSubjects(schoolId: SchoolId): Promise<Subject[]>;
  getCourses(schoolId: SchoolId, subject?: string): Promise<Course[]>;
  /** grades/<SUBJECT>.json — every GradeRow of the subject (headline + TA, suppressed + not); [] when absent. */
  getGradeRows(schoolId: SchoolId, subject: string): Promise<GradeRow[]>;
  getRankingsPayload(schoolId: SchoolId, subject: string): Promise<RankingsPayload | null>;
  /** Looks the slug up in professors.json, then reads professors-detail/<SUBJECT>.json for one of the professor's subjects. */
  getProfessorBySlug(schoolId: SchoolId, slug: string): Promise<ProfessorDetail | null>;
  getProfessors(schoolId: SchoolId): Promise<Professor[]>;
  getSections(schoolId: SchoolId, subject: string): Promise<Section[]>;
  getSummary(professorId: string): Promise<ProfessorSummary | null>;
  getMatchReport(schoolId: SchoolId): Promise<MatchReport>;
  getMeta(schoolId: SchoolId): Promise<Meta>;
}
// src/lib/repo/JsonRepository.ts implements Repository over data/processed/<school>/ using fs.readFile
// relative to process.cwd(), with a module-level Map cache keyed by path. src/lib/repo/index.ts exports
// getRepository(): Repository (singleton). next.config.ts sets outputFileTracingIncludes for 'data/processed/**'.
