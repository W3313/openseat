// Pure parser for the cougargrades/publicdata grade file `edu.uh.grade_distribution/records.csv`
// (MULTI_SCHOOL_DESIGN §4, §4.2 row `uh`). One source row = one (term, course, class section, instructor).
//
// Observed shape (bundle 2026-08-15, 201,366 rows, Fall 2013 – Spring 2026):
//   TERM,SUBJECT,CATALOG NBR,CLASS SECTION,COURSE DESCR,INSTR LAST NAME,INSTR FIRST NAME,
//   A,B,C,D,F,SATISFACTORY,NOT REPORTED,TOTAL DROPPED,AVG GPA
// - A–F are plain letters (no +/-): they map to the plain buckets; TOTAL DROPPED → w.
// - SATISFACTORY / NOT REPORTED are not letter grades: excluded from `graded`, counted per row in
//   `excludedGradeCodes`.
// - A count cell may be empty (= 0). AVG GPA is the university's own figure (it reflects +/- grades the CSV
//   collapses) and is kept as `sourceGpa` for display only; the GPA we show is recomputed from buckets.
// - 58 rows have both name cells blank → instructorRaw '' (course baselines only, never a professor).
// - A co-taught section is listed ONCE PER INSTRUCTOR with the SAME counts. Those rows are one section: the
//   counts are split across the instructors (largest-remainder rounding, file order) so course totals stay
//   exact. Rows that repeat the same section with different counts are distinct sections (kept as-is).
import { parse } from 'csv-parse/sync';
import type { GradeBuckets, TermCode } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { inGradeWindow, parseTermDisplay, termYear } from '@/lib/utils/term';

/** The exact upstream header, in order. A missing column is a schema error. */
export const UH_RECORDS_COLUMNS = [
  'TERM', 'SUBJECT', 'CATALOG NBR', 'CLASS SECTION', 'COURSE DESCR', 'INSTR LAST NAME', 'INSTR FIRST NAME',
  'A', 'B', 'C', 'D', 'F', 'SATISFACTORY', 'NOT REPORTED', 'TOTAL DROPPED', 'AVG GPA',
] as const;

/** Source grade codes that are not letter grades (§4: excluded from `graded`, reported in meta). */
export const UH_EXCLUDED_CODES = ['SATISFACTORY', 'NOT REPORTED'] as const;

/** CSV column → GradeBuckets key. Plain letters only (§4: "Letters without +/- map to the plain bucket"). */
export const UH_BUCKET_COLUMNS: readonly [string, keyof GradeBuckets][] = [
  ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['F', 'f'], ['TOTAL DROPPED', 'w'],
];

export class UhCsvSchemaError extends Error {
  constructor(message: string, public readonly column?: string) {
    super(message);
    this.name = 'UhCsvSchemaError';
  }
}

export class UhCsvRowError extends Error {
  constructor(message: string, public readonly line: number) {
    super(message);
    this.name = 'UhCsvRowError';
  }
}

/** RawGradeRow plus the §4.1 `sourceGpa` extra and the class section the row came from. */
export interface UhRawGradeRow extends RawGradeRow {
  /** AVG GPA as published (null when blank). Display only — ingest recomputes GPA from buckets. */
  sourceGpa: number | null;
  /** CLASS SECTION as printed ("1", "03", "101"). */
  section: string;
  /** Number of instructors the source section was split across (1 = not co-taught). */
  coInstructors: number;
}

export interface ParseUhRecordsOptions {
  onWarn?: (message: string) => void;
  maxWarnings?: number;
}

export interface ParseUhRecordsResult {
  rows: UhRawGradeRow[];
  /** Source rows carrying a non-zero excluded code, per code (§4 "with counts" = row counts, like Meta). Whole file. */
  excludedGradeCodes: Record<string, number>;
  /** The same row counts keyed by term, so the source can scope them to the grade window. */
  excludedByTerm: Record<string, Record<string, number>>;
  /** Emitted rows dropped because they held no letter grades and no drops (S/U-only or unreported). Whole file. */
  droppedRows: number;
  /** droppedRows keyed by term. */
  droppedByTerm: Record<string, number>;
  /** Sections whose identical rows were split across ≥ 2 instructors. */
  coTaughtSections: number;
  /** Source rows collapsed because they repeated the same section, instructor and counts. */
  mergedDuplicateRows: number;
  extraColumns: string[];
  warnings: string[];
}

const COUNT_RE = /^\d+$/;
const GPA_RE = /^\d+(\.\d+)?$/;

/** Throws UhCsvSchemaError naming the first missing column; returns the extra (unknown) columns. */
export function validateUhRecordsHeader(header: readonly string[]): string[] {
  const present = new Set(header.map((h) => h.trim()));
  for (const col of UH_RECORDS_COLUMNS) {
    if (!present.has(col)) throw new UhCsvSchemaError(`UH records.csv is missing required column "${col}"`, col);
  }
  const known = new Set<string>(UH_RECORDS_COLUMNS);
  return header.map((h) => h.trim()).filter((h) => !known.has(h));
}

