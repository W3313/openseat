// Frozen phrase tables for the extractive fallback (SPEC 9.9). Every phrase respects the schema limits
// (strength/watch-out ≤ 90 chars, teaching-style ≤ 40 chars). Order of TAG_ORDER is the tie-break.
import type { VibeTag } from '@/lib/domain/types';

/** Every VibeTag, positive six first (mirrors the type union order). */
export const TAG_ORDER: readonly VibeTag[] = [
  'clear-lectures', 'engaging', 'caring', 'fair-grading', 'curves-generously', 'great-notes',
  'heavy-homework', 'hard-exams', 'fast-paced', 'disorganized', 'strict-attendance', 'must-read-textbook',
];

export const POSITIVE_TAGS: ReadonlySet<VibeTag> = new Set<VibeTag>([
  'clear-lectures', 'engaging', 'caring', 'fair-grading', 'curves-generously', 'great-notes',
]);

/** Strength (positive tags) / watch-out (negative tags) sentences. */
export const TAG_PHRASES: Record<VibeTag, string> = {
  'clear-lectures': 'Lectures are described as clear and well organized',
  engaging: 'Students call the lectures engaging and worth attending',
  caring: 'Reviews describe an instructor who is approachable and cares about students',
  'fair-grading': 'Grading is described as fair and transparent',
  'curves-generously': 'Several reviews mention a generous curve at the end',
  'great-notes': 'Course notes and slides are called genuinely useful',
  'heavy-homework': 'Homework load is heavy; expect large weekly problem sets',
  'hard-exams': 'Exams are described as hard, with low raw averages',
  'fast-paced': 'The course moves fast; falling behind is costly',
  disorganized: 'Several reviews mention disorganized logistics or unclear expectations',
  'strict-attendance': 'Attendance is strictly tracked and affects the grade',
  'must-read-textbook': 'The textbook is required reading, not optional',
};

/** Short teaching-style chips (≤ 40 chars). */
export const STYLE_PHRASES: Record<VibeTag, string> = {
  'clear-lectures': 'Clear lectures',
  engaging: 'Engaging lecturer',
  caring: 'Approachable and caring',
  'fair-grading': 'Fair, transparent grading',
  'curves-generously': 'Generous curve',
  'great-notes': 'Great notes and slides',
  'heavy-homework': 'Heavy homework',
  'hard-exams': 'Hard exams',
  'fast-paced': 'Fast-paced',
  disorganized: 'Loose organization',
  'strict-attendance': 'Strict attendance',
  'must-read-textbook': 'Textbook-driven',
};

/** Padding for teachingStyle when fewer than two tags exist. */
export const STYLE_FILLERS: readonly string[] = ['Mixed reviews', 'No dominant pattern'];

export const NO_WATCH_OUTS = "Few critical reviews — encouraging, but it's a small sample.";

/** Sentiment-bearing words counted as `lexiconHits` in the sentence score (positive and negative). */
export const LEXICON: ReadonlySet<string> = new Set([
  // positive
  'amazing', 'awesome', 'best', 'brilliant', 'caring', 'clear', 'clearly', 'engaging', 'enjoyable', 'enjoyed',
  'excellent', 'fair', 'fantastic', 'favorite', 'friendly', 'fun', 'generous', 'great', 'helpful', 'incredible',
  'interesting', 'kind', 'love', 'loved', 'organized', 'passionate', 'patient', 'recommend', 'responsive',
  'reasonable', 'supportive', 'thoughtful', 'transparent', 'useful', 'wonderful', 'worth',
  // negative
  'awful', 'bad', 'boring', 'confusing', 'difficult', 'disorganized', 'dry', 'frustrating', 'hard', 'harsh',
  'horrible', 'impossible', 'late', 'mean', 'messy', 'painful', 'poor', 'rude', 'slow', 'stressful', 'terrible',
  'tough', 'unclear', 'unfair', 'unhelpful', 'unprepared', 'useless', 'waste', 'worst',
]);

export const BONUS_TERMS: readonly string[] = ['recommend', 'best', 'learned'];
export const PENALTY_TERMS: readonly string[] = ['my grade', 'i got'];
