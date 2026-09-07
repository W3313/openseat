// SPEC 8.11 badges. Evaluated in BADGE_ORDER; the first MAX_BADGES_SHOWN (3) that hold are shown.
// Badges only see aggregates, which already exclude suppressed rows.
// MULTI_SCHOOL_DESIGN §5: `tough-but-loved` and `hidden-gem` need reviews (never awarded when
// reviewsAvailable is false). §4.1: for percent-only professors (countsAreEstimates) the MIN_BADGE_N
// student gates become "≥ MIN_SECTIONS_N sections" because the counts are 100 × sections, not students.
import type { BadgeId, ProfessorScores } from '@/lib/domain/types';
import { MAX_BADGES_SHOWN, MIN_BADGE_N, MIN_SECTIONS_N } from '@/lib/domain/constants';

/** Evaluation order; the first MAX_BADGES_SHOWN (3) that hold are shown. */
export const BADGE_ORDER: readonly BadgeId[] = ['open-now', 'tough-but-loved', 'easy-a', 'hidden-gem', 'low-withdrawal'];

/** Thresholds printed on /about#scoring; every badge rule below reads from here. */
export const BADGE_THRESHOLDS = {
  toughDeltaMax: -0.15,
  toughRatingMin: 4.2,
  easyDeltaMin: 0.25,
  gemRatingRawMin: 4.5,
  gemReviewsMin: 3,
  gemReviewsMax: 7,
  lowWithdrawalRatio: 0.5,
  lowWithdrawalSubjectMin: 0.02,
} as const;

export interface BadgeInput {
  scores: ProfessorScores;
  /** RankedProfessor.openSections.length within scope. */
  openSectionCount: number;
  /** Σ w / Σ students over the subject's eligible rows; null when unknown. */
  subjectWRate: number | null;
  /** School.reviewsAvailable (default true). False hides the review-dependent badges (§5). */
  reviewsAvailable?: boolean;
}

/** Badges that need a review source (MULTI_SCHOOL_DESIGN §5). */
export const REVIEW_BADGES: ReadonlySet<BadgeId> = new Set<BadgeId>(['tough-but-loved', 'hidden-gem']);

type BadgeRule = (input: BadgeInput) => boolean;

/** deltaComparableN ≥ MIN_BADGE_N students, or ≥ MIN_SECTIONS_N comparable sections for percent-only professors. */
function enoughComparable(scores: ProfessorScores): boolean {
  return scores.countsAreEstimates ? scores.gradeRows >= MIN_SECTIONS_N && scores.deltaComparableN > 0 : scores.deltaComparableN >= MIN_BADGE_N;
}

/** studentsGraded + withdrawn ≥ MIN_BADGE_N, or ≥ MIN_SECTIONS_N sections for percent-only professors. */
function enoughStudents(scores: ProfessorScores): boolean {
  return scores.countsAreEstimates ? scores.gradeRows >= MIN_SECTIONS_N : scores.studentsGraded + scores.withdrawn >= MIN_BADGE_N;
}

const RULES: Record<BadgeId, BadgeRule> = {
  'open-now': ({ openSectionCount }) => openSectionCount >= 1,

  'tough-but-loved': ({ scores, reviewsAvailable }) =>
    reviewsAvailable !== false &&
    scores.gpaDelta !== null &&
    scores.ratingShrunk !== null &&
    scores.gpaDelta <= BADGE_THRESHOLDS.toughDeltaMax &&
    scores.ratingShrunk >= BADGE_THRESHOLDS.toughRatingMin &&
    enoughComparable(scores),

  'easy-a': ({ scores }) =>
    scores.gpaDelta !== null && scores.gpaDelta >= BADGE_THRESHOLDS.easyDeltaMin && enoughComparable(scores),

  'hidden-gem': ({ scores, reviewsAvailable }) =>
    reviewsAvailable !== false &&
    scores.ratingRaw !== null &&
    scores.ratingRaw >= BADGE_THRESHOLDS.gemRatingRawMin &&
    scores.reviewCount >= BADGE_THRESHOLDS.gemReviewsMin &&
    scores.reviewCount <= BADGE_THRESHOLDS.gemReviewsMax,

  'low-withdrawal': ({ scores, subjectWRate }) =>
    subjectWRate !== null &&
    subjectWRate >= BADGE_THRESHOLDS.lowWithdrawalSubjectMin &&
    scores.wRate !== null &&
    scores.wRate <= BADGE_THRESHOLDS.lowWithdrawalRatio * subjectWRate &&
    enoughStudents(scores),
};

/** Every badge whose condition holds, in BADGE_ORDER (uncapped — for tests and the detail page). */
export function evaluateBadges(input: BadgeInput): BadgeId[] {
  return BADGE_ORDER.filter((id) => RULES[id](input));
}

/** evaluateBadges() capped at MAX_BADGES_SHOWN — what RankedProfessor.badges carries. */
export function computeBadges(input: BadgeInput): BadgeId[] {
  return evaluateBadges(input).slice(0, MAX_BADGES_SHOWN);
}
