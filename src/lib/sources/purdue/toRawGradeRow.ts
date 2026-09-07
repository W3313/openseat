// BoilerGradesRow → RawGradeRow under the percent-only rule (MULTI_SCHOOL_DESIGN §4.1): every section is
// one row whose buckets are the letter + W percentages scaled to integers summing to 100, students = 100,
// weight = 1, percentOnly = true. Excluded codes (S/U, P, I, AU, …) are counted per code; sections with
// less than MIN_LETTER_SHARE_PCT of letter grades are dropped and counted.
//
// Two data-quality rules learned from the real files (2026-09-06):
// - A CRN can appear more than once for the same term and instructor: the full distribution plus one or
//   more coarse sub-cohort rows ("A+ 33.3 / A 66.7", "A 100"). Only one row per (term, CRN) survives — the
//   one with the most non-zero grade codes — and the rest are counted in meta.droppedRows ('duplicate-crn').
// - A row whose percentages are all multiples of 1/n for a single n ≤ MAX_TINY_COHORT_N (100; 50/50;
//   33.3/66.7; 33.3/33.3/33.3) implies a cohort of at most n students. It is kept for provenance but emitted with
//   `suppressed: true`, so it never enters an aggregate (the §4.1 equal-section weighting would otherwise
//   count a two-student cohort as a full section).
import type { GradeBuckets } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { SEASON_WORD, termSeason, termYear } from '@/lib/utils/term';
import { CODE_TO_BUCKET, EXCLUDED_CODES, MIN_LETTER_SHARE_PCT, scalePercentBuckets } from './gradeCodes';
import type { BoilerGradesRow } from './parseBoilerGradesCsv';

/** The §4/§4.1 extras ingest reads off a RawGradeRow (scripts/ingest/gradeRows.ts RawGradeRowExtras). */
export type PurdueRawGradeRow = RawGradeRow & {
  percentOnly: true;
  weight: 1;
  /** True when the published percentages imply ≤ MAX_TINY_COHORT_N students (kept for provenance, excluded from aggregates). */
  suppressed?: true;
  /** Boiler-grades section number and CRN, kept for provenance ('' in the aggregate file). */
  section: string;
  crn: string;
};

export type DropReason = 'no-letter-grades' | 'letter-share-below-minimum' | 'duplicate-crn';

export interface ConvertResult {
  rows: PurdueRawGradeRow[];
  /** Source rows dropped (§4: recorded in meta.droppedRows) — duplicates and rows without a letter curve. */
  droppedRows: number;
  dropped: { row: BoilerGradesRow; reason: DropReason; letterSharePct: number }[];
  /** Rows kept but marked suppressed because their percentages imply a cohort of ≤ MAX_TINY_COHORT_N students. */
  tinyCohortRows: number;
  /** Excluded code → number of source rows where it was non-zero (§4: meta.excludedGradeCodes). */
  excludedGradeCodes: Record<string, number>;
  /** Codes present in the file that are neither bucketed nor on the excluded list (should be empty). */
  unknownCodes: string[];
}

/** Largest cohort size a set of percentages can "prove"; rows fitting n ≤ this are suppressed (25/75 could be a real 20-student section, so 4 is out). */
export const MAX_TINY_COHORT_N = 3;
/** Tolerance (percentage points) when testing whether a published value equals k/n × 100. */
const COHORT_TOLERANCE_PCT = 0.15;

