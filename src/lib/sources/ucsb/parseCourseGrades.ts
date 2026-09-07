// Parser for the Daily Nexus UCSB grades CSV (MULTI_SCHOOL_DESIGN §4, §4.2 "ucsb"). Pure: text in,
// RawGradeRow[] out. One row = one (course, instructor, quarter) aggregate of students who received each
// letter grade (before P/NP or S/U conversion), courses with ≥ 5 students only, Fall 2009 → Spring 2026.
//
// Header (exact, 25 columns):
//   course,instructor,quarter,year,A,B,C,D,F,nLetterStudents,nPNPStudents,avgGPA,P,dept,S,su,Ap,Bp,Cp,Dp,Am,Bm,Cm,Dm,IP
// Bucket rules (§4): Ap/A/Am … Dm/F → the plus-minus buckets; there is NO withdrawal column (w = 0);
// P, NP (= nPNPStudents − P), S, su (unsatisfactory) and IP are excluded from `graded` and counted in
// `excludedGradeCodes`; rows with no letter grades at all (P/NP-only or S/U-only course instances) carry
// nothing rankable and are dropped (counted in `droppedRows`). `avgGPA` is kept as `sourceGpa` — the
// Registrar computes it on the 3.7/3.3 scale, ProfPeek recomputes GPA from buckets with GPA_POINTS.
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { GradeBuckets } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { parseUcsbCourseId } from './courseId';
import { toCommaForm } from './instructor';
import { termFromQuarterWord } from './quarter';

export const COURSE_GRADES_COLUMNS = [
  'course', 'instructor', 'quarter', 'year', 'A', 'B', 'C', 'D', 'F', 'nLetterStudents', 'nPNPStudents',
  'avgGPA', 'P', 'dept', 'S', 'su', 'Ap', 'Bp', 'Cp', 'Dp', 'Am', 'Bm', 'Cm', 'Dm', 'IP',
] as const;

export type CourseGradesColumn = (typeof COURSE_GRADES_COLUMNS)[number];
export type LetterColumn = 'Ap' | 'A' | 'Am' | 'Bp' | 'B' | 'Bm' | 'Cp' | 'C' | 'Cm' | 'Dp' | 'D' | 'Dm' | 'F';

/** CSV letter column → GradeBuckets key (W has no column; it is always 0). */
export const LETTER_COLUMNS: readonly [LetterColumn, keyof GradeBuckets][] = [
  ['Ap', 'aPlus'], ['A', 'a'], ['Am', 'aMinus'], ['Bp', 'bPlus'], ['B', 'b'], ['Bm', 'bMinus'],
  ['Cp', 'cPlus'], ['C', 'c'], ['Cm', 'cMinus'], ['Dp', 'dPlus'], ['D', 'd'], ['Dm', 'dMinus'], ['F', 'f'],
];

/** Non-letter codes the source publishes, in the order they are reported. NP is derived (nPNPStudents − P). */
export const EXCLUDED_GRADE_CODES = ['P', 'NP', 'S', 'U', 'IP'] as const;
export type ExcludedGradeCode = (typeof EXCLUDED_GRADE_CODES)[number];

export class UcsbCsvSchemaError extends Error {
  constructor(message: string, public readonly column?: string) {
    super(message);
    this.name = 'UcsbCsvSchemaError';
  }
}

export class UcsbCsvRowError extends Error {
  constructor(message: string, public readonly line: number) {
    super(message);
    this.name = 'UcsbCsvRowError';
  }
}

/** Blank cells mean 0 (the `su` column is float-formatted "1.0" and sometimes empty). */
const count = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? '0' : v), z.coerce.number().int().min(0));
const gpa = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? '0' : v), z.coerce.number().min(0).max(4.5));

const RowSchema = z.object({
  course: z.string().min(1),
  instructor: z.string(),
  quarter: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2999),
  A: count, B: count, C: count, D: count, F: count,
  nLetterStudents: count,
  nPNPStudents: count,
  avgGPA: gpa,
  P: count,
  dept: z.string(),
  S: count, su: count,
  Ap: count, Bp: count, Cp: count, Dp: count,
  Am: count, Bm: count, Cm: count, Dm: count,
  IP: count,
});

/** A RawGradeRow plus the §4.1 extras ingest reads off it (scripts/ingest/gradeRows.ts RawGradeRowExtras). */
export type UcsbRawGradeRow = RawGradeRow & { sourceGpa: number | null };

export interface ParseCourseGradesOptions {
  onWarn?: (message: string) => void;
  /** Cap on warnings kept/forwarded. Default 20. */
  maxWarnings?: number;
}

export interface ParseCourseGradesResult {
  rows: UcsbRawGradeRow[];
  extraColumns: string[];
  warnings: string[];
  /** Rows (dropped rows included) where the excluded code was non-zero, over the whole file (§4 "with counts" = row counts). */
  excludedGradeCodes: Record<ExcludedGradeCode, number>;
  /** The same row counts keyed by yearTerm, so the source can scope them to the grade window. */
  excludedByTerm: Record<string, Record<ExcludedGradeCode, number>>;
  /** Rows with zero letter grades (P/NP- or S/U-only) — nothing rankable, not emitted. Whole file. */
  droppedRows: number;
  /** droppedRows keyed by yearTerm (malformed rows have no term and are not included). */
  droppedByTerm: Record<string, number>;
  /** Rows whose course id or quarter could not be parsed (not emitted; also warned). */
  malformedRows: number;
  /** Rows whose nLetterStudents disagreed with Σ letter buckets (buckets were trusted). */
  lettersMismatch: number;
}

