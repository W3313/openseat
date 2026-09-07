// Parser for the UIUC GPA dataset CSV (SPEC 6.2 "UiucGpaCsvSource", SOURCE_FACTS 1). Pure: takes the
// file text, returns RawGradeRow[]. Used by UiucGpaCsvSource; the 23-column contract is exercised on the
// committed fixture (tests/fixtures/uiuc-gpa-sample.csv).
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { GradeBuckets, TermCode } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { inGradeWindow, isTermCode } from '@/lib/utils/term';

/** The exact upstream header, in order. A missing or renamed column is a schema error. */
export const GPA_CSV_COLUMNS = [
  'Year', 'Term', 'YearTerm', 'Subject', 'Number', 'Course Title', 'Sched Type',
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'W',
  'Students', 'Primary Instructor',
] as const;

export type GpaCsvColumn = (typeof GPA_CSV_COLUMNS)[number];

export type BucketColumn =
  | 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F' | 'W';

/** CSV column → GradeBuckets key, in CSV order. */
export const BUCKET_COLUMNS: readonly [BucketColumn, keyof GradeBuckets][] = [
  ['A+', 'aPlus'], ['A', 'a'], ['A-', 'aMinus'], ['B+', 'bPlus'], ['B', 'b'], ['B-', 'bMinus'],
  ['C+', 'cPlus'], ['C', 'c'], ['C-', 'cMinus'], ['D+', 'dPlus'], ['D', 'd'], ['D-', 'dMinus'],
  ['F', 'f'], ['W', 'w'],
];

export class CsvSchemaError extends Error {
  constructor(message: string, public readonly column?: string) {
    super(message);
    this.name = 'CsvSchemaError';
  }
}

export class CsvRowError extends Error {
  constructor(message: string, public readonly line: number) {
    super(message);
    this.name = 'CsvRowError';
  }
}

const YEAR_TERM_RE = /^\d{4}-(fa|sp|su|wi)$/;
const count = z.coerce.number().int().min(0);

const RowSchema = z.object({
  Year: z.coerce.number().int().min(1900).max(2200),
  Term: z.string().min(1),
  YearTerm: z.string().regex(YEAR_TERM_RE, 'expected YYYY-(fa|sp|su|wi)'),
  Subject: z.string().min(1).transform((s) => s.toUpperCase()),
  Number: z.string().min(1).transform((s) => s.toUpperCase()),
  'Course Title': z.string(),
  'Sched Type': z.string(),
  'A+': count, A: count, 'A-': count, 'B+': count, B: count, 'B-': count,
  'C+': count, C: count, 'C-': count, 'D+': count, D: count, 'D-': count, F: count, W: count,
  Students: count,
  'Primary Instructor': z.string(),
});

export interface ParseGpaCsvOptions {
  /** Called for the first `maxWarnings` non-fatal problems (students ≠ Σ buckets, extra columns, ...). */
  onWarn?: (message: string) => void;
  /**
   * Cap on warnings kept/forwarded (the upstream file has ~12k rows whose Students cell is off by one, so
   * callers report `studentsMismatch` as a single count instead). Default 20.
   */
  maxWarnings?: number;
}

export interface ParseGpaCsvResult {
  rows: RawGradeRow[];
  /** Header columns beyond the 23 known ones (ignored). */
  extraColumns: string[];
  warnings: string[];
  /** Rows whose Students cell disagreed with Σ buckets (buckets were trusted). */
  studentsMismatch: number;
}

/** Normalize the Sched Type cell: upper-cased, '' → 'UNKNOWN'. */
export function normalizeSchedTypeCell(raw: string): string {
  const t = raw.trim().toUpperCase();
  return t === '' ? 'UNKNOWN' : t;
}

/** Throws CsvSchemaError naming the first missing column. Returns the extra (unknown) columns. */
export function validateGpaCsvHeader(header: readonly string[]): string[] {
  const present = new Set(header.map((h) => h.trim()));
  for (const col of GPA_CSV_COLUMNS) {
    if (!present.has(col)) {
      throw new CsvSchemaError(`GPA CSV is missing required column "${col}"`, col);
    }
  }
  const known = new Set<string>(GPA_CSV_COLUMNS);
  return header.map((h) => h.trim()).filter((h) => !known.has(h));
}

function firstLine(text: string): string {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const nl = body.indexOf('\n');
  return (nl < 0 ? body : body.slice(0, nl)).replace(/\r$/, '');
}

/** Parse the full CSV text into RawGradeRow[] (no window filtering — see filterGradeWindow). */
export function parseGpaCsv(text: string, opts: ParseGpaCsvOptions = {}): ParseGpaCsvResult {
  const { onWarn, maxWarnings = 20 } = opts;
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (warnings.length >= maxWarnings) return;
    warnings.push(msg);
    onWarn?.(msg);
  };

  const headerText = firstLine(text);
  if (headerText.trim() === '') throw new CsvSchemaError('GPA CSV is empty (no header row)');
  const headerRows = parse(headerText, { bom: true, trim: true }) as string[][];
  const extraColumns = validateGpaCsvHeader(headerRows[0] ?? []);
  if (extraColumns.length > 0) warn(`ignoring unknown CSV columns: ${extraColumns.join(', ')}`);

  const records = parse(text, {
    columns: true,
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: RawGradeRow[] = [];
  let studentsMismatch = 0;
  records.forEach((record, i) => {
    const line = i + 2; // 1-based, after the header
    const parsed = RowSchema.safeParse(record);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new CsvRowError(
        `GPA CSV line ${line}: ${issue?.path.join('.') ?? '(row)'}: ${issue?.message ?? 'invalid'}`,
        line,
      );
    }
    const r = parsed.data;
    const buckets = {} as GradeBuckets;
    let sum = 0;
    for (const [col, key] of BUCKET_COLUMNS) {
      buckets[key] = r[col];
      sum += r[col];
    }
    if (r.Students !== sum) {
      studentsMismatch += 1;
      warn(`line ${line}: Students=${r.Students} but Σ buckets=${sum}; trusting buckets`);
    }
    rows.push({
      year: r.Year,
      term: r.Term,
      yearTerm: r.YearTerm,
      subject: r.Subject,
      number: r.Number,
      title: r['Course Title'],
      schedType: normalizeSchedTypeCell(r['Sched Type']),
      buckets,
      students: sum,
      instructorRaw: r['Primary Instructor'].trim(),
    });
  });

  return { rows, extraColumns, warnings, studentsMismatch };
}

/** Keep rows whose yearTerm ordinal ≥ ordinal(currentTerm) − 10·yearsBack (SPEC 6.2 / 8.1). */
export function filterGradeWindow(
  rows: readonly RawGradeRow[],
  currentTerm: TermCode,
  yearsBack: number,
): { kept: RawGradeRow[]; discarded: number } {
  const kept: RawGradeRow[] = [];
  let discarded = 0;
  for (const row of rows) {
    if (isTermCode(row.yearTerm) && inGradeWindow(row.yearTerm, currentTerm, yearsBack)) kept.push(row);
    else discarded += 1;
  }
  return { kept, discarded };
}
