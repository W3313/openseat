// Canonical tuning constants (SPEC section 5.2). Every formula in sections 7–9 reads from here;
// /about#scoring prints them. Change a value here and the whole pipeline follows.
import type { GradeBuckets } from './types';

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
export const GPA_POINTS: Record<keyof Omit<GradeBuckets, 'w'>, number> = {
  aPlus: 4.0, a: 4.0, aMinus: 3.67, bPlus: 3.33, b: 3.0, bMinus: 2.67, cPlus: 2.33, c: 2.0, cMinus: 1.67, dPlus: 1.33, d: 1.0, dMinus: 0.67, f: 0,
};
export const MATCH_ACCEPT = 0.75; export const MATCH_ACCEPT_SCHOOL_WIDE = 0.85; export const MATCH_MARGIN = 0.10;
export const INSTRUCTOR_BLOCKLIST: ReadonlySet<string> = new Set(['', 'staff', 'tba', 'tbd', 'instructor', 'unknown']);
export const PROMPT_VERSION = 1;

/** Letter-grade bucket keys in display order (A+ … F), excluding W. */
export const LETTER_BUCKET_KEYS: readonly (keyof Omit<GradeBuckets, 'w'>)[] = [
  'aPlus', 'a', 'aMinus', 'bPlus', 'b', 'bMinus', 'cPlus', 'c', 'cMinus', 'dPlus', 'd', 'dMinus', 'f',
];
/** All bucket keys in display order, W last (matches the CSV column order A+ … F, W). */
export const BUCKET_KEYS: readonly (keyof GradeBuckets)[] = [...LETTER_BUCKET_KEYS, 'w'];
