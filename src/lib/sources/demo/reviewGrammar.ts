// Review template grammar (SPEC 6.5):
//   [opener by quality band] + [course clause] + [1–2 strength clauses from styleTags]
//   + [0–1 weakness clause, likelier when quality ≤ 2] + [advice] + [closer]
// ≈ 300 fragments, each carrying lexicon phrases; 60–400 chars; 3 % of texts deliberately conflict with
// the numeric rating (the caller decides which — the composer only takes the flag).
import type { VibeTag } from '@/lib/domain/types';
import type { SeededRandom } from '@/lib/utils/seededRandom';
import { ADVICE_CLAUSES, COURSE_CLAUSES, WEAKNESS_CLAUSES } from './reviewGrammarClauses';
import { CLOSERS, OPENERS, qualityBand } from './reviewGrammarOpeners';
import type { QualityBand } from './reviewGrammarOpeners';
import { SOURCE_TAGS, SOURCE_TAGS_BY_STYLE, TAG_CLAUSES } from './reviewGrammarTags';

export { qualityBand } from './reviewGrammarOpeners';
export type { QualityBand } from './reviewGrammarOpeners';
export { SOURCE_TAGS, TAG_CLAUSES } from './reviewGrammarTags';

export const REVIEW_MIN_CHARS = 60;
export const REVIEW_MAX_CHARS = 400;

/** Total number of fragments across the grammar (documented ≈ 300). */
export const FRAGMENT_COUNT =
  Object.values(OPENERS).reduce((n, list) => n + list.length, 0) +
  CLOSERS.length +
  COURSE_CLAUSES.length +
  Object.values(TAG_CLAUSES).reduce((n, list) => n + list.length, 0) +
  WEAKNESS_CLAUSES.length +
  ADVICE_CLAUSES.length;

export interface ComposeReviewInput {
  rng: SeededRandom;
  /** Numeric 1–5 rating the text should agree with (unless `conflict`). */
  quality: number;
  /** The professor's latent style tags; strength clauses are drawn from these. */
  styleTags: readonly VibeTag[];
  /** "CS 225" or null when the review is not tied to a course. */
  courseLabel: string | null;
  /** When true the opener/closer come from the opposite band (SPEC: 3 % of texts). */
  conflict?: boolean;
}

function oppositeBand(band: QualityBand): QualityBand {
  if (band === 'high') return 'low';
  if (band === 'low') return 'high';
  return 'mid';
}

/** Closers are ordered positive → negative → neutral; pick from the slice matching the band. */
function closerFor(rng: SeededRandom, band: QualityBand): string {
  const ranges: Record<QualityBand, [number, number]> = { high: [0, 8], mid: [8, 15], low: [15, 20] };
  const [lo, hi] = ranges[band];
  const pool = rng.bool(0.8) ? CLOSERS.slice(lo, hi) : CLOSERS.slice(20);
  return rng.pick(pool);
}

/** Trim at the last word boundary that keeps the text within `max` characters. */
export function trimToWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max - 1);
  const head = cut > 0 ? text.slice(0, cut) : text.slice(0, max - 1);
  return `${head.replace(/[,;:\s]+$/, '')}.`;
}

export function composeReviewText(input: ComposeReviewInput): string {
  const { rng, quality, styleTags, courseLabel, conflict = false } = input;
  const band = qualityBand(quality);
  const textBand = conflict ? oppositeBand(band) : band;

  const parts: string[] = [];
  parts.push(rng.pick(OPENERS[textBand]));
  if (courseLabel && rng.bool(0.7)) parts.push(rng.pick(COURSE_CLAUSES).replace('{course}', courseLabel));

  const tags = styleTags.length > 0 ? rng.shuffle(styleTags) : [];
  const strengthCount = tags.length === 0 ? 0 : rng.int(1, Math.min(2, tags.length));
  for (let i = 0; i < strengthCount; i++) parts.push(rng.pick(TAG_CLAUSES[tags[i]]));

  const weaknessP = textBand === 'low' ? 0.85 : textBand === 'mid' ? 0.5 : 0.2;
  if (rng.bool(weaknessP)) parts.push(rng.pick(WEAKNESS_CLAUSES));

  parts.push(rng.pick(ADVICE_CLAUSES));
  parts.push(closerFor(rng, textBand));

  let text = parts.join(' ');
  // Length guard: pad with a second piece of advice when short, drop from the tail when long.
  while (text.length < REVIEW_MIN_CHARS) {
    parts.splice(parts.length - 1, 0, rng.pick(ADVICE_CLAUSES));
    text = parts.join(' ');
  }
  while (text.length > REVIEW_MAX_CHARS && parts.length > 2) {
    parts.splice(parts.length - 2, 1);
    text = parts.join(' ');
  }
  return trimToWordBoundary(text, REVIEW_MAX_CHARS);
}

/** 1–3 RMP-style source tags, biased toward the professor's style tags. */
export function pickSourceTags(rng: SeededRandom, styleTags: readonly VibeTag[]): string[] {
  const count = rng.int(1, 3);
  const preferred: string[] = [];
  for (const tag of styleTags) for (const s of SOURCE_TAGS_BY_STYLE[tag]) if (!preferred.includes(s)) preferred.push(s);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const pool = preferred.length > 0 && rng.bool(0.75) ? preferred : SOURCE_TAGS;
    const candidate = rng.pick(pool);
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out.sort();
}
