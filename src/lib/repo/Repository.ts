import type { Course, MatchReport, Meta, Professor, ProfessorDetail, ProfessorSummary, RankingsPayload, School, SchoolId, Section, Subject } from '@/lib/domain/types';

export interface Repository {
  getSchools(): Promise<School[]>;
  getSchool(schoolId: string): Promise<School | null>;
  getSubjects(schoolId: SchoolId): Promise<Subject[]>;
  getCourses(schoolId: SchoolId, subject?: string): Promise<Course[]>;
  getRankingsPayload(schoolId: SchoolId, subject: string): Promise<RankingsPayload | null>;
  getProfessorBySlug(schoolId: SchoolId, slug: string): Promise<ProfessorDetail | null>;
  getProfessors(schoolId: SchoolId): Promise<Professor[]>;
  getSections(schoolId: SchoolId, subject: string): Promise<Section[]>;
  getSummary(professorId: string): Promise<ProfessorSummary | null>;
  getMatchReport(schoolId: SchoolId): Promise<MatchReport>;
  getMeta(schoolId: SchoolId): Promise<Meta>;
}
// src/lib/repo/JsonRepository.ts implements Repository over data/processed/<school>/*.json using fs.readFile
// relative to process.cwd(), with a module-level Map cache keyed by path. src/lib/repo/index.ts exports
// getRepository(): Repository (singleton). next.config.ts sets outputFileTracingIncludes for 'data/processed/**'.