/** Percentages by bucket, summing codes that share a bucket (F + E + FN + IF → f; W + WF + WN + WU → w). */
export function bucketPercentages(pct: Readonly<Record<string, number>>): Partial<Record<keyof GradeBuckets, number>> {
  const out: Partial<Record<keyof GradeBuckets, number>> = {};
  for (const [code, value] of Object.entries(pct)) {
    const key = CODE_TO_BUCKET[code];
    if (!key || !(value > 0)) continue;
    out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

/** Number of grade codes (any code) with a non-zero percentage — the "resolution" of a row. */
export function nonZeroCodes(row: Pick<BoilerGradesRow, 'pct'>): number {
  return Object.values(row.pct).filter((v) => v > 0).length;
}

/**
 * Smallest n ≤ MAX_TINY_COHORT_N such that every non-zero percentage equals k/n × 100 (k ≥ 1 integer) and
 * Σk = n; null when the row cannot come from so small a cohort. {100} → 1, {50, 50} → 2, {33.3, 66.7} → 3,
 * {25, 25, 50} → null (n = 4 > MAX_TINY_COHORT_N), {23.1, 76.9} → null.
 */
export function impliedCohortSize(row: Pick<BoilerGradesRow, 'pct'>): number | null {
  const values = Object.values(row.pct).filter((v) => v > 0);
  if (values.length === 0) return null;
  for (let n = 1; n <= MAX_TINY_COHORT_N; n += 1) {
    let sumK = 0;
    let fits = true;
    for (const v of values) {
      const k = Math.round((v * n) / 100);
      if (k < 1 || Math.abs((k * 100) / n - v) > COHORT_TOLERANCE_PCT) {
        fits = false;
        break;
      }
      sumK += k;
    }
    if (fits && sumK === n) return n;
  }
  return null;
}

/**
 * One row per (term, CRN): the row with the most non-zero codes wins (ties: the one whose percentages
 * imply the larger cohort, then the later line). Rows without a CRN (the per-instructor aggregate file)
 * are never merged.
 */
export function dedupeByCrn(rows: readonly BoilerGradesRow[]): { kept: BoilerGradesRow[]; duplicates: BoilerGradesRow[] } {
  const best = new Map<string, BoilerGradesRow>();
  const duplicates: BoilerGradesRow[] = [];
  const order: string[] = [];
  const noCrn: BoilerGradesRow[] = [];
  const rank = (r: BoilerGradesRow): [number, number, number] => [nonZeroCodes(r), impliedCohortSize(r) ?? Number.MAX_SAFE_INTEGER, r.line];
  for (const row of rows) {
    if (row.crn === '') {
      noCrn.push(row);
      continue;
    }
    const key = `${row.term}|${row.crn}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      order.push(key);
      continue;
    }
    const [a, b] = [rank(current), rank(row)];
    const rowWins = b[0] !== a[0] ? b[0] > a[0] : b[1] !== a[1] ? b[1] > a[1] : b[2] > a[2];
    if (rowWins) {
      duplicates.push(current);
      best.set(key, row);
    } else duplicates.push(row);
  }
  const kept = [...order.map((k) => best.get(k)!), ...noCrn].sort((x, y) => x.line - y.line);
  return { kept, duplicates };
}

/** One section → RawGradeRow, or null with a reason when it carries no usable curve. */
export function toRawGradeRow(row: BoilerGradesRow): { row: PurdueRawGradeRow } | { reason: DropReason; letterSharePct: number } {
  const scaled = scalePercentBuckets(bucketPercentages(row.pct));
  if (!scaled) return { reason: 'no-letter-grades', letterSharePct: 0 };
  if (scaled.letterSharePct < MIN_LETTER_SHARE_PCT) return { reason: 'letter-share-below-minimum', letterSharePct: scaled.letterSharePct };
  const tiny = impliedCohortSize(row) !== null;
  return {
    row: {
      year: termYear(row.term),
      term: SEASON_WORD[termSeason(row.term)],
      yearTerm: row.term,
      subject: row.subject,
      number: row.number,
      title: row.title,
      schedType: '',                       // Purdue publishes no schedule type → ingest maps '' to UNKNOWN (headline)
      buckets: scaled.buckets,
      students: 100,
      instructorRaw: row.instructorRaw.trim(),
      percentOnly: true,
      weight: 1,
      ...(tiny ? { suppressed: true as const } : {}),
      section: row.section,
      crn: row.crn,
    },
  };
}

/** Convert every parsed row (after CRN dedupe); collects the §4 bookkeeping. */
export function convertRows(rows: readonly BoilerGradesRow[]): ConvertResult {
  const out: PurdueRawGradeRow[] = [];
  const dropped: ConvertResult['dropped'] = [];
  const excludedGradeCodes: Record<string, number> = {};
  const unknown = new Set<string>();
  const excluded = new Set(EXCLUDED_CODES);
  let tinyCohortRows = 0;
  const { kept, duplicates } = dedupeByCrn(rows);
  for (const row of duplicates) dropped.push({ row, reason: 'duplicate-crn', letterSharePct: 0 });
  for (const row of kept) {
    for (const [code, value] of Object.entries(row.pct)) {
      if (!(value > 0)) continue;
      if (excluded.has(code)) excludedGradeCodes[code] = (excludedGradeCodes[code] ?? 0) + 1;
      else if (!CODE_TO_BUCKET[code]) unknown.add(code);
    }
    const converted = toRawGradeRow(row);
    if ('row' in converted) {
      out.push(converted.row);
      if (converted.row.suppressed) tinyCohortRows += 1;
    } else dropped.push({ row, reason: converted.reason, letterSharePct: converted.letterSharePct });
  }
  dropped.sort((a, b) => a.row.line - b.row.line);
  return { rows: out, droppedRows: dropped.length, dropped, tinyCohortRows, excludedGradeCodes, unknownCodes: [...unknown].sort() };
}
