// Parser for the UT Dallas grade CSVs published by acmutd/utd-grades (MULTI_SCHOOL_DESIGN §4, §4.2, §7).
// One file per term: raw_data/enhanced_grades_enhanced_grades_<yy><f|s|u>.csv — the term lives ONLY in the
// file name. One row = one section. Pure: takes the file text plus the term, returns RawGradeRow-shaped
// records; shared by UtdGradesCsvSource and the fetch script.
//
// Observed shape (16 term files, 2020-fa … 2025-fa, sampled 2026-09-06):
//   Subject, Catalog Nbr | Catalog Number, Section, A+ … F (13 letters), CR, I, NC, W, P (order varies;
//   I and NC are missing in some terms), Instructor 1 … Instructor 6, instructor_id,
//   instructor_name_normalized, title
// - empty count cells mean 0; a few files write counts as "1.0" (integer-valued floats)
// - W → buckets.w; CR / I / NC / P are excluded from `graded` and counted per code (student totals)
// - Instructor 1 is the primary; the other columns are co-instructors (often TAs) — kept on the record as
//   coInstructorsRaw because the school has no schedule source
// - ~11% of rows carry no letter grade and no W (pass/fail-only sections): dropped, counted in droppedRows
import { parse } from 'csv-parse/sync';
import type { GradeBuckets, TermCode } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { SEASON_WORD, makeTermCode, termSeason, termYear } from '@/lib/utils/term';

export const UTD_TERM_FILE_RE = /^enhanced_grades_enhanced_grades_(\d{2})([fsu])\.csv$/i;

/** Letter columns → GradeBuckets key, in source order. */
export const UTD_LETTER_COLUMNS: readonly [string, keyof Omit<GradeBuckets, 'w'>][] = [
  ['A+', 'aPlus'], ['A', 'a'], ['A-', 'aMinus'], ['B+', 'bPlus'], ['B', 'b'], ['B-', 'bMinus'],
  ['C+', 'cPlus'], ['C', 'c'], ['C-', 'cMinus'], ['D+', 'dPlus'], ['D', 'd'], ['D-', 'dMinus'], ['F', 'f'],
];
export const UTD_WITHDRAW_COLUMN = 'W';
/** Grade codes excluded from `graded` (§4): credit, incomplete, no-credit, pass. Optional in the header. */
export const UTD_EXCLUDED_COLUMNS = ['CR', 'I', 'NC', 'P'] as const;
/** The catalog-number column was renamed between terms; either spelling is accepted. */
export const UTD_CATALOG_COLUMNS = ['Catalog Nbr', 'Catalog Number'] as const;
export const UTD_INSTRUCTOR_COLUMNS = ['Instructor 1', 'Instructor 2', 'Instructor 3', 'Instructor 4', 'Instructor 5', 'Instructor 6'] as const;
export const UTD_REQUIRED_COLUMNS: readonly string[] = [
  'Subject', 'Section', ...UTD_LETTER_COLUMNS.map(([c]) => c), UTD_WITHDRAW_COLUMN,
  ...UTD_INSTRUCTOR_COLUMNS, 'instructor_id', 'instructor_name_normalized', 'title',
];

export class UtdCsvSchemaError extends Error {
  constructor(message: string, public readonly column?: string) {
    super(message);
    this.name = 'UtdCsvSchemaError';
  }
}
export class UtdCsvRowError extends Error {
  constructor(message: string, public readonly line: number) {
    super(message);
    this.name = 'UtdCsvRowError';
  }
}

// ── term codes ───────────────────────────────────────────────────────────────────────────────────────
const UTD_SEASON = { f: 'fa', s: 'sp', u: 'su' } as const;
const UTD_SEASON_LETTER = { fa: 'f', sp: 's', su: 'u' } as const;

/** "25f" → "2025-fa", "25s" → "2025-sp", "25u" → "2025-su"; null for anything else. */
export function termFromUtdCode(code: string): TermCode | null {
  const m = /^(\d{2})([fsu])$/i.exec(code.trim());
  if (!m) return null;
  return makeTermCode(2000 + Number(m[1]), UTD_SEASON[m[2].toLowerCase() as keyof typeof UTD_SEASON]);
}

