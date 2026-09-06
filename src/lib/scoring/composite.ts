// SPEC 8.5 "Overall" composite, 0–100. Fixed neutral substitution (0.5) for missing grade / would-take-again
// inputs keeps one definition for every row; weights are never renormalized.
import { COMPOSITE_WEIGHTS } from '@/lib/domain/constants';
import { clamp } from '@/lib/utils/seededRandom';

/**
 * R = (ratingShrunk − 1) / 4; G = gpaDelta null → 0.5 else clamp((gpaDelta + 0.75) / 1.5, 0, 1);
 * W = wouldTakeAgainPct null → 0.5 else pct / 100; composite = round1(100 × (0.60R + 0.25G + 0.15W)).
 * Null when ratingShrunk is null.
 */
export function composite(ratingShrunk: number | null, gpaDelta: number | null, wouldTakeAgainPct: number | null): number | null {
  if (ratingShrunk === null) return null;
  const R = clamp((ratingShrunk - 1) / 4, 0, 1);
  const G = gpaDelta === null ? 0.5 : clamp((gpaDelta + 0.75) / 1.5, 0, 1);
  const W = wouldTakeAgainPct === null ? 0.5 : clamp(wouldTakeAgainPct / 100, 0, 1);
  const score = 100 * (COMPOSITE_WEIGHTS.rating * R + COMPOSITE_WEIGHTS.grades * G + COMPOSITE_WEIGHTS.wouldTakeAgain * W);
  return round1(score);
}

/** Round to one decimal place (the composite's display precision). */
export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
