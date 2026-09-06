// SPEC 8.4 rating: raw mean, subject prior, Bayesian shrinkage, confidence label and the other
// review-derived fields of ProfessorScores.
import type { ConfidenceLabel, ProfessorScores, Review } from '@/lib/domain/types';
import { CONFIDENCE_THRESHOLDS, PRIOR_FALLBACK, PRIOR_MIN_REVIEWS, SHRINK_K } from '@/lib/domain/constants';

export type ReviewScores = Pick<
  ProfessorScores,
  | 'reviewCount' | 'ratingRaw' | 'ratingShrunk' | 'priorMean' | 'confidence'
  | 'difficultyMean' | 'wouldTakeAgainPct' | 'positiveCount' | 'criticalCount'
>;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** mean(review.quality); null when there are no reviews. */
export function ratingRaw(reviews: readonly Review[]): number | null {
  return mean(reviews.map((r) => r.quality));
}

/** Mean quality over ALL reviews in scope; PRIOR_FALLBACK (3.7) when fewer than PRIOR_MIN_REVIEWS (20). */
export function priorMean(reviewsInScope: readonly Review[]): number {
  if (reviewsInScope.length < PRIOR_MIN_REVIEWS) return PRIOR_FALLBACK;
  return ratingRaw(reviewsInScope) ?? PRIOR_FALLBACK;
}

/** (n × raw + SHRINK_K × prior) / (n + SHRINK_K); null when raw is null. */
export function shrinkRating(raw: number | null, reviewCount: number, prior: number): number | null {
  if (raw === null) return null;
  const n = Math.max(0, reviewCount);
  return (n * raw + SHRINK_K * prior) / (n + SHRINK_K);
}

/** < 5 → 'low', 5–14 → 'medium', ≥ 15 → 'high' (CONFIDENCE_THRESHOLDS). */
export function confidenceLabel(reviewCount: number): ConfidenceLabel {
  if (reviewCount >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (reviewCount >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/** All review-derived fields of ProfessorScores for one professor given the scope prior. */
export function reviewScores(reviews: readonly Review[], prior: number): ReviewScores {
  const reviewCount = reviews.length;
  const raw = ratingRaw(reviews);
  const difficulties = reviews.map((r) => r.difficulty).filter((d): d is number => d !== null && d !== undefined);
  const wta = reviews.map((r) => r.wouldTakeAgain).filter((w): w is boolean => w !== null && w !== undefined);
  const yes = wta.filter(Boolean).length;
  return {
    reviewCount,
    ratingRaw: raw,
    ratingShrunk: shrinkRating(raw, reviewCount, prior),
    priorMean: prior,
    confidence: confidenceLabel(reviewCount),
    difficultyMean: mean(difficulties),
    wouldTakeAgainPct: wta.length === 0 ? null : (100 * yes) / wta.length,
    positiveCount: reviews.filter((r) => r.quality >= 4).length,
    criticalCount: reviews.filter((r) => r.quality <= 2).length,
  };
}
