// SPEC 8.1 row-level grade formulas. Pure functions over GradeBuckets; every aggregate in this module
// (aggregate.ts) is built by summing (weighted) buckets and re-applying these formulas to the sum.
// MULTI_SCHOOL_DESIGN §4.1: percent-only rows carry buckets summing to 100 with weight 1, so summing
// their buckets weights every section equally.
import type { GradeBuckets, GradeRow } from '@/lib/domain/types';
import { TA_SCHED_TYPES } from '@/lib/domain/types';
import { BUCKET_KEYS, GPA_POINTS, LETTER_BUCKET_KEYS, MIN_GRADED_N } from '@/lib/domain/constants';

export interface RowStats {
  graded: number;           // Σ letter counts (excludes w)
  withdrawn: number;        // = w
  students: number;         // graded + withdrawn
  gpa: number | null;       // Σ(count × GPA_POINTS) / graded; null when graded === 0
  aRate: number | null;     // (aPlus + a + aMinus) / graded
  wRate: number | null;     // w / students
  dfwRate: number | null;   // (dPlus + d + dMinus + f + w) / students
}

export const EMPTY_BUCKETS: Readonly<GradeBuckets> = Object.freeze({
  aPlus: 0, a: 0, aMinus: 0, bPlus: 0, b: 0, bMinus: 0, cPlus: 0, c: 0, cMinus: 0, dPlus: 0, d: 0, dMinus: 0, f: 0, w: 0,
});

/** Element-wise sum; no arguments → a fresh copy of EMPTY_BUCKETS. */
export function addBuckets(...buckets: readonly GradeBuckets[]): GradeBuckets {
  const out: GradeBuckets = { ...EMPTY_BUCKETS };
  for (const b of buckets) {
    for (const key of BUCKET_KEYS) out[key] += b[key] ?? 0;
  }
  return out;
}

/** Element-wise scale (weighted aggregation, §4.1); weight 1 returns a plain copy. */
export function scaleBuckets(buckets: GradeBuckets, weight: number): GradeBuckets {
  const out: GradeBuckets = { ...EMPTY_BUCKETS };
  for (const key of BUCKET_KEYS) out[key] = (buckets[key] ?? 0) * weight;
  return out;
}

/** GradeRow.weight with the §4.1 default of 1 (non-finite or negative weights count as 1). */
export function rowWeight(row: Pick<GradeRow, 'weight'>): number {
  const w = row.weight;
  return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : 1;
}

/** Σ weight × buckets over rows — the one summation every aggregate uses. */
export function sumWeightedBuckets(rows: readonly Pick<GradeRow, 'buckets' | 'weight'>[]): GradeBuckets {
  return addBuckets(...rows.map((r) => (rowWeight(r) === 1 ? r.buckets : scaleBuckets(r.buckets, rowWeight(r)))));
}

/** True when there is at least one row and every row is percent-only (§4.1: counts are sections, not students). */
export function isPercentOnly(rows: readonly Pick<GradeRow, 'percentOnly'>[]): boolean {
  return rows.length > 0 && rows.every((r) => r.percentOnly === true);
}

/** Σ letter counts (13 buckets, excludes w). */
export function gradedCount(buckets: GradeBuckets): number {
  let total = 0;
  for (const key of LETTER_BUCKET_KEYS) total += buckets[key] ?? 0;
  return total;
}

/** Σ(count_g × GPA_POINTS[g]) / graded; null when graded === 0. */
export function gpaFromBuckets(buckets: GradeBuckets): number | null {
  const graded = gradedCount(buckets);
  if (graded === 0) return null;
  let points = 0;
  for (const key of LETTER_BUCKET_KEYS) points += (buckets[key] ?? 0) * GPA_POINTS[key];
  return points / graded;
}

/** All 8.1 row statistics at once. */
export function rowStats(buckets: GradeBuckets): RowStats {
  const graded = gradedCount(buckets);
  const withdrawn = buckets.w ?? 0;
  const students = graded + withdrawn;
  const gpa = gpaFromBuckets(buckets);
  const aCount = (buckets.aPlus ?? 0) + (buckets.a ?? 0) + (buckets.aMinus ?? 0);
  const dfwCount = (buckets.dPlus ?? 0) + (buckets.d ?? 0) + (buckets.dMinus ?? 0) + (buckets.f ?? 0) + withdrawn;
  return {
    graded,
    withdrawn,
    students,
    gpa,
    aRate: graded === 0 ? null : aCount / graded,
    wRate: students === 0 ? null : withdrawn / students,
    dfwRate: students === 0 ? null : dfwCount / students,
  };
}

/** graded < MIN_GRADED_N (10). */
export function isSuppressed(graded: number): boolean {
  return graded < MIN_GRADED_N;
}

/** Upper-case; '' → 'UNKNOWN' (SPEC 6.2). */
export function normalizeSchedType(raw: string): string {
  const trimmed = (raw ?? '').trim().toUpperCase();
  return trimmed === '' ? 'UNKNOWN' : trimmed;
}

/** !TA_SCHED_TYPES.has(schedType). */
export function isHeadlineSchedType(schedType: string): boolean {
  return !TA_SCHED_TYPES.has(normalizeSchedType(schedType));
}