/** "Last" + "First M." → "Last, First M."; either side may be blank; both blank → ''. */
export function joinInstructorName(last: string, first: string): string {
  const l = last.trim().replace(/\s+/g, ' ');
  const f = first.trim().replace(/\s+/g, ' ');
  if (l === '') return f;
  if (f === '') return l;
  return `${l}, ${f}`;
}

/** "Fall 2013" → "2013-fa"; null when the text is not a season + year. */
export function parseUhTerm(text: string): TermCode | null {
  return parseTermDisplay(text);
}

/** Split `total` into `parts` integers that sum to `total` (largest remainder: the first `total % parts` get +1). */
export function splitCount(total: number, parts: number): number[] {
  if (parts <= 1) return [total];
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

function firstLine(text: string): string {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const nl = body.indexOf('\n');
  return (nl < 0 ? body : body.slice(0, nl)).replace(/\r$/, '');
}

function countCell(record: Record<string, string>, col: string, line: number): number {
  const v = (record[col] ?? '').trim();
  if (v === '') return 0;
  if (!COUNT_RE.test(v)) throw new UhCsvRowError(`UH records.csv line ${line}: ${col}: expected a whole number, got "${v}"`, line);
  return Number(v);
}

function gpaCell(record: Record<string, string>, line: number): number | null {
  const v = (record['AVG GPA'] ?? '').trim();
  if (v === '') return null;
  if (!GPA_RE.test(v)) throw new UhCsvRowError(`UH records.csv line ${line}: AVG GPA: expected a decimal, got "${v}"`, line);
  const n = Number(v);
  if (n < 0 || n > 4) throw new UhCsvRowError(`UH records.csv line ${line}: AVG GPA ${n} is outside 0–4`, line);
  return n;
}

interface SourceRow {
  line: number; term: TermCode; termWord: string; subject: string; number: string; section: string; title: string;
  instructorRaw: string; buckets: GradeBuckets; sourceGpa: number | null;
}

function signature(r: SourceRow): string {
  return [r.buckets.a, r.buckets.b, r.buckets.c, r.buckets.d, r.buckets.f, r.buckets.w, r.sourceGpa ?? ''].join('|');
}

function toRaw(r: SourceRow, buckets: GradeBuckets, coInstructors: number): UhRawGradeRow {
  const graded = buckets.a + buckets.b + buckets.c + buckets.d + buckets.f;
  const students = graded + buckets.w;
  return {
    year: termYear(r.term), term: r.termWord, yearTerm: r.term, subject: r.subject, number: r.number, title: r.title,
    schedType: '', buckets, students, instructorRaw: r.instructorRaw,
    sourceGpa: graded === 0 ? null : r.sourceGpa, // the source prints "0" for sections with no letter grades — not a GPA
    section: r.section, coInstructors,
  };
}

/**
 * One section listing (rows sharing term/course/section AND identical counts) → one row per distinct
 * instructor with the counts split; duplicates of the same instructor collapse.
 */
function emitListing(rows: SourceRow[], out: UhRawGradeRow[], stats: { coTaught: number; merged: number }): void {
  const named = [...new Set(rows.filter((r) => r.instructorRaw !== '').map((r) => r.instructorRaw))];
  const instructors = named.length > 0 ? named : [''];
  stats.merged += rows.length - instructors.length;
  if (instructors.length > 1) stats.coTaught += 1;
  const first = rows[0];
  const shares: Partial<Record<keyof GradeBuckets, number[]>> = {};
  for (const [, key] of UH_BUCKET_COLUMNS) shares[key] = splitCount(first.buckets[key], instructors.length);
  instructors.forEach((instructorRaw, i) => {
    const buckets = { ...first.buckets };
    for (const [, key] of UH_BUCKET_COLUMNS) buckets[key] = shares[key]![i];
    const src = rows.find((r) => r.instructorRaw === instructorRaw) ?? first;
    out.push(toRaw({ ...src, instructorRaw }, buckets, instructors.length));
  });
}

/** Parse the whole file (no window filtering — see filterUhGradeWindow). */
export function parseUhRecordsCsv(text: string, opts: ParseUhRecordsOptions = {}): ParseUhRecordsResult {
  const { onWarn, maxWarnings = 20 } = opts;
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (warnings.length >= maxWarnings) return;
    warnings.push(msg);
    onWarn?.(msg);
  };
  const headerText = firstLine(text);
  if (headerText.trim() === '') throw new UhCsvSchemaError('UH records.csv is empty (no header row)');
  const headerRows = parse(headerText, { bom: true, trim: true }) as string[][];
  const extraColumns = validateUhRecordsHeader(headerRows[0] ?? []);
  if (extraColumns.length > 0) warn(`ignoring unknown CSV columns: ${extraColumns.join(', ')}`);

  const records = parse(text, { columns: true, bom: true, trim: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
  const excludedGradeCodes: Record<string, number> = Object.fromEntries(UH_EXCLUDED_CODES.map((c) => [c, 0]));
  const excludedByTerm: Record<string, Record<string, number>> = {};
  const groups = new Map<string, SourceRow[]>();
  const order: string[] = [];
  records.forEach((record, i) => {
    const line = i + 2;
    const termText = (record.TERM ?? '').trim();
    const term = parseUhTerm(termText);
    if (!term) throw new UhCsvRowError(`UH records.csv line ${line}: TERM "${termText}" is not "<Season> <Year>"`, line);
    const subject = (record.SUBJECT ?? '').trim().toUpperCase();
    const number = (record['CATALOG NBR'] ?? '').trim().toUpperCase();
    if (subject === '' || number === '') throw new UhCsvRowError(`UH records.csv line ${line}: SUBJECT / CATALOG NBR must not be blank`, line);
    const buckets: GradeBuckets = {
      aPlus: 0, a: 0, aMinus: 0, bPlus: 0, b: 0, bMinus: 0, cPlus: 0, c: 0, cMinus: 0, dPlus: 0, d: 0, dMinus: 0, f: 0, w: 0,
    };
    for (const [col, key] of UH_BUCKET_COLUMNS) buckets[key] = countCell(record, col, line);
    const perTerm = (excludedByTerm[term] ??= Object.fromEntries(UH_EXCLUDED_CODES.map((c) => [c, 0])));
    for (const code of UH_EXCLUDED_CODES) {
      if (countCell(record, code, line) > 0) {
        excludedGradeCodes[code] += 1;
        perTerm[code] += 1;
      }
    }
    const row: SourceRow = {
      line, term, termWord: termText.split(/\s+/)[0], subject, number, section: (record['CLASS SECTION'] ?? '').trim(),
      title: (record['COURSE DESCR'] ?? '').trim(),
      instructorRaw: joinInstructorName(record['INSTR LAST NAME'] ?? '', record['INSTR FIRST NAME'] ?? ''),
      buckets, sourceGpa: gpaCell(record, line),
    };
    const key = `${term}|${subject}|${number}|${row.section}|${signature(row)}`;
    const g = groups.get(key);
    if (g) g.push(row);
    else {
      groups.set(key, [row]);
      order.push(key);
    }
  });

  const emitted: UhRawGradeRow[] = [];
  const stats = { coTaught: 0, merged: 0 };
  for (const key of order) emitListing(groups.get(key)!, emitted, stats);
  const rows = emitted.filter((r) => r.students > 0);
  const droppedByTerm: Record<string, number> = {};
  for (const r of emitted) if (!(r.students > 0)) droppedByTerm[r.yearTerm] = (droppedByTerm[r.yearTerm] ?? 0) + 1;
  return {
    rows, excludedGradeCodes, excludedByTerm, droppedRows: emitted.length - rows.length, droppedByTerm,
    coTaughtSections: stats.coTaught, mergedDuplicateRows: stats.merged, extraColumns, warnings,
  };
}

/** §4 bookkeeping scoped to the grade window: excluded-code row counts and dropped rows over in-window terms only. */
export function scopeUhBookkeeping(
  parsed: Pick<ParseUhRecordsResult, 'excludedByTerm' | 'droppedByTerm'>,
  currentTerm: TermCode,
  yearsBack: number,
): { excludedGradeCodes: Record<string, number>; droppedRows: number } {
  const excludedGradeCodes: Record<string, number> = Object.fromEntries(UH_EXCLUDED_CODES.map((c) => [c, 0]));
  let droppedRows = 0;
  for (const [term, counts] of Object.entries(parsed.excludedByTerm)) {
    if (!inGradeWindow(term as TermCode, currentTerm, yearsBack)) continue;
    for (const [code, n] of Object.entries(counts)) excludedGradeCodes[code] = (excludedGradeCodes[code] ?? 0) + n;
  }
  for (const [term, n] of Object.entries(parsed.droppedByTerm)) if (inGradeWindow(term as TermCode, currentTerm, yearsBack)) droppedRows += n;
  return { excludedGradeCodes, droppedRows };
}

/** Keep rows whose term ordinal ≥ ordinal(currentTerm) − 10·yearsBack (SPEC 8.1); the type is preserved. */
export function filterUhGradeWindow<T extends RawGradeRow>(rows: readonly T[], currentTerm: TermCode, yearsBack: number): { kept: T[]; discarded: number } {
  const kept: T[] = [];
  let discarded = 0;
  for (const row of rows) {
    if (inGradeWindow(row.yearTerm as TermCode, currentTerm, yearsBack)) kept.push(row);
    else discarded += 1;
  }
  return { kept, discarded };
}