/** "enhanced_grades_enhanced_grades_25f.csv" (basename) → "2025-fa"; null when the name is not a term file. */
export function termFromUtdFilename(name: string): TermCode | null {
  const m = UTD_TERM_FILE_RE.exec(name.trim());
  return m ? termFromUtdCode(`${m[1]}${m[2]}`) : null;
}

/** Inverse: "2025-fa" → "25f"; null for winter terms (UTD has none) or years outside 2000–2099. */
export function utdCodeFromTerm(term: TermCode): string | null {
  const season = termSeason(term);
  const year = termYear(term);
  if (!(season in UTD_SEASON_LETTER) || year < 2000 || year > 2099) return null;
  return `${String(year - 2000).padStart(2, '0')}${UTD_SEASON_LETTER[season as keyof typeof UTD_SEASON_LETTER]}`;
}

// ── header ───────────────────────────────────────────────────────────────────────────────────────────
export interface UtdHeaderInfo {
  /** Which catalog-number spelling this file uses. */
  catalogColumn: (typeof UTD_CATALOG_COLUMNS)[number];
  /** Excluded-code columns present in this file (CR/I/NC/P subset, header order). */
  excludedColumns: string[];
  /** Columns beyond the known ones (ignored). */
  extraColumns: string[];
}

/** Validates a header (any column order); throws UtdCsvSchemaError naming the first missing column. */
export function validateUtdHeader(header: readonly string[]): UtdHeaderInfo {
  const cols = header.map((h) => h.trim());
  const present = new Set(cols);
  for (const col of UTD_REQUIRED_COLUMNS) {
    if (!present.has(col)) throw new UtdCsvSchemaError(`UTD grades CSV is missing required column "${col}"`, col);
  }
  const catalogColumn = UTD_CATALOG_COLUMNS.find((c) => present.has(c));
  if (!catalogColumn) throw new UtdCsvSchemaError(`UTD grades CSV is missing the catalog-number column ("Catalog Nbr" or "Catalog Number")`, 'Catalog Nbr');
  const excludedColumns = cols.filter((c) => (UTD_EXCLUDED_COLUMNS as readonly string[]).includes(c));
  const known = new Set<string>([...UTD_REQUIRED_COLUMNS, ...UTD_CATALOG_COLUMNS, ...UTD_EXCLUDED_COLUMNS]);
  return { catalogColumn, excludedColumns, extraColumns: cols.filter((c) => !known.has(c)) };
}

function firstLine(text: string): string {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const nl = body.indexOf('\n');
  return (nl < 0 ? body : body.slice(0, nl)).replace(/\r$/, '');
}

// ── cells ────────────────────────────────────────────────────────────────────────────────────────────
/** '' → 0, "12" → 12, "1.0" → 1; null for anything that is not a non-negative integer value. */
export function parseCountCell(cell: string): number | null {
  const v = cell.trim();
  if (v === '') return 0;
  if (!/^\d+(\.0+)?$/.test(v)) return null;
  return Number(v);
}

/** Trimmed, inner whitespace collapsed ("Akinwole, Oluwadare   (Dare)" → single spaces). */
export function cleanInstructorCell(cell: string): string {
  return cell.replace(/\s+/g, ' ').trim();
}

/** Primary = Instructor 1 (first non-empty column when Instructor 1 is blank); the rest, deduped, are co-instructors. */
export function splitInstructors(cells: readonly string[]): { primary: string; coInstructors: string[] } {
  const names = cells.map(cleanInstructorCell).filter((s) => s !== '');
  const primary = names[0] ?? '';
  const co: string[] = [];
  for (const nm of names.slice(1)) if (nm !== primary && !co.includes(nm)) co.push(nm);
  return { primary, coInstructors: co };
}

