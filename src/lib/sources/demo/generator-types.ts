// Internal model shared by the generator-*.ts helpers (SPEC 6.5). Nothing here is served; the public
// surface is generateDemoSeed() in generator.ts.
import type { GradeBuckets, TermCode, VibeTag } from '@/lib/domain/types';
import type { RawGradeRow, RawProfessor, RawReview, RawSection } from '@/lib/sources/types';
import type { EdgeCaseRecord } from './edgeCases';

/** One entry of data/config/uiuc/course-priors.json (impersonal, course-level). */
export interface CoursePrior {
  courseId: string;
  subject: string;
  number: string;
  title: string;
  gpaMean: number;
  graded: number;
  bucketShares: GradeBuckets;      // fractions, incl. w
  typicalRowSize: number;
  wRate: number;
  gpaByYear: { year: number; gpa: number }[];
}

export type LetterKey = keyof Omit<GradeBuckets, 'w'>;

/** CSV column order for the 13 letter buckets (A+ … F). */
export const LETTER_KEYS: readonly LetterKey[] = [
  'aPlus', 'a', 'aMinus', 'bPlus', 'b', 'bMinus', 'cPlus', 'c', 'cMinus', 'dPlus', 'd', 'dMinus', 'f',
];
export const LETTER_LABELS: Readonly<Record<LetterKey, string>> = {
  aPlus: 'A+', a: 'A', aMinus: 'A-', bPlus: 'B+', b: 'B', bMinus: 'B-', cPlus: 'C+', c: 'C', cMinus: 'C-',
  dPlus: 'D+', d: 'D', dMinus: 'D-', f: 'F',
};

/** Exact 23-column header of the upstream CSV (SOURCE_FACTS 1). */
export const GPA_CSV_HEADER: readonly string[] = [
  'Year', 'Term', 'YearTerm', 'Subject', 'Number', 'Course Title', 'Sched Type',
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'W', 'Students', 'Primary Instructor',
];

/** How a professor's grade-row / schedule strings are written; forced for edge cases, random otherwise. */
export type NameForm = 'full' | 'initial' | 'nickname' | 'hyphen' | 'stripped' | 'suffix';

export interface DemoProfessor {
  /** "demo-p-007" for reviewed professors, "demo-g-002" for grades-only extras (never emitted). */
  sourceId: string;
  index: number;
  firstName: string;
  lastName: string;
  subject: string;
  department: string;
  /** false → edge (g): grade rows only, no RawProfessor / reviews emitted. */
  reviewed: boolean;
  /** false → edge (h): reviews and sections but no grade rows. */
  hasGrades: boolean;
  /** When set, every grade-row and schedule string uses this form (edge (b): 'initial'). */
  forcedGradeForm: NameForm | null;
  /** When set, the professor's FIRST grade row uses this form (edges (c) hyphen, (d) stripped, (e) nickname, (f) suffix). */
  firstRowForm: NameForm | null;
  quality: number;
  leniency: number;
  difficulty: number;
  styleTags: VibeTag[];
  courses: CoursePrior[];
  activeYears: { start: number; end: number };
  /** Reviews to generate; null → draw per SPEC. */
  reviewCountOverride: number | null;
  /** Section plan override: edge (h) gets an open section, (l) participants may be forced closed. */
  forcedSectionStatus: 'open' | null;
}

export interface SeedOptions {
  seed: number;
  currentTerm: TermCode;
  subjects: readonly string[];
  priors: readonly CoursePrior[];
  /** 12-hex keys from data/config/uiuc/real-instructor-keys.json. */
  realInstructorKeys: ReadonlySet<string>;
  /** lettersOnlyKey'd surnames from data/config/uiuc/blocked-surnames.json. */
  blockedSurnames: ReadonlySet<string>;
  departments: Readonly<Record<string, readonly string[]>>;
}

export interface SeedMeta {
  seed: number;
  currentTerm: TermCode;
  subjects: string[];
  fetchedAt: string;
  courseCount: number;
  professorCount: number;
  reviewedProfessorCount: number;
  gradesOnlyCount: number;
  gradeRowCount: number;
  reviewCount: number;
  sectionCount: number;
  openSectionCount: number;
  edgeCases: EdgeCaseRecord[];
}

export interface SeedResult {
  gradeRows: RawGradeRow[];
  sections: RawSection[];
  professors: RawProfessor[];
  reviews: RawReview[];
  meta: SeedMeta;
}

/** Locale-independent string order (localeCompare depends on ICU/locale and would break byte determinism). */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Fixed snapshot stamp so the demo is byte-deterministic (SPEC 6.5). */
export const VIBE_TAG_LIST: readonly VibeTag[] = [
  'clear-lectures', 'engaging', 'caring', 'fair-grading', 'curves-generously', 'great-notes',
  'heavy-homework', 'hard-exams', 'fast-paced', 'disorganized', 'strict-attendance', 'must-read-textbook',
];

export const DEMO_FETCHED_AT = '2026-09-03T14:12:00Z';
export const PROFESSORS_PER_SUBJECT = 15;
export const COURSES_PER_SUBJECT = 20;
