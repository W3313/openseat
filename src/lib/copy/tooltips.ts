// Plain-English copy for every stat, badge and sort (SPEC F10, 8.x tooltips, /about#glossary).
// Audience: a student picking a section, who has never heard "Bayesian". One plain sentence each where the
// spec does not dictate exact wording; spec-given sentences are verbatim. Templates use {placeholders} —
// fill them with fillTemplate().
import type { BadgeId, SortKey, SummarySource, VibeTag } from '@/lib/domain/types';

export interface TooltipEntry {
  /** Short label shown next to the number / as the badge text. */
  label: string;
  /** One or two plain sentences; may contain {placeholders}. */
  text: string;
}

const stats = {
  ratingShrunk: {
    label: 'Rating',
    text: "Sorted by rating, with a small nudge toward professors with more reviews so one 5-star review doesn't win. Raw average {ratingRaw} from {n} reviews.",
  },
  ratingRaw: { label: 'Raw rating', text: 'The plain average of every review’s 1–5 score, before the small nudge toward professors with more reviews.' },
  reviewCount: { label: 'Reviews', text: 'How many student reviews this professor has; under 3 and we don’t rank or summarize them yet.' },
  confidence: { label: 'Confidence', text: 'How much to trust the rating: 1 dot means under 5 reviews, 2 dots means 5–14, 3 dots means 15 or more.' },
  wouldTakeAgain: { label: 'Would take again', text: 'The share of reviewers who said they would take this professor again.' },
  difficulty: { label: 'Difficulty', text: 'The average difficulty reviewers reported, from 1 (easy) to 5 (hard).' },
  gpaMean: { label: 'GPA', text: 'The average GPA of every student graded in this professor’s lecture sections over the last {years} years, from the official grade dataset.' },
  gpaDelta: {
    label: 'vs course',
    text: "Students in this professor's sections ended {absDelta} GPA points {direction} the same courses taught by others in the same window, measured over {n} of this professor's graded students.",
  },
  gpaDeltaSole: {
    label: 'Only instructor on record',
    text: 'No one else has taught this course in the window, so there is nothing to compare against.',
  },
  wRate: { label: 'W rate', text: 'The share of enrolled students who withdrew (W) instead of finishing the course.' },
  dfwRate: { label: 'DFW rate', text: 'The share of enrolled students who ended with a D, an F, or a W.' },
  aRate: { label: 'A rate', text: 'The share of graded students who received an A+, A or A−.' },
  studentsGraded: { label: 'Students graded', text: 'Total students with a letter grade in this professor’s lecture sections in the window; rows under 10 students are hidden.' },
  gradeRows: { label: 'Grade rows', text: 'One row is one term, course and section type in the official grade dataset, which is how the data is published rather than one class section.' },
  yearsActive: { label: 'Years active', text: 'How many different years this professor has a graded lecture row in the window.' },
  composite: {
    label: 'Overall',
    text: 'Rating counts most (60%); grades vs. course average (25%) and would-take-again (15%) fill in the rest.',
  },
  noGradeData: { label: 'New — no grade data yet', text: 'The grade dataset lags the schedule, so this professor has no lecture rows in the window yet and the ranking uses reviews only.' },
  gradesThrough: { label: 'Grades through', text: 'Grade rows from {windowStart} through {windowEnd}; newer terms are not in the public dataset yet.' },
  sparkline: { label: 'GPA by year', text: 'Average GPA per year for years with at least 10 graded students, drawn on the same scale for every professor on this page.' },
  matchProvenance: { label: 'Grade rows matched', text: 'How the official grade rows were linked to this person: by exact name, first initial, nickname, or a manual alias, and never by guessing an ambiguous name.' },
  lowData: { label: 'Not enough reviews yet', text: 'Fewer than 3 reviews, so no rating is shown because one opinion isn’t a ranking; grade data still appears.' },
  openSections: { label: 'Open sections', text: 'Sections this term you can still register for, as of the last schedule snapshot.' },
  offeredSections: { label: 'Offered this term', text: 'Sections listed as active this term; the public schedule API does not expose seat counts, so availability cannot be verified here.' },
  seatsSnapshot: { label: 'Snapshot', text: 'Seat status comes from a fixed snapshot taken {fetchedAt} and is not refreshed live.' },
  positiveReviews: { label: 'Positive reviews', text: 'Two of the most helpful 4–5 star reviews, from different courses where possible, with the critical count shown to keep it honest.' },
  criticalCount: { label: 'Critical reviews', text: 'Reviews that rate this professor 1 or 2 out of 5.' },
  vibeTags: { label: 'Vibe tags', text: 'Themes that come up in at least 2 reviews and a fifth of all reviews, found by matching common student phrases, not by AI.' },
  sentiment: { label: 'Sentiment', text: 'How positive a review reads, blending its star rating with the tone of its words, from −1 (negative) to +1 (positive).' },
  summary: { label: 'AI summary', text: 'A structured summary written from this professor’s reviews and grade data; the source pill says whether Claude or a plain word-picking fallback wrote it.' },
} satisfies Record<string, TooltipEntry>;

