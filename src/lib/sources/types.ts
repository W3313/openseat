import type { GradeBuckets, Meeting, SchoolId, TermCode } from '@/lib/domain/types';

export interface RawGradeRow {
  year: number; term: string; yearTerm: string;      // 2025, "Fall", "2025-fa"
  subject: string; number: string; title: string; schedType: string;
  buckets: GradeBuckets; students: number; instructorRaw: string;   // instructorRaw may be ''
}
export interface RawSection {
  crn: string; subject: string; number: string; sectionCode: string;
  statusCode: string;                                // Course Explorer: 'A' | 'P' | 'X'; seat-aware sources (UH): 'open' | 'waitlist' | 'closed'
  seatsKnown: boolean;
  instructorsRaw: string[];                          // trimmed, deduped
  meetings: Meeting[];
}
export interface RawProfessor {
  sourceId: string; firstName: string; lastName: string; department: string | null;
  isFictional: boolean;
}
export interface RawReview {
  sourceId: string; professorSourceId: string; courseLabel: string | null;   // "CS225" | "CS 225" | null
  date: string; quality: number; difficulty: number | null; wouldTakeAgain: boolean | null;
  gradeReceived: string | null; text: string; sourceTags: string[]; thumbsUp: number; thumbsDown: number;
}
export interface SourceInfo { id: string; label: string; url: string | null; license: string | null; }

export interface GradeSource {
  info: SourceInfo;
  fetch(opts: { schoolId: SchoolId }): Promise<{ rows: RawGradeRow[]; fetchedAt: string }>;
}
export interface ScheduleSource {
  info: SourceInfo;
  /** Returns the term actually used (may differ from requested when the requested term is not yet published). */
  fetchSections(opts: { schoolId: SchoolId; term: TermCode; subject: string }): Promise<{ term: TermCode; fetchedAt: string; sections: RawSection[] }>;
}
export interface ReviewSource {
  info: SourceInfo;
  fetchProfessors(opts: { schoolId: SchoolId; subjects: string[] }): Promise<RawProfessor[]>;
  fetchReviews(professorSourceId: string): Promise<RawReview[]>;
}
export const MIN_REVIEWS_RANKED = 3;      // below → lowData group, no summary
export const MIN_GRADED_N = 10;           // row suppression and null thresholds
export const MIN_BASELINE_N = 10;         // leave-one-out baseline must have this many graded students
export const MIN_BADGE_N = 50;            // deltaComparableN / students needed for grade badges
export const SHRINK_K = 5;                // Bayesian shrinkage pseudo-count
export const PRIOR_FALLBACK = 3.7;        // when the subject has < 20 reviews
export const PRIOR_MIN_REVIEWS = 20;
export const COMPOSITE_WEIGHTS = { rating: 0.60, grades: 0.25, wouldTakeAgain: 0.15 } as const;
export const MAX_BADGES_SHOWN = 3;
export const POSITIVE_PREVIEW_STORED = 3; export const POSITIVE_PREVIEW_SHOWN = 2;
export const QUOTE_MAX_CHARS = 220;
export const CONFIDENCE_THRESHOLDS = { medium: 5, high: 15 } as const;   // reviewCount ≥
export const GPA_POINTS: Record<keyof Omit<GradeBuckets,'w'>, number> = {
  aPlus: 4.0, a: 4.0, aMinus: 3.67, bPlus: 3.33, b: 3.0, bMinus: 2.67, cPlus: 2.33, c: 2.0, cMinus: 1.67, dPlus: 1.33, d: 1.0, dMinus: 0.67, f: 0,
};
export const MATCH_ACCEPT = 0.75; export const MATCH_ACCEPT_SCHOOL_WIDE = 0.85; export const MATCH_MARGIN = 0.10;
export const INSTRUCTOR_BLOCKLIST: ReadonlySet<string> = new Set(['', 'staff', 'tba', 'tbd', 'instructor', 'unknown']);
export const PROMPT_VERSION = 1;