/** Throws UcsbCsvSchemaError naming the first missing column; returns the extra (unknown) columns. */
export function validateCourseGradesHeader(header: readonly string[]): string[] {
  const present = new Set(header.map((h) => h.trim()));
  for (const col of COURSE_GRADES_COLUMNS) {
    if (!present.has(col)) throw new UcsbCsvSchemaError(`UCSB grades CSV is missing required column "${col}"`, col);
  }
  const known = new Set<string>(COURSE_GRADES_COLUMNS);
  return header.map((h) => h.trim()).filter((h) => !known.has(h));
}

function firstLine(text: string): string {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const nl = body.indexOf('\n');
  return (nl < 0 ? body : body.slice(0, nl)).replace(/\r$/, '');
}

export function emptyExcluded(): Record<ExcludedGradeCode, number> {
  return { P: 0, NP: 0, S: 0, U: 0, IP: 0 };
}

/** Parse the whole CSV (no window filtering — the source applies filterGradeWindow-equivalent logic). */
export function parseCourseGradesCsv(text: string, opts: ParseCourseGradesOptions = {}): ParseCourseGradesResult {
  const { onWarn, maxWarnings = 20 } = opts;
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (warnings.length >= maxWarnings) return;
    warnings.push(msg);
    onWarn?.(msg);
  };

  const headerText = firstLine(text);
  if (headerText.trim() === '') throw new UcsbCsvSchemaError('UCSB grades CSV is empty (no header row)');
  const headerRows = parse(headerText, { bom: true, trim: true }) as string[][];
  const extraColumns = validateCourseGradesHeader(headerRows[0] ?? []);
  if (extraColumns.length > 0) warn(`ignoring unknown CSV columns: ${extraColumns.join(', ')}`);

  // No `trim`: the course cell is fixed-width and its leading blanks are significant (see courseId.ts).
  const records = parse(text, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];

  const rows: UcsbRawGradeRow[] = [];
  const excluded = emptyExcluded();
  const excludedByTerm: Record<string, Record<ExcludedGradeCode, number>> = {};
  const droppedByTerm: Record<string, number> = {};
  let droppedRows = 0;
  let malformedRows = 0;
  let lettersMismatch = 0;

  records.forEach((record, i) => {
    const line = i + 2;
    const parsed = RowSchema.safeParse(record);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new UcsbCsvRowError(`UCSB grades CSV line ${line}: ${issue?.path.join('.') ?? '(row)'}: ${issue?.message ?? 'invalid'}`, line);
    }
    const r = parsed.data;
    const course = parseUcsbCourseId(r.course);
    const yearTerm = termFromQuarterWord(r.quarter, r.year);
    if (!course || !yearTerm) {
      malformedRows += 1;
      warn(`line ${line}: unparsable ${!course ? `course ${JSON.stringify(r.course)}` : `quarter ${JSON.stringify(r.quarter)} ${r.year}`}`);
      return;
    }
    const perTerm = (excludedByTerm[yearTerm] ??= emptyExcluded());
    const rowCodes: [ExcludedGradeCode, number][] = [['P', r.P], ['NP', Math.max(0, r.nPNPStudents - r.P)], ['S', r.S], ['U', r.su], ['IP', r.IP]];
    for (const [code, n] of rowCodes) {
      if (!(n > 0)) continue;
      excluded[code] += 1;
      perTerm[code] += 1;
    }

    const buckets = {} as GradeBuckets;
    let graded = 0;
    for (const [col, key] of LETTER_COLUMNS) {
      buckets[key] = r[col];
      graded += r[col];
    }
    buckets.w = 0;
    if (graded !== r.nLetterStudents) {
      lettersMismatch += 1;
      warn(`line ${line}: nLetterStudents=${r.nLetterStudents} but Σ letters=${graded}; trusting letters`);
    }
    if (graded === 0) {
      droppedRows += 1;
      droppedByTerm[yearTerm] = (droppedByTerm[yearTerm] ?? 0) + 1;
      return;
    }
    rows.push({
      year: r.year,
      term: r.quarter.trim(),
      yearTerm,
      subject: course.subject,
      number: course.number,
      title: '',
      schedType: '',
      buckets,
      students: graded,
      instructorRaw: toCommaForm(r.instructor),
      sourceGpa: r.avgGPA > 0 ? r.avgGPA : null,
    });
  });

  return { rows, extraColumns, warnings, excludedGradeCodes: excluded, excludedByTerm, droppedRows, droppedByTerm, malformedRows, lettersMismatch };
}

/** §4 bookkeeping scoped to the grade window: excluded-code row counts and dropped rows over in-window terms (+ malformed rows). */
export function scopeUcsbBookkeeping(
  parsed: Pick<ParseCourseGradesResult, 'excludedByTerm' | 'droppedByTerm' | 'malformedRows'>,
  inWindow: (yearTerm: string) => boolean,
): { excludedGradeCodes: Record<ExcludedGradeCode, number>; droppedRows: number } {
  const excludedGradeCodes = emptyExcluded();
  let droppedRows = parsed.malformedRows;
  for (const [term, counts] of Object.entries(parsed.excludedByTerm)) {
    if (!inWindow(term)) continue;
    for (const code of Object.keys(counts) as ExcludedGradeCode[]) excludedGradeCodes[code] += counts[code];
  }
  for (const [term, n] of Object.entries(parsed.droppedByTerm)) if (inWindow(term)) droppedRows += n;
  return { excludedGradeCodes, droppedRows };
}
