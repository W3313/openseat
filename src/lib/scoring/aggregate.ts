// SPEC 8.2 professor aggregates and 8.3 leave-one-out course delta. Pure functions over GradeRow[].
// Every aggregate sums raw buckets and re-applies the 8.1 formulas, so weighted means are exact.
import type { Course, CourseBreakdown, GpaPoint, GradeBuckets, GradeRow, RankingsScope } from '@/lib/domain/types';
import { MIN_BASELINE_N, MIN_GRADED_N } from '@/lib/domain/constants';
import { courseIdSubject, parseCourseId } from '@/lib/utils/ids';
import { addBuckets, gpaFromBuckets, rowStats } from './gpa';

/** Subject page, course page, or the school-wide detail page. */
export type AggregateScope = RankingsScope | { kind: 'school' };

export interface AggregateContext {
  /** Every GradeRow of the school (headline + TA, suppressed + not); the aggregate filters. */
  allRows: readonly GradeRow[];
  /** Course catalog for titles/numbers in CourseBreakdown. */
  courses: readonly Course[];
  scope: AggregateScope;
  /** Required when scope.kind === 'subject'. */
  subject?: string;
}

/** Everything 8.2/8.3 produce for one professor in one scope; copied onto ProfessorScores / RankedProfessor. */
export interface GradeAggregate {
  gradeRows: number;
  studentsGraded: number;
  withdrawn: number;
  yearsActive: number;
  gpaMean: number | null;
  aRate: number | null;
  wRate: number | null;
  dfwRate: number | null;
  distribution: GradeBuckets;
  gpaByYear: GpaPoint[];
  gpaDelta: number | null;
  deltaComparableN: number;
  soleInstructor: boolean;
  courses: CourseBreakdown[];
}

/** Headline, non-suppressed rows (the window was applied at ingest) — the only rows any aggregate sees. */
export function eligibleRows(rows: readonly GradeRow[]): GradeRow[] {
  return rows.filter((r) => r.isHeadline && !r.suppressed);
}

/** Non-suppressed TA rows (DIS/LAB/…); only CourseBreakdown entries with isHeadline: false see them. */
function eligibleTaRows(rows: readonly GradeRow[]): GradeRow[] {
  return rows.filter((r) => !r.isHeadline && !r.suppressed);
}

/** Restrict rows to the scope: subject (course subject = subject), course (courseId equal), school (all). */
export function rowsInScope(rows: readonly GradeRow[], scope: AggregateScope, subject?: string): GradeRow[] {
  if (scope.kind === 'school') return [...rows];
  if (scope.kind === 'course') return rows.filter((r) => r.courseId === scope.courseId);
  const code = (subject ?? '').toUpperCase();
  if (code === '') throw new Error('rowsInScope: subject is required for subject scope');
  return rows.filter((r) => courseIdSubject(r.courseId) === code);
}

function sumBuckets(rows: readonly GradeRow[]): GradeBuckets {
  return addBuckets(...rows.map((r) => r.buckets));
}

function distinctYears(rows: readonly GradeRow[]): number {
  return new Set(rows.map((r) => r.year)).size;
}

/** Weighted GPA over all OTHER eligible rows in the course (other professors, grades-only, empty-instructor). */
export function leaveOneOutBaseline(
  professorId: string,
  courseId: string,
  eligible: readonly GradeRow[],
): { baselineGpa: number | null; baselineN: number } {
  const others = eligible.filter((r) => r.courseId === courseId && r.professorId !== professorId);
  const buckets = sumBuckets(others);
  const stats = rowStats(buckets);
  return { baselineGpa: stats.graded === 0 ? null : gpaFromBuckets(buckets), baselineN: stats.graded };
}

function courseMeta(courseId: string, courses: readonly Course[]): { subject: string; number: string; title: string } {
  const hit = courses.find((c) => c.id === courseId);
  if (hit) return { subject: hit.subject, number: hit.number, title: hit.title };
  const parts = parseCourseId(courseId);
  return { subject: parts?.subject ?? '', number: parts?.number ?? courseId, title: '' };
}

function buildBreakdown(
  professorId: string,
  courseId: string,
  rows: readonly GradeRow[],
  pool: readonly GradeRow[],
  isHeadline: boolean,
  courses: readonly Course[],
): CourseBreakdown {
  const buckets = sumBuckets(rows);
  const stats = rowStats(buckets);
  const { baselineGpa, baselineN } = leaveOneOutBaseline(professorId, courseId, pool);
  const comparable = stats.gpa !== null && baselineGpa !== null && baselineN >= MIN_BASELINE_N && stats.graded >= MIN_GRADED_N;
  return {
    courseId,
    ...courseMeta(courseId, courses),
    gradeRows: rows.length,
    graded: stats.graded,
    withdrawn: stats.withdrawn,
    gpa: stats.gpa,
    aRate: stats.aRate,
    wRate: stats.wRate,
    dfwRate: stats.dfwRate,
    baselineGpa,
    baselineN,
    delta: comparable ? (stats.gpa as number) - (baselineGpa as number) : null,
    buckets,
    isHeadline,
  };
}

