// SPEC 9.9 — deterministic extractive fallback. Same ProfessorSummary shape as the Claude path,
// source 'extractive', model null. Pure function of (detail, selected, now); snapshot-tested.
import type { ProfessorDetail, ProfessorSummary, Review, TeachingFormat, VibeTag, Workload } from '@/lib/domain/types';
import { PROMPT_VERSION } from '@/lib/domain/constants';
import { EXTRACTIVE_MODEL_TAG, summaryInputHash } from './cache';
import {
  BONUS_TERMS, LEXICON, NO_WATCH_OUTS, PENALTY_TERMS, POSITIVE_TAGS, STYLE_FILLERS, STYLE_PHRASES, TAG_ORDER, TAG_PHRASES,
} from './extractivePhrases';
import { gradingNote } from './gradingNote';
import { tagCounts } from './prompt';
import { SUMMARY_LIMITS, SummarySchema } from './schema';
import { selectReviews, selectedIds, truncateAtWord } from './selectReviews';

interface Sentence {
  text: string;
  reviewId: string;
  score: number;
  tokens: Set<string>;
  order: number; // review rank (date desc, id asc) × 100 + sentence index, for total ordering
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z']*/g) ?? [];
}

/** Split on [.!?] + whitespace; keep 6–30 words; score per SPEC 9.9 step 2. */
export function extractSentences(review: Review, reviewIndex: number): Sentence[] {
  const parts = review.text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const out: Sentence[] = [];
  parts.forEach((part, i) => {
    const tokens = tokenize(part);
    if (tokens.length < 6 || tokens.length > 30) return;
    const lower = part.toLowerCase();
    const hits = tokens.filter((t) => LEXICON.has(t)).length;
    const bonus = BONUS_TERMS.some((t) => lower.includes(t)) ? 1 : 0;
    const penalty = PENALTY_TERMS.some((t) => lower.includes(t)) ? 3 : 0;
    out.push({ text: part, reviewId: review.id, score: hits * 2 + review.quality + bonus - penalty, tokens: new Set(tokens), order: reviewIndex * 100 + i });
  });
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Top sentences by score desc, then order asc; drop near-duplicates (Jaccard ≥ 0.5) of earlier picks. */
function pickSentences(reviews: readonly Review[], filter: (r: Review) => boolean, max: number, taken: Sentence[]): Sentence[] {
  const candidates = reviews.flatMap((r, i) => (filter(r) ? extractSentences(r, i) : []));
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const picked: Sentence[] = [];
  for (const s of candidates) {
    if (picked.length >= max) break;
    if ([...taken, ...picked].some((p) => jaccard(p.tokens, s.tokens) >= 0.5)) continue;
    picked.push(s);
  }
  return picked;
}

function quote(sentence: string, limit: number): string {
  const inner = truncateAtWord(sentence.replace(/["“”]/g, ''), limit - 2);
  return `“${inner}”`;
}

export function deltaPhrase(gpaDelta: number | null): string {
  if (gpaDelta === null) return 'have no comparison group yet';
  if (gpaDelta >= 0.3) return 'run well above the course average';
  if (gpaDelta > 0.1) return 'run a bit above average';
  if (gpaDelta >= -0.1) return 'track the course average';
  if (gpaDelta > -0.3) return 'run a bit below average';
  return 'run well below the course average';
}

function rankedTags(counts: Map<VibeTag, number>, minCount: number): VibeTag[] {
  return TAG_ORDER.filter((t) => (counts.get(t) ?? 0) >= minCount).sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b),
  );
}

function workloadOf(difficultyMean: number | null): Workload {
  if (difficultyMean === null) return 'moderate';
  if (difficultyMean >= 3.8) return 'heavy';
  if (difficultyMean <= 2.4) return 'light';
  return 'moderate';
}

function formatOf(reviews: readonly Review[]): TeachingFormat {
  const texts = reviews.map((r) => r.text.toLowerCase());
  if (texts.some((t) => t.includes('project'))) return 'project-based';
  if (texts.some((t) => t.includes('participation') || t.includes('discussion'))) return 'discussion';
  const lectureShare = texts.filter((t) => t.includes('lecture')).length / Math.max(1, texts.length);
  return lectureShare >= 0.5 ? 'lecture-heavy' : 'mixed';
}

function bestForOf(detail: ProfessorDetail, has: (tag: VibeTag) => boolean): string {
  const d = detail.scores.difficultyMean;
  if (d !== null && d <= 2.5 && has('fair-grading')) return 'Students who want a lighter, predictable workload';
  if (d !== null && d >= 3.8 && has('engaging')) return "Students who want to be challenged and don't mind extra hours";
  if (has('heavy-homework')) return 'Students who keep up week to week';
  const subject = detail.professor.subjects[0] ?? 'this subject';
  return truncateAtWord(`Most students in ${subject} — no strong pattern in the reviews`, SUMMARY_LIMITS.bestFor);
}

/**
 * Build the extractive summary. `selected` defaults to selectReviews(detail.reviews); `now` defaults to
 * the current time (pass a fixed ISO string for byte-identical snapshots).
 */
export function extractiveSummary(detail: ProfessorDetail, selected?: readonly Review[], now?: string): ProfessorSummary {
  const reviews = selected ?? selectReviews(detail.reviews);
  const { scores, professor } = detail;
  const n = reviews.length;
  const counts = tagCounts(reviews);
  const minCount = n < 5 ? 1 : 2;
  const has = (tag: VibeTag): boolean => (counts.get(tag) ?? 0) >= minCount;
  const evidence = new Set<string>();
  const addTagEvidence = (tag: VibeTag): void => {
    for (const r of reviews) if (r.vibeTags.includes(tag)) evidence.add(r.id);
  };

  // strengths: ≤ 2 positive-tag phrases, then quality ≥ 4 sentences, 2–4 total
  const strengths: string[] = [];
  for (const tag of rankedTags(counts, minCount).filter((t) => POSITIVE_TAGS.has(t)).slice(0, 2)) {
    strengths.push(TAG_PHRASES[tag]);
    addTagEvidence(tag);
  }
  const used: Sentence[] = [];
  for (const s of pickSentences(reviews, (r) => r.quality >= 4, 4 - strengths.length, used)) {
    strengths.push(quote(s.text, SUMMARY_LIMITS.strength));
    evidence.add(s.reviewId);
    used.push(s);
  }
  while (strengths.length < 2) {
    strengths.push(strengths.length === 0 ? `Rated ${(scores.ratingRaw ?? 0).toFixed(1)}/5 on average` : 'Reviews give few specifics beyond the rating');
  }

  // watchOuts: ≤ 2 negative-tag phrases, then quality ≤ 2 sentences, ≤ 3 total
  const watchOuts: string[] = [];
  for (const tag of rankedTags(counts, minCount).filter((t) => !POSITIVE_TAGS.has(t)).slice(0, 2)) {
    watchOuts.push(TAG_PHRASES[tag]);
    addTagEvidence(tag);
  }
  for (const s of pickSentences(reviews, (r) => r.quality <= 2, 3 - watchOuts.length, used)) {
    watchOuts.push(quote(s.text, SUMMARY_LIMITS.watchOut));
    evidence.add(s.reviewId);
    used.push(s);
  }
  if (watchOuts.length === 0) watchOuts.push(NO_WATCH_OUTS);

  // teachingStyle: top 2–4 tags → chips, padded
  const style = rankedTags(counts, minCount).slice(0, 4).map((t) => STYLE_PHRASES[t]);
  for (const filler of STYLE_FILLERS) if (style.length < 2) style.push(filler);

  const rating = scores.ratingShrunk ?? scores.ratingRaw ?? 0;
  const verdict = truncateAtWord(
    `Rated ${rating.toFixed(1)}/5 across ${scores.reviewCount} reviews; grades ${deltaPhrase(scores.gpaDelta)}.`,
    SUMMARY_LIMITS.verdict,
  );

  const evidenceReviewIds = reviews.map((r) => r.id).filter((id) => evidence.has(id)).slice(0, SUMMARY_LIMITS.evidenceMax);
  if (evidenceReviewIds.length === 0 && reviews[0]) evidenceReviewIds.push(reviews[0].id);

  const output = SummarySchema.parse({
    verdict,
    teachingStyle: style,
    strengths: strengths.slice(0, 4),
    watchOuts: watchOuts.slice(0, 3),
    bestFor: bestForOf(detail, has),
    workload: workloadOf(scores.difficultyMean),
    format: formatOf(reviews),
    confidence: scores.confidence,
    evidenceReviewIds,
  });

  return {
    professorId: professor.id,
    source: 'extractive',
    model: null,
    promptVersion: PROMPT_VERSION,
    generatedAt: now ?? new Date().toISOString(),
    inputHash: summaryInputHash({
      professorId: professor.id,
      modelOrExtractive: EXTRACTIVE_MODEL_TAG,
      selectedReviewIds: selectedIds(reviews),
      ratingShrunk: scores.ratingShrunk,
      gpaDelta: scores.gpaDelta,
      reviewCount: scores.reviewCount,
    }),
    reviewCount: scores.reviewCount,
    ...output,
    confidence: scores.confidence,
    gradingNote: gradingNote(scores, detail.courses.length),
  };
}
