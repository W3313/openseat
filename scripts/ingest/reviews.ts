// RawReview → Review (SPEC 6.3 steps 3 and 5). Sentiment and vibe tags come from the scoring module.
import type { Review, SchoolId } from '@/lib/domain/types';
import type { RawReview } from '@/lib/sources/types';
import { makeReviewId, courseLabelFromId } from '@/lib/utils/ids';
import { sentimentScore } from '@/lib/scoring/sentiment';
import { reviewVibeTags } from '@/lib/scoring/tags';
import { courseIdFromLabel } from './catalog';

export interface BuildReviewsOptions {
  schoolId: SchoolId;
  /** RawProfessor.sourceId → Professor.id */
  professorBySourceId: ReadonlyMap<string, string>;
  catalogIds: ReadonlySet<string>;
}

export interface BuildReviewsResult {
  reviews: Review[];
  /** Reviews whose professorSourceId is unknown (dropped). */
  orphaned: number;
  /** Reviews whose courseLabel did not resolve to a catalog course (kept, courseId null). */
  unresolvedCourse: number;
}

function clampRating(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(5, Math.max(1, value));
}

/**
 * Builds Review records without sentiment/vibe tags (those are annotated in a separate pass so the
 * normalization order of SPEC 6.3 is visible). Sorted by (professorId, date desc, id) for determinism.
 */
export function buildReviews(raw: readonly RawReview[], opts: BuildReviewsOptions): BuildReviewsResult {
  const reviews: Review[] = [];
  const seen = new Set<string>();
  let orphaned = 0;
  let unresolvedCourse = 0;
  for (const r of raw) {
    const professorId = opts.professorBySourceId.get(r.professorSourceId);
    if (!professorId) {
      orphaned++;
      continue;
    }
    const id = makeReviewId(opts.schoolId, r.sourceId);
    if (seen.has(id)) continue;
    seen.add(id);
    const courseId = courseIdFromLabel(r.courseLabel, opts.schoolId, opts.catalogIds);
    if (r.courseLabel && !courseId) unresolvedCourse++;
    const quality = clampRating(r.quality) ?? 3;
    reviews.push({
      id,
      professorId,
      courseId,
      courseLabel: courseId ? courseLabelFromId(courseId) : r.courseLabel?.trim() || null,
      date: r.date,
      quality,
      difficulty: clampRating(r.difficulty),
      wouldTakeAgain: r.wouldTakeAgain ?? null,
      gradeReceived: r.gradeReceived?.trim() || null,
      text: r.text.trim(),
      sourceTags: [...r.sourceTags],
      vibeTags: [],
      helpfulVotes: Math.max(0, (r.thumbsUp ?? 0) - (r.thumbsDown ?? 0)),
      sentiment: 0,
    });
  }
  reviews.sort((a, b) => a.professorId.localeCompare(b.professorId) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { reviews, orphaned, unresolvedCourse };
}

/** SPEC 8.8 sentiment and 8.9 per-review vibe tags. Returns new objects. */
export function annotateReviews(reviews: readonly Review[]): Review[] {
  return reviews.map((r) => ({
    ...r,
    sentiment: sentimentScore(r.quality, r.text),
    vibeTags: reviewVibeTags(r.text),
  }));
}
