// Per-professor assembly shared by the subject payloads and the school-wide detail map (SPEC 6.6, 8).
import type {
  GpaPoint, MatchProvenance, MatchReportEntry, ProfessorScores, RankedProfessor, Review, Section,
} from '@/lib/domain/types';
import { MIN_REVIEWS_RANKED, QUOTE_MAX_CHARS } from '@/lib/domain/constants';
import { aggregateProfessorGrades, type AggregateContext, type GradeAggregate } from '@/lib/scoring/aggregate';
import { reviewScores, type ReviewScores } from '@/lib/scoring/rating';
import { composite } from '@/lib/scoring/composite';
import { computeBadges } from '@/lib/scoring/badges';
import { professorVibeTags } from '@/lib/scoring/tags';
import { selectPositiveReviews, truncateQuote } from '@/lib/scoring/positiveReviews';
import type { DataIndex, ProcessedData } from './load';

/** ProfessorScores from the review-side and grade-side pieces (SPEC 8.4, 8.2/8.3, 8.5). */
export function assembleScores(rs: ReviewScores, agg: GradeAggregate): ProfessorScores {
  return {
    reviewCount: rs.reviewCount,
    ratingRaw: rs.ratingRaw,
    ratingShrunk: rs.ratingShrunk,
    priorMean: rs.priorMean,
    confidence: rs.confidence,
    difficultyMean: rs.difficultyMean,
    wouldTakeAgainPct: rs.wouldTakeAgainPct,
    positiveCount: rs.positiveCount,
    criticalCount: rs.criticalCount,
    gradeRows: agg.gradeRows,
    studentsGraded: agg.studentsGraded,
    withdrawn: agg.withdrawn,
    gpaMean: agg.gpaMean,
    aRate: agg.aRate,
    wRate: agg.wRate,
    dfwRate: agg.dfwRate,
    gpaDelta: agg.gpaDelta,
    deltaComparableN: agg.deltaComparableN,
    soleInstructor: agg.soleInstructor,
    composite: composite(rs.ratingShrunk, agg.gpaDelta, rs.wouldTakeAgainPct),
    yearsActive: agg.yearsActive,
  };
}

/** Match-report entries for one professor, merged by (source, raw) with row counts summed. */
export function provenanceFor(entries: readonly MatchReportEntry[], professorId: string): MatchProvenance[] {
  const merged = new Map<string, MatchProvenance>();
  for (const e of entries) {
    if (e.professorId !== professorId) continue;
    const key = `${e.source}|${e.instructorRaw}`;
    const existing = merged.get(key);
    if (existing) existing.rows += e.rows;
    else merged.set(key, { instructorRaw: e.instructorRaw, source: e.source, method: e.method, score: e.score, rows: e.rows });
  }
  return [...merged.values()].sort((a, b) => a.source.localeCompare(b.source) || b.rows - a.rows || a.instructorRaw.localeCompare(b.instructorRaw));
}

/** Quotes carried in the rankings payload (the card shows two; SPEC 12.6 allows ≤ 3). */
export const PREVIEW_QUOTES = 2;

/** Preview quotes truncated to QUOTE_MAX_CHARS so the payload stays small; the detail page has full texts. */
export function previewReviews(reviews: readonly Review[]): Review[] {
  return selectPositiveReviews(reviews).slice(0, PREVIEW_QUOTES).map((r) => ({ ...r, text: truncateQuote(r.text, QUOTE_MAX_CHARS) }));
}

const floor10 = (v: number) => Math.floor(v * 10) / 10;
const ceil10 = (v: number) => Math.ceil(v * 10) / 10;

/** [floor10(min) − 0.1, ceil10(max) + 0.1] over all points, clamped to [0, 4]; [0, 4] with no points. */
export function sparklineRange(points: readonly GpaPoint[]): [number, number] {
  if (points.length === 0) return [0, 4];
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.gpa < min) min = p.gpa;
    if (p.gpa > max) max = p.gpa;
  }
  const lo = Math.max(0, Math.round((floor10(min) - 0.1) * 1000) / 1000);
  const hi = Math.min(4, Math.round((ceil10(max) + 0.1) * 1000) / 1000);
  return [lo, hi];
}

export interface RankedInputs {
  data: ProcessedData;
  index: DataIndex;
  professorId: string;
  ctx: AggregateContext;
  /** Sections (any status) attributed to this professor within scope. */
  sections: readonly Section[];
  prior: number;
  subjectWRate: number | null;
}

/** One RankedProfessor (rank null) — the building block of RankingsPayload.professors. */
export function buildRankedProfessor(input: RankedInputs): RankedProfessor {
  const { data, index, professorId, ctx, sections, prior, subjectWRate } = input;
  const professor = index.professorsById.get(professorId);
  if (!professor) throw new Error(`build-rankings: unknown professor ${professorId}`);
  const reviews = index.reviewsByProfessor.get(professorId) ?? [];
  const agg = aggregateProfessorGrades(professorId, ctx);
  const scores = assembleScores(reviewScores(reviews, prior), agg);
  const openSections = sections.filter((s) => s.isOpen).sort((a, b) => a.crn.localeCompare(b.crn, undefined, { numeric: true }));
  const summary = scores.reviewCount >= MIN_REVIEWS_RANKED ? data.summaries[professorId] ?? null : null;
  return {
    rank: null,
    professor,
    scores,
    badges: computeBadges({ scores, openSectionCount: openSections.length, subjectWRate }),
    vibeTags: professorVibeTags(reviews),
    distribution: agg.distribution,
    gpaByYear: agg.gpaByYear,
    courses: agg.courses,
    openSections,
    sectionsThisTerm: sections.length,
    positiveReviews: previewReviews(reviews),
    summary,
    matchProvenance: provenanceFor(data.matchReport.entries, professorId),
  };
}