const badges = {
  'open-now': { label: 'Open now', text: 'Has at least one section you can still get into this term.' },
  'tough-but-loved': { label: 'Tough but loved', text: 'Grades below the course average, yet students rate this professor 4.2+.' },
  'easy-a': { label: 'Easy A', text: 'Grades run at least 0.25 GPA points above the same courses taught by others (50+ students).' },
  'hidden-gem': { label: 'Hidden gem', text: 'Very high rating, but only a handful of reviews so far.' },
  'low-withdrawal': { label: 'Low withdrawal', text: 'Fewer than half as many students withdraw as the subject average.' },
} satisfies Record<BadgeId, TooltipEntry>;

/** Live-mode variant of open-now (SPEC 8.11): the public API knows "offered", not "open". */
export const OPEN_NOW_LIVE_TEXT = 'Has at least one section offered this term.';

const sorts = {
  rating: { label: 'Rating', text: stats.ratingShrunk.text },
  overall: { label: 'Overall', text: stats.composite.text },
  gpa: { label: 'Grades', text: 'Sorted by how far each professor’s GPA sits above the same courses taught by others, then by raw GPA.' },
  reviews: { label: 'Reviews', text: 'Sorted by number of reviews, most first.' },
} satisfies Record<SortKey, TooltipEntry>;

export const TOOLTIPS = { stats, badges, sorts } as const;

export type StatTooltipKey = keyof typeof stats;
export type TooltipKey = `stats.${StatTooltipKey}` | `badges.${BadgeId}` | `sorts.${SortKey}`;

export const BADGE_LABELS: Record<BadgeId, string> = {
  'open-now': badges['open-now'].label,
  'tough-but-loved': badges['tough-but-loved'].label,
  'easy-a': badges['easy-a'].label,
  'hidden-gem': badges['hidden-gem'].label,
  'low-withdrawal': badges['low-withdrawal'].label,
};

export const SORT_LABELS: Record<SortKey, string> = {
  rating: sorts.rating.label, overall: sorts.overall.label, gpa: sorts.gpa.label, reviews: sorts.reviews.label,
};

export const VIBE_TAG_LABELS: Record<VibeTag, string> = {
  'clear-lectures': 'Clear lectures', engaging: 'Engaging', caring: 'Caring', 'fair-grading': 'Fair grading',
  'curves-generously': 'Curves generously', 'great-notes': 'Great notes', 'heavy-homework': 'Heavy homework',
  'hard-exams': 'Hard exams', 'fast-paced': 'Fast-paced', disorganized: 'Disorganized',
  'strict-attendance': 'Strict attendance', 'must-read-textbook': 'Must read textbook',
};

export const SUMMARY_SOURCE_LABELS: Record<SummarySource, string> = {
  claude: 'Claude',
  'openai-compatible': 'AI summary',
  extractive: 'Extractive summary · no API key',
};

/** Badge tooltip with the live-mode wording for open-now when seats are unknown. */
export function badgeTooltip(id: BadgeId, seatStatusAvailable = true): string {
  if (id === 'open-now' && !seatStatusAvailable) return OPEN_NOW_LIVE_TEXT;
  return badges[id].text;
}

/** Stat tooltip text by key (unfilled template). */
export function statTooltip(key: StatTooltipKey): string {
  return stats[key].text;
}

/** Sort tooltip text by key. */
export function sortTooltip(key: SortKey): string {
  return sorts[key].text;
}

/** Replace {name} placeholders; missing values render as "—". */
export function fillTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? '—' : String(v);
  });
}

/** The filled DeltaChip tooltip (SPEC 8.3): number → comparison sentence; sole instructor → the sole text. */
export function gpaDeltaTooltip(gpaDelta: number | null, deltaComparableN: number, soleInstructor: boolean): string {
  if (soleInstructor || gpaDelta === null) return stats.gpaDeltaSole.text;
  return fillTemplate(stats.gpaDelta.text, {
    absDelta: Math.abs(gpaDelta).toFixed(2),
    direction: gpaDelta >= 0 ? 'above' : 'below',
    n: deltaComparableN.toLocaleString('en-US'),
  });
}

/** The filled rating tooltip (SPEC 8.4). */
export function ratingTooltip(ratingRaw: number | null, reviewCount: number): string {
  return fillTemplate(stats.ratingShrunk.text, { ratingRaw: ratingRaw === null ? null : ratingRaw.toFixed(2), n: reviewCount });
}

export interface GlossaryEntry {
  key: TooltipKey;
  label: string;
  text: string;
}

/** Every entry, flattened for /about#glossary (stats, then badges, then sorts). */
export const GLOSSARY: readonly GlossaryEntry[] = [
  ...(Object.keys(stats) as StatTooltipKey[]).map((k) => ({ key: `stats.${k}` as const, ...stats[k] })),
  ...(Object.keys(badges) as BadgeId[]).map((k) => ({ key: `badges.${k}` as const, ...badges[k] })),
  ...(Object.keys(sorts) as SortKey[]).map((k) => ({ key: `sorts.${k}` as const, ...sorts[k] })),
];
