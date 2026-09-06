// SPEC 9.2 — deterministic review selection. The result is the model's (and the extractive
// builder's) whole input, and its sorted ids feed the inputHash, so every ordering here is total.
import type { Review } from '@/lib/domain/types';

export const SELECT_PER_BUCKET = 10;
export const SELECT_CAP = 30;
export const REVIEW_TEXT_MAX_CHARS = 600;

function byDateDescIdAsc(a: Review, b: Review): number {
  return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
}

/** Truncate at a word boundary to at most `max` chars, appending an ellipsis when cut. */
export function truncateAtWord(text: string, max = REVIEW_TEXT_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const budget = max - 1; // room for the ellipsis
  const slice = trimmed.slice(0, budget);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > budget * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,;:]+$/, '')}…`;
}

/**
 * Union of the 10 most recent (date desc, id asc), the 10 most helpful (helpfulVotes desc, date desc,
 * id asc) and the 10 lowest-quality (quality asc, date desc, id asc) reviews; de-duplicated by id;
 * sorted date desc, id asc; capped at 30. Texts are truncated to 600 chars at a word boundary.
 */
export function selectReviews(reviews: readonly Review[]): Review[] {
  const recent = [...reviews].sort(byDateDescIdAsc).slice(0, SELECT_PER_BUCKET);
  const helpful = [...reviews]
    .sort((a, b) => b.helpfulVotes - a.helpfulVotes || byDateDescIdAsc(a, b))
    .slice(0, SELECT_PER_BUCKET);
  const lowest = [...reviews]
    .sort((a, b) => a.quality - b.quality || byDateDescIdAsc(a, b))
    .slice(0, SELECT_PER_BUCKET);

  const byId = new Map<string, Review>();
  for (const r of [...recent, ...helpful, ...lowest]) if (!byId.has(r.id)) byId.set(r.id, r);

  return [...byId.values()]
    .sort(byDateDescIdAsc)
    .slice(0, SELECT_CAP)
    .map((r) => (r.text.length > REVIEW_TEXT_MAX_CHARS ? { ...r, text: truncateAtWord(r.text) } : r));
}

/** Sorted, de-duplicated ids of a selection — the canonical form used by the inputHash. */
export function selectedIds(selected: readonly Review[]): string[] {
  return [...new Set(selected.map((r) => r.id))].sort();
}
