// Purdue grade-code vocabulary and the percent-only rule (MULTI_SCHOOL_DESIGN §4, §4.1). Pure helpers
// shared by the boiler-grades CSV parser and the tests.
//
// Codes seen in the upstream files (sql.commands of eduxstad/boiler-grades):
//   letters   A+ A A- B+ B B- C+ C C- D+ D D- F     → the matching GradeBuckets key
//   failing   E (= F), FN (F for non-attendance), IF (incomplete lapsed to F)   → f
//   withdraw  W, WF (withdrew failing), WN, WU      → w
//   excluded  AU (audit), I (incomplete), N, NS, P, PI (pass), S, SI, U (satisfactory/unsatisfactory)
import type { GradeBuckets } from '@/lib/domain/types';
import { BUCKET_KEYS, LETTER_BUCKET_KEYS } from '@/lib/domain/constants';

/** Source grade code → bucket. Codes missing here are excluded (counted in meta.excludedGradeCodes) or unknown. */
export const CODE_TO_BUCKET: Readonly<Record<string, keyof GradeBuckets>> = Object.freeze({
  'A+': 'aPlus', A: 'a', 'A-': 'aMinus',
  'B+': 'bPlus', B: 'b', 'B-': 'bMinus',
  'C+': 'cPlus', C: 'c', 'C-': 'cMinus',
  'D+': 'dPlus', D: 'd', 'D-': 'dMinus',
  F: 'f', E: 'f', FN: 'f', IF: 'f',
  W: 'w', WF: 'w', WN: 'w', WU: 'w',
});

/** Codes that never enter `graded` (§4): recorded with row counts in meta.excludedGradeCodes. */
export const EXCLUDED_CODES: readonly string[] = Object.freeze(['AU', 'I', 'N', 'NS', 'P', 'PI', 'S', 'SI', 'U']);

export const KNOWN_CODES: ReadonlySet<string> = new Set([...Object.keys(CODE_TO_BUCKET), ...EXCLUDED_CODES]);

/**
 * Header cell → canonical grade code. Handles the SQL-style spellings of the `_db` exports
 * (`a_minus`, `a_plus`, `i_f`, `p_i`, `s_i`, `w_f`, `w_n`, `w_u`) and case. Returns null for
 * anything that is not a grade code (meta columns, `blank`, '').
 */
export function normalizeGradeCode(header: string): string | null {
  const code = header
    .trim()
    .toUpperCase()
    .replace(/_MINUS$/, '-')
    .replace(/_PLUS$/, '+')
    .replace(/_/g, '');
  return KNOWN_CODES.has(code) ? code : null;
}

/** "23.1%" | "23.1" | " 0.6 % " → 23.1; '' → 0; anything else → NaN. */
export function parsePercentCell(cell: string): number {
  const t = cell.trim();
  if (t === '') return 0;
  const m = /^(\d+(?:\.\d+)?)\s*%?$/.exec(t);
  return m ? Number(m[1]) : Number.NaN;
}

/**
 * Sections with fewer letter grades than this share (percent of the section) carry no curve worth
 * ranking — pass/fail seminars, research credit, sections that are mostly incompletes. They are dropped
 * and counted in meta.droppedRows.
 */
export const MIN_LETTER_SHARE_PCT = 50;

export interface PercentBuckets {
  /** Letter + W percentages, renormalised to sum 100 and rounded by largest remainder. */
  buckets: GradeBuckets;
  /** Σ letter percentages as published (before renormalising) — the share of the section that got a letter. */
  letterSharePct: number;
  /** Σ (letters + W) as published; excluded codes make up the rest of the 100. */
  countedSharePct: number;
}

/**
 * §4.1 percent-only rule: take the letter + W percentages, renormalise them so they sum to 100 (excluded
 * codes such as S/U/I/AU drop out of the denominator) and round to integers by largest remainder, ties
 * broken in bucket order (A+ … F, W) so the result is deterministic. Returns null when nothing counted.
 */
export function scalePercentBuckets(pct: Readonly<Partial<Record<keyof GradeBuckets, number>>>): PercentBuckets | null {
  const raw = {} as GradeBuckets;
  let total = 0;
  let letters = 0;
  for (const key of BUCKET_KEYS) {
    const v = pct[key];
    const n = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
    raw[key] = n;
    total += n;
  }
  for (const key of LETTER_BUCKET_KEYS) letters += raw[key];
  if (total <= 0) return null;

  const buckets = {} as GradeBuckets;
  const remainders: { key: keyof GradeBuckets; frac: number; order: number }[] = [];
  let assigned = 0;
  BUCKET_KEYS.forEach((key, order) => {
    const exact = (raw[key] * 100) / total;
    const floor = Math.floor(exact);
    buckets[key] = floor;
    assigned += floor;
    remainders.push({ key, frac: exact - floor, order });
  });
  remainders.sort((a, b) => b.frac - a.frac || a.order - b.order);
  for (let i = 0; i < 100 - assigned && i < remainders.length; i += 1) buckets[remainders[i].key] += 1;

  return { buckets, letterSharePct: letters, countedSharePct: total };
}

/** Sum of every value in a GradeBuckets (letters + w). */
export function sumBuckets(b: GradeBuckets): number {
  let s = 0;
  for (const key of BUCKET_KEYS) s += b[key];
  return s;
}
