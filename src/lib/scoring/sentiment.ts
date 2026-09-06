// SPEC 8.8 sentiment, computed at ingest. Blends the 1–5 quality score with a tiny bundled AFINN-style
// lexicon (afinn-mini.json, scores −3..3) matched on word boundaries in normalizeText(text).
import { clamp } from '@/lib/utils/seededRandom';
import afinnMini from './afinn-mini.json';
import { tokenize } from './text';

/** word → score (−3..3). Keys are already lowercase single tokens. */
export const AFINN_MINI: Readonly<Record<string, number>> = afinnMini as Record<string, number>;

const QUALITY_WEIGHT = 0.7;
const LEXICON_WEIGHT = 0.3;
const MAX_WORD_SCORE = 3;

/** Σ(word scores) / (3 × max(1, matchedWords)) over afinn-mini.json, word-boundary match on normalize(text). */
export function lexiconScore(text: string): number {
  let sum = 0;
  let matched = 0;
  for (const token of tokenize(text)) {
    const score = AFINN_MINI[token];
    if (score === undefined) continue;
    sum += score;
    matched += 1;
  }
  return sum / (MAX_WORD_SCORE * Math.max(1, matched));
}

/** clamp(0.7 × (quality − 3) / 2 + 0.3 × lexiconScore(text), −1, 1). */
export function sentimentScore(quality: number, text: string): number {
  const q = clamp(quality, 1, 5);
  return clamp(QUALITY_WEIGHT * ((q - 3) / 2) + LEXICON_WEIGHT * lexiconScore(text), -1, 1);
}
