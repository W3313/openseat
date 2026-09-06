// Fictional reviews for the demo seed (SPEC 6.5 "Reviews"). RawReview[] keyed to RawProfessor.sourceId.
import type { RawReview } from '@/lib/sources/types';
import { clamp, sigmoid } from '@/lib/utils/seededRandom';
import type { SeededRandom } from '@/lib/utils/seededRandom';
import { drawLetter, leniencyShares } from './generator-grades';
import type { DemoProfessor } from './generator-types';
import { composeReviewText, pickSourceTags } from './reviewGrammar';

const DAY_MS = 86_400_000;

/** Uniform date inside [Jan 1 start, Dec 31 end], as "YYYY-MM-DD" (UTC arithmetic only). */
export function drawDate(rng: SeededRandom, startYear: number, endYear: number): string {
  const lo = Date.UTC(startYear, 0, 1);
  const hi = Date.UTC(endYear, 11, 31);
  const days = Math.floor((hi - lo) / DAY_MS);
  const t = lo + rng.int(0, days) * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** SPEC: n = round(2 + 38·beta(2,3)); 6 % of professors land in the low-data tier with 0–2 reviews. */
export function drawReviewCount(rng: SeededRandom): number {
  if (rng.bool(0.06)) return rng.int(0, 2);
  // 2 + 32·beta(2,3): same shape as SPEC 6.5 (2–34, median ≈ 14) scaled so ~90 professors total ≈ 1,300 reviews
  // (the SPEC's stated total) and professors-detail.json stays under its 2 MB budget.
  return Math.round(2 + 32 * rng.beta(2, 3));
}

export function generateReviews(rng: SeededRandom, professors: readonly DemoProfessor[]): RawReview[] {
  const reviews: RawReview[] = [];
  let seq = 0;
  for (const prof of professors) {
    if (!prof.reviewed) continue;
    const n = prof.reviewCountOverride ?? drawReviewCount(rng);
    for (let i = 0; i < n; i++) {
      const quality = clamp(Math.round(rng.normal(prof.quality, 0.8)), 1, 5);
      const difficulty = clamp(Math.round(rng.normal(prof.difficulty, 0.7)), 1, 5);
      const wouldTakeAgain = rng.float() < sigmoid(1.6 * (quality - 3));
      const course = prof.courses.length > 0 && rng.bool(0.9) ? rng.pick(prof.courses) : null;
      const courseLabel = course ? `${course.subject} ${course.number}` : null;
      const date = drawDate(rng, prof.activeYears.start, prof.activeYears.end);
      const gradeReceived = course && rng.bool(0.85) ? drawLetter(rng, leniencyShares(course, prof.leniency)) : null;
      const sourceTags = pickSourceTags(rng, prof.styleTags);
      const thumbsUp = rng.poisson(quality);
      const thumbsDown = rng.poisson(0.5);
      const conflict = rng.bool(0.03);
      const text = composeReviewText({ rng, quality, styleTags: prof.styleTags, courseLabel, conflict });
      reviews.push({
        sourceId: `demo-r-${String(++seq).padStart(6, '0')}`,
        professorSourceId: prof.sourceId,
        courseLabel, date, quality, difficulty, wouldTakeAgain, gradeReceived, text, sourceTags, thumbsUp, thumbsDown,
      });
    }
  }
  return reviews;
}