// ── rows ─────────────────────────────────────────────────────────────────────────────────────────────
/** RawGradeRow plus the UTD-specific provenance the core row shape has no home for. */
export interface UtdGradeRow extends RawGradeRow {
  /** Section code as published ("001", "0W1", "HON"). schedType stays '' → 'UNKNOWN' (no sched-type vocabulary at UTD). */
  section: string;
  /** Instructor 2 … 6, cleaned and deduped (co-instructors / TAs); the school has no schedule to attach them to. */
  coInstructorsRaw: string[];
  /** The source's normalized instructor id / name for the primary instructor ('' when blank). */
  instructorId: string;
  instructorNameNormalized: string;
  /** Students with an excluded code on this section, per code (only codes > 0). */
  excluded: Record<string, number>;
}

export interface ParseUtdOptions {
  term: TermCode;
  onWarn?: (message: string) => void;
  maxWarnings?: number;
}

export interface ParseUtdResult {
  rows: UtdGradeRow[];
  header: UtdHeaderInfo;
  /** Rows where the excluded code (CR / I / NC / P) was non-zero, kept rows and dropped rows alike (§4 row counts; per-row student counts live in `row.excluded`). */
  excludedGradeCodes: Record<string, number>;
  /** Rows carrying no letter grade and no W (pass/fail-only sections) — not returned. */
  droppedRows: number;
  warnings: string[];
}

/** Parse one term file. Rows keep source order (Subject, Catalog Nbr, Section). */
export function parseUtdGradesCsv(text: string, opts: ParseUtdOptions): ParseUtdResult {
  const { term, onWarn, maxWarnings = 20 } = opts;
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (warnings.length >= maxWarnings) return;
    warnings.push(msg);
    onWarn?.(msg);
  };
  const headerText = firstLine(text);
  if (headerText.trim() === '') throw new UtdCsvSchemaError('UTD grades CSV is empty (no header row)');
  const headerRows = parse(headerText, { bom: true, trim: true }) as string[][];
  const header = validateUtdHeader(headerRows[0] ?? []);
  if (header.extraColumns.length > 0) warn(`ignoring unknown CSV columns: ${header.extraColumns.join(', ')}`);

  const records = parse(text, { columns: true, bom: true, trim: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
  const year = termYear(term);
  const termWord = SEASON_WORD[termSeason(term)];
  const excludedGradeCodes: Record<string, number> = {};
  const rows: UtdGradeRow[] = [];
  let droppedRows = 0;

  const count = (record: Record<string, string>, col: string, line: number): number => {
    const v = parseCountCell(record[col] ?? '');
    if (v === null) throw new UtdCsvRowError(`UTD grades CSV line ${line}: "${col}" = "${record[col]}" is not a non-negative integer`, line);
    return v;
  };

  records.forEach((record, i) => {
    const line = i + 2;
    const subject = (record.Subject ?? '').trim().toUpperCase();
    const number = (record[header.catalogColumn] ?? '').trim().toUpperCase();
    if (subject === '' || number === '') throw new UtdCsvRowError(`UTD grades CSV line ${line}: empty Subject or catalog number`, line);
    const buckets = { w: count(record, UTD_WITHDRAW_COLUMN, line) } as GradeBuckets;
    let graded = 0;
    for (const [col, key] of UTD_LETTER_COLUMNS) {
      buckets[key] = count(record, col, line);
      graded += buckets[key];
    }
    const excluded: Record<string, number> = {};
    for (const col of header.excludedColumns) {
      const v = count(record, col, line);
      if (v > 0) {
        excluded[col] = v;
        excludedGradeCodes[col] = (excludedGradeCodes[col] ?? 0) + 1;
      }
    }
    if (graded + buckets.w === 0) {
      droppedRows += 1;
      return;
    }
    const { primary, coInstructors } = splitInstructors(UTD_INSTRUCTOR_COLUMNS.map((c) => record[c] ?? ''));
    rows.push({
      year,
      term: termWord,
      yearTerm: term,
      subject,
      number,
      title: (record.title ?? '').trim(),
      schedType: '',
      buckets,
      students: graded + buckets.w,
      instructorRaw: primary,
      section: (record.Section ?? '').trim(),
      coInstructorsRaw: coInstructors,
      instructorId: (record.instructor_id ?? '').trim(),
      instructorNameNormalized: (record.instructor_name_normalized ?? '').trim(),
      excluded,
    });
  });
  return { rows, header, excludedGradeCodes, droppedRows, warnings };
}
