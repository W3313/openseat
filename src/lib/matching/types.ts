// Shared matcher types (SPEC 7.4). Re-exported from ./index.ts — the public contract lives there.
import type { MatchMethod, SchoolId } from '@/lib/domain/types';

export type MatchSource = 'grades' | 'schedule';

export interface MatchCandidate {
  professorId: string;
  score: number;
  method: MatchMethod;
}

/** SPEC 7.4: `{ professorId: string | null; method; score; candidates: top ≤ 3 }`. */
export interface Resolution {
  professorId: string | null;
  method: MatchMethod;
  score: number;
  candidates: MatchCandidate[];
}

/**
 * Where a string came from and how far the scoped search may widen (SPEC 7.4 step 2).
 * Grade strings: subject (0.75) → school (0.85). Schedule strings: course (0.75) → subject (0.75) → school (0.85).
 */
export interface MatchScope {
  schoolId: SchoolId;
  source: MatchSource;
  /** Subject of the grade row / section, e.g. "CS". */
  subject: string;
  /** Schedule strings only: the section's courseId plus any crossListedCourseIds. */
  courseIds?: readonly string[];
  /** T0 alias overrides: exact raw string → professorId (data/overrides/<school>-instructor-aliases.json). */
  aliases?: Readonly<Record<string, string>>;
}

export interface ScoreResult {
  score: number;
  method: MatchMethod;
}