function groupByCourse(rows: readonly GradeRow[]): Map<string, GradeRow[]> {
  const map = new Map<string, GradeRow[]>();
  for (const r of rows) {
    const list = map.get(r.courseId);
    if (list) list.push(r);
    else map.set(r.courseId, [r]);
  }
  return map;
}

function compareBreakdown(a: CourseBreakdown, b: CourseBreakdown): number {
  if (a.isHeadline !== b.isHeadline) return a.isHeadline ? -1 : 1;
  return a.subject.localeCompare(b.subject) || a.number.localeCompare(b.number) || a.courseId.localeCompare(b.courseId);
}

/** Per-course entries (headline and TA rows as separate entries) incl. leave-one-out baseline/delta. */
export function courseBreakdowns(professorId: string, ctx: AggregateContext): CourseBreakdown[] {
  const headlinePool = eligibleRows(ctx.allRows);
  const taPool = eligibleTaRows(ctx.allRows);
  const mineHeadline = rowsInScope(headlinePool, ctx.scope, ctx.subject).filter((r) => r.professorId === professorId);
  const mineTa = rowsInScope(taPool, ctx.scope, ctx.subject).filter((r) => r.professorId === professorId);
  const out: CourseBreakdown[] = [];
  for (const [courseId, rows] of groupByCourse(mineHeadline)) {
    out.push(buildBreakdown(professorId, courseId, rows, headlinePool, true, ctx.courses));
  }
  for (const [courseId, rows] of groupByCourse(mineTa)) {
    out.push(buildBreakdown(professorId, courseId, rows, taPool, false, ctx.courses));
  }
  return out.sort(compareBreakdown);
}

/** SPEC 8.2 + 8.3 for one professor. */
export function aggregateProfessorGrades(professorId: string, ctx: AggregateContext): GradeAggregate {
  const mine = rowsInScope(eligibleRows(ctx.allRows), ctx.scope, ctx.subject).filter((r) => r.professorId === professorId);
  const distribution = sumBuckets(mine);
  const stats = rowStats(distribution);
  const enough = stats.graded >= MIN_GRADED_N;

  const courses = courseBreakdowns(professorId, ctx);
  const headline = courses.filter((c) => c.isHeadline);
  const included = headline.filter((c) => c.delta !== null);
  const deltaComparableN = included.reduce((sum, c) => sum + c.graded, 0);
  const weightedDelta = included.reduce((sum, c) => sum + c.graded * (c.delta as number), 0);
  const gpaDelta = deltaComparableN >= MIN_GRADED_N ? weightedDelta / deltaComparableN : null;
  const soleInstructor =
    mine.length > 0 && included.length === 0 && headline.length > 0 && headline.every((c) => c.baselineN < MIN_BASELINE_N);

  return {
    gradeRows: mine.length,
    studentsGraded: stats.graded,
    withdrawn: stats.withdrawn,
    yearsActive: distinctYears(mine),
    gpaMean: enough ? stats.gpa : null,
    aRate: enough ? stats.aRate : null,
    wRate: enough ? stats.wRate : null,
    dfwRate: enough ? stats.dfwRate : null,
    distribution,
    gpaByYear: gpaByYear(mine),
    gpaDelta,
    deltaComparableN,
    soleInstructor,
    courses,
  };
}

/** Σ w / Σ students over eligible rows of the subject (SPEC 8.11 low-withdrawal); null when no students. */
export function subjectWRate(rows: readonly GradeRow[], subject: string): number | null {
  const scoped = rowsInScope(eligibleRows(rows), { kind: 'subject' }, subject);
  const stats = rowStats(sumBuckets(scoped));
  return stats.students === 0 ? null : stats.withdrawn / stats.students;
}

/** Enrollment-weighted GPA over eligible rows of the subject (RankingsPayload.subjectGpaMean). */
export function subjectGpaMean(rows: readonly GradeRow[], subject: string): number | null {
  const scoped = rowsInScope(eligibleRows(rows), { kind: 'subject' }, subject);
  const buckets = sumBuckets(scoped);
  const stats = rowStats(buckets);
  return stats.graded < MIN_GRADED_N ? null : gpaFromBuckets(buckets);
}

/** Per-year enrollment-weighted GPA with n = Σ graded; keeps years with n ≥ MIN_GRADED_N. */
export function gpaByYear(rows: readonly GradeRow[]): GpaPoint[] {
  const byYear = new Map<number, GradeRow[]>();
  for (const r of eligibleRows(rows)) {
    const list = byYear.get(r.year);
    if (list) list.push(r);
    else byYear.set(r.year, [r]);
  }
  const points: GpaPoint[] = [];
  for (const [year, yearRows] of byYear) {
    const buckets = sumBuckets(yearRows);
    const stats = rowStats(buckets);
    const gpa = gpaFromBuckets(buckets);
    if (stats.graded >= MIN_GRADED_N && gpa !== null) points.push({ year, gpa, n: stats.graded });
  }
  return points.sort((a, b) => a.year - b.year);
}
