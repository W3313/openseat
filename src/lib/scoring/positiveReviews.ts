// SPEC 8.10 positive review preview. Candidates: quality ≥ 4 AND sentiment ≥ 0.2 AND text.length ≥ 40;
// ordered helpfulVotes desc → date desc; greedy with ≤ 2 per courseId; POSITIVE_PREVIEW_STORED (3) kept,
// 2 shown. Fewer than 2 candidates → fill with quality ≥ 4 regardless of sentiment.
import type { Review } from '@/lib/domain/types';
import { POSITIVE_PREVIEW_SHOWN, POSITIVE_PREVIEW_STORED, QUOTE_MAX_CHARS } from '@/lib/domain/constants';

export const POSITIVE_MIN_QUALITY = 4;
export const POSITIVE_MIN_SENTIMENT = 0.2;
export const POSITIVE_MIN_TEXT_LENGTH = 40;
export const MAX_PER_COURSE = 2;
export const ELLIPSIS = '…';

/** quality ≥ 4 AND sentiment ≥ 0.2 AND text.length ≥ 40. */
export function isPositiveCandidate(review: Review): boolean {
  return (
    review.quality >= POSITIVE_MIN_QUALITY &&
    review.sentiment >= POSITIVE_MIN_SENTIMENT &&
    (review.text ?? '').length >= POSITIVE_MIN_TEXT_LENGTH
  );
}

/** helpfulVotes desc → date desc → id asc (total order so output is deterministic). */
export function comparePositive(a: Review, b: Review): number {
  return (b.helpfulVotes ?? 0) - (a.helpfulVotes ?? 0) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
}

function takeGreedy(pool: readonly Review[], picked: Review[], perCourse: Map<string, number>, limit: number): void {
  for (const review of pool) {
    if (picked.length >= limit) return;
    if (picked.some((p) => p.id === review.id)) continue;
    const key = review.courseId ?? '';
    const used = perCourse.get(key) ?? 0;
    if (used >= MAX_PER_COURSE) continue;
    perCourse.set(key, used + 1);
    picked.push(review);
  }
}

/**
 * helpfulVotes desc → date desc, greedy with ≤ 2 per courseId, up to `stored` (POSITIVE_PREVIEW_STORED = 3);
 * fewer than 2 candidates → fill with quality ≥ 4 regardless of sentiment.
 */
export function selectPositiveReviews(reviews: readonly Review[], stored: number = POSITIVE_PREVIEW_STORED): Review[] {
  const limit = Math.max(0, stored);
  const candidates = reviews.filter(isPositiveCandidate).sort(comparePositive);
  const picked: Review[] = [];
  const perCourse = new Map<string, number>();
  takeGreedy(candidates, picked, perCourse, limit);
  if (candidates.length < POSITIVE_PREVIEW_SHOWN) {
    const fallback = reviews.filter((r) => r.quality >= POSITIVE_MIN_QUALITY && !isPositiveCandidate(r)).sort(comparePositive);
    takeGreedy(fallback, picked, perCourse, limit);
  }
  return picked;
}

/** Truncate to QUOTE_MAX_CHARS (220) at the last word boundary and append "…" (result length ≤ maxChars). */
export function truncateQuote(text: string, maxChars: number = QUOTE_MAX_CHARS): string {
  const clean = (text ?? '').trim();
  if (clean.length <= maxChars) return clean;
  const budget = Math.max(0, maxChars - ELLIPSIS.length);
  const head = clean.slice(0, budget + 1);
  const cut = head.lastIndexOf(' ');
  const body = (cut > 0 ? head.slice(0, cut) : clean.slice(0, budget)).replace(/[\s,;:—–-]+$/u, '');
  return `${body}${ELLIPSIS}`;
}
