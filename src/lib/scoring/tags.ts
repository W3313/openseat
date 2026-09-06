// SPEC 8.9 vibe tags. A review gets a tag when any lexicon phrase matches on word boundaries; a professor
// gets a tag when it appears in ≥ 2 reviews AND ≥ 20% of reviews. Card shows the top 3 by frequency,
// positive tags first.
import type { Review, VibeTag } from '@/lib/domain/types';
import { POSITIVE_VIBE_TAGS } from '@/lib/domain/types';
import { hasPhrase, normalizeText } from './text';
import { VIBE_LEXICON } from './vibeLexicon';

/** Every VibeTag, positive six first (mirrors the type union order). */
export const VIBE_TAGS: readonly VibeTag[] = [
  'clear-lectures', 'engaging', 'caring', 'fair-grading', 'curves-generously', 'great-notes',
  'heavy-homework', 'hard-exams', 'fast-paced', 'disorganized', 'strict-attendance', 'must-read-textbook',
];

/** Professor-level thresholds (SPEC 8.9); printed on /about#scoring. */
export const VIBE_MIN_REVIEWS = 2;
export const VIBE_MIN_SHARE = 0.2;
export const VIBE_TAGS_SHOWN = 3;

/** 6–12 lowercase phrases per tag, matched on word boundaries in normalize(text). */
export function getVibeLexicon(): Record<VibeTag, readonly string[]> {
  return VIBE_LEXICON;
}

/** Tags whose lexicon phrases occur in one review text (Review.vibeTags at ingest). */
export function reviewVibeTags(text: string): VibeTag[] {
  const normalized = normalizeText(text);
  if (normalized === '') return [];
  return VIBE_TAGS.filter((tag) => VIBE_LEXICON[tag].some((phrase) => hasPhrase(normalized, phrase)));
}

/**
 * Tag → count over the reviews (used by the AI prompt's topTags and the detail-page filter).
 * Uses Review.vibeTags when present (ingest already ran the lexicon); falls back to the text otherwise.
 */
export function vibeTagCounts(reviews: readonly Review[]): Map<VibeTag, number> {
  const counts = new Map<VibeTag, number>();
  for (const review of reviews) {
    const tags = review.vibeTags && review.vibeTags.length > 0 ? review.vibeTags : reviewVibeTags(review.text);
    for (const tag of new Set(tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

/** Tags appearing in ≥ 2 reviews AND ≥ 20% of reviews; top 3 by frequency, positive tags first. */
export function professorVibeTags(reviews: readonly Review[]): VibeTag[] {
  const total = reviews.length;
  if (total === 0) return [];
  const counts = vibeTagCounts(reviews);
  const qualifying = VIBE_TAGS.filter((tag) => {
    const n = counts.get(tag) ?? 0;
    return n >= VIBE_MIN_REVIEWS && n / total >= VIBE_MIN_SHARE;
  });
  // Top 3 by frequency (ties keep VIBE_TAGS order), then positive tags float to the front.
  const top = qualifying
    .slice()
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || VIBE_TAGS.indexOf(a) - VIBE_TAGS.indexOf(b))
    .slice(0, VIBE_TAGS_SHOWN);
  const positive = top.filter((t) => POSITIVE_VIBE_TAGS.has(t));
  const negative = top.filter((t) => !POSITIVE_VIBE_TAGS.has(t));
  return [...positive, ...negative];
}
