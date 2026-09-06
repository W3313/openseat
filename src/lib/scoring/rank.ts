// SPEC 8.6 sort keys and 8.7 applyRankingsQuery. `applyRankingsQuery` is the ONE pure function both the
// rankings page (client, over the precomputed payload) and /api/schools/[school]/rankings use.
import type {
  RankedProfessor, RankingsPayload, RankingsQuery, RankingsResponse, RankingsScope, RankingsTotals, Section, SortKey,
} from '@/lib/domain/types';
import { MIN_REVIEWS_RANKED } from '@/lib/domain/constants';
import { courseIdSubject, makeCourseId } from '@/lib/utils/ids';

export type RankedComparator = (a: RankedProfessor, b: RankedProfessor) => number;

type Metric = (p: RankedProfessor) => number | null;

/** Descending on a numeric metric; nulls sort last. */
function desc(metric: Metric): RankedComparator {
  return (a, b) => {
    const x = metric(a);
    const y = metric(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  };
}

/** Final tie-break for every sort: lastName asc, firstName asc, then id so the order is total. */
export const byName: RankedComparator = (a, b) =>
  a.professor.lastName.localeCompare(b.professor.lastName, 'en', { sensitivity: 'base' }) ||
  a.professor.firstName.localeCompare(b.professor.firstName, 'en', { sensitivity: 'base' }) ||
  a.professor.id.localeCompare(b.professor.id);

function chain(...comparators: readonly RankedComparator[]): RankedComparator {
  return (a, b) => {
    for (const cmp of comparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

const ratingShrunk: Metric = (p) => p.scores.ratingShrunk;
const reviewCount: Metric = (p) => p.scores.reviewCount;
const gpaDelta: Metric = (p) => p.scores.gpaDelta;
const gpaMean: Metric = (p) => p.scores.gpaMean;
const compositeScore: Metric = (p) => p.scores.composite;
const studentsGraded: Metric = (p) => p.scores.studentsGraded;

const COMPARATORS: Record<SortKey, RankedComparator> = {
  rating: chain(desc(ratingShrunk), desc(reviewCount), desc(gpaDelta), byName),
  overall: chain(desc(compositeScore), desc(ratingShrunk), byName),
  gpa: chain(desc(gpaDelta), desc(gpaMean), desc(ratingShrunk), byName),
  reviews: chain(desc(reviewCount), desc(ratingShrunk), byName),
};

/** Stable comparator for a sort key incl. null ordering and the lastName/firstName tie-break (SPEC 8.6). */
export function comparatorFor(sort: SortKey): RankedComparator {
  return COMPARATORS[sort] ?? COMPARATORS.rating;
}

/** New array sorted per 8.6 (input untouched). Does NOT assign rank. */
export function sortRanked(list: readonly RankedProfessor[], sort: SortKey): RankedProfessor[] {
  return [...list].sort(comparatorFor(sort));
}

/** lowData order: gpaDelta desc (nulls last) → studentsGraded desc → lastName asc (SPEC 8.7 step 4). */
export function sortLowData(list: readonly RankedProfessor[]): RankedProfessor[] {
  return [...list].sort(chain(desc(gpaDelta), desc(studentsGraded), byName));
}

function sectionCourseIds(section: Section): string[] {
  return [section.courseId, ...(section.crossListedCourseIds ?? [])];
}

/** section.courseId or any crossListedCourseIds is in the subject (course scope: equals the course id). */
export function sectionInScope(section: Section, scope: RankingsScope, subject: string): boolean {
  const ids = sectionCourseIds(section);
  if (scope.kind === 'course') return ids.includes(scope.courseId);
  const code = subject.toUpperCase();
  return ids.some((id) => courseIdSubject(id) === code);
}

/** True when the section carries the course id directly or through a cross-listing. */
export function sectionInCourse(section: Section, courseId: string): boolean {
  return sectionCourseIds(section).includes(courseId);
}

/** openSections deduped by section id over both lists; reviews = Σ reviewCount (SPEC 8.7 step 5). */
export function computeTotals(ranked: readonly RankedProfessor[], lowData: readonly RankedProfessor[]): RankingsTotals {
  const sectionIds = new Set<string>();
  let reviews = 0;
  for (const p of [...ranked, ...lowData]) {
    for (const s of p.openSections) sectionIds.add(s.id);
    reviews += p.scores.reviewCount;
  }
  return { ranked: ranked.length, lowData: lowData.length, openSections: sectionIds.size, reviews };
}

/** Normalize a course filter value ("225", " 225a ") to the CSV number shape; undefined when empty. */
export function normalizeCourseFilter(course: string | undefined): string | undefined {
  const trimmed = (course ?? '').trim().toUpperCase();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * SPEC 8.7: course filter → openOnly filter → split at MIN_REVIEWS_RANKED → sort → rank 1..n → totals.
 * Pure: never mutates `payload`.
 */
export function applyRankingsQuery(payload: RankingsPayload, query: RankingsQuery): RankingsResponse {
  const course = normalizeCourseFilter(query.course);
  let professors: RankedProfessor[] = payload.professors.map((p) => ({ ...p }));

  if (course !== undefined) {
    const courseId = makeCourseId(payload.school.id, payload.subject.code, course);
    professors = professors
      .filter(
        (p) => p.courses.some((c) => c.courseId === courseId) || p.openSections.some((s) => sectionInCourse(s, courseId)),
      )
      .map((p) => ({ ...p, openSections: p.openSections.filter((s) => sectionInCourse(s, courseId)) }));
  }

  if (query.openOnly) professors = professors.filter((p) => p.openSections.length >= 1);

  const ranked = sortRanked(
    professors.filter((p) => p.scores.reviewCount >= MIN_REVIEWS_RANKED),
    query.sort,
  ).map((p, i) => ({ ...p, rank: i + 1 }));
  const lowData = sortLowData(professors.filter((p) => p.scores.reviewCount < MIN_REVIEWS_RANKED)).map((p) => ({
    ...p,
    rank: null,
  }));

  const { professors: _omitted, ...rest } = payload;
  void _omitted;
  const normalizedQuery: RankingsQuery = { sort: query.sort, openOnly: query.openOnly };
  if (course !== undefined) normalizedQuery.course = course;

  return { ...rest, query: normalizedQuery, totals: computeTotals(ranked, lowData), ranked, lowData };
}
