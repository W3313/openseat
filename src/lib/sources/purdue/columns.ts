// Column schemas of the boiler-grades CSVs (eduxstad/boiler-grades). The files drift per term: comma vs
// semicolon delimiters, a header row or none (`*_db.csv` and fall2023.csv), SQL-style spellings
// (`a_minus`, `w_f`), a trailing empty column, and one aggregate file (fall2023.csv: per instructor,
// letter-only, no CRN). Headers are matched case-insensitively through aliases; headerless files get
// the schema the upstream `sql.commands` documents for their column count.
import { normalizeGradeCode } from './gradeCodes';

export type MetaColumn =
  | 'subject' | 'subjectDesc' | 'number' | 'title' | 'termCode' | 'termName' | 'section' | 'crn' | 'instructor';

export type ColumnSpec =
  | { kind: 'meta'; meta: MetaColumn }
  | { kind: 'grade'; code: string }
  | { kind: 'ignore'; header: string };

/** Meta columns that cascade (blank cell = same as the row above) in the Excel-style exports. */
export const FILL_FORWARD_COLUMNS: readonly MetaColumn[] = ['subject', 'subjectDesc', 'number', 'title', 'termCode', 'termName', 'instructor'];

/** Columns a file must provide (after aliasing) to be parsed at all. */
export const REQUIRED_COLUMNS: readonly MetaColumn[] = ['subject', 'number', 'instructor'];

const META_ALIASES: Readonly<Record<string, MetaColumn>> = {
  subject: 'subject',
  subjectdesc: 'subjectDesc', subjectdescription: 'subjectDesc',
  coursenumber: 'number', coursenum: 'number', number: 'number', course: 'number',
  title: 'title', coursetitle: 'title',
  academicperiod: 'termCode', termcode: 'termCode', period: 'termCode',
  academicperioddesc: 'termName', academicperioddescription: 'termName', term: 'termName', semester: 'termName',
  section: 'section', crn: 'crn',
  instructor: 'instructor', primaryinstructor: 'instructor',
};

/** Lower-case alphanumerics only: "Academic Period Desc" → "academicperioddesc", "course_num" → "coursenum". */
export function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** One header cell → its role. Unknown non-empty headers are 'ignore' (reported by mapHeader). */
export function classifyHeader(cell: string): ColumnSpec {
  const meta = META_ALIASES[normalizeHeaderCell(cell)];
  if (meta) return { kind: 'meta', meta };
  const code = normalizeGradeCode(cell);
  if (code) return { kind: 'grade', code };
  return { kind: 'ignore', header: cell.trim() };
}

export class BoilerGradesSchemaError extends Error {
  constructor(message: string, public readonly column?: string) {
    super(message);
    this.name = 'BoilerGradesSchemaError';
  }
}

export interface MappedHeader {
  columns: ColumnSpec[];
  /** Non-empty headers that are neither meta columns nor known grade codes (ignored). */
  unknown: string[];
  gradeCodes: string[];
}

/** Classify every header cell; throws BoilerGradesSchemaError naming the first missing required column. */
export function mapHeader(header: readonly string[]): MappedHeader {
  const columns = header.map(classifyHeader);
  const present = new Set(columns.flatMap((c) => (c.kind === 'meta' ? [c.meta] : [])));
  for (const required of REQUIRED_COLUMNS) {
    if (!present.has(required)) throw new BoilerGradesSchemaError(`boiler-grades CSV is missing required column "${required}"`, required);
  }
  if (!present.has('termCode') && !present.has('termName')) {
    throw new BoilerGradesSchemaError('boiler-grades CSV has neither an "Academic Period" nor an "Academic Period Desc" column', 'termCode');
  }
  const gradeCodes = columns.flatMap((c) => (c.kind === 'grade' ? [c.code] : []));
  if (gradeCodes.length === 0) throw new BoilerGradesSchemaError('boiler-grades CSV has no grade columns', 'A');
  const unknown = columns.flatMap((c) => (c.kind === 'ignore' && c.header !== '' && normalizeHeaderCell(c.header) !== 'blank' ? [c.header] : []));
  return { columns, unknown, gradeCodes };
}

/** True when the first row of a file is a header (it names the instructor column) rather than data. */
export function isHeaderRow(firstRow: readonly string[]): boolean {
  return firstRow.some((cell) => META_ALIASES[normalizeHeaderCell(cell)] === 'instructor');
}

/** Delimiter of a line: whichever of ';' / ',' occurs more often (semicolon files contain no bare commas). */
export function detectDelimiter(firstLine: string): ';' | ',' {
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis >= commas ? ';' : ',';
}

const DB_META = ['subject', 'subject_desc', 'course_num', 'title', 'academic_period', 'academic_period_desc', 'section', 'crn', 'instructor'];
const DB_LETTERS = ['a', 'a_minus', 'a_plus', 'au', 'b', 'b_minus', 'b_plus', 'c', 'c_minus', 'c_plus', 'd', 'd_minus', 'd_plus'];

/**
 * Headerless schemas from the upstream `sql.commands` \copy statements, keyed by column count.
 *   39 fall2021_db · 36 spring2022_db · 33 spring2024…spring2026_db (and the headered twins) ·
 *   32 summer2022/spring2023/summer2023_db (no E column) · 12 fall2023 (per-instructor aggregate).
 */
export const HEADERLESS_SCHEMAS: Readonly<Record<number, readonly string[]>> = Object.freeze({
  39: [...DB_META, ...DB_LETTERS, 'e', 'f', 'fn', 'i', 'i_f', 'n', 'ns', 'p', 'p_i', 's', 's_i', 'u', 'w', 'w_f', 'w_n', 'w_u', 'blank'],
  36: [...DB_META, ...DB_LETTERS, 'e', 'f', 'i', 'n', 'p', 'p_i', 's', 's_i', 'u', 'w', 'w_f', 'w_n', 'blank'],
  33: [...DB_META, ...DB_LETTERS, 'e', 'f', 'i', 'n', 'p', 'p_i', 's', 's_i', 'u', 'w', 'w_f'],
  32: [...DB_META, ...DB_LETTERS, 'f', 'i', 'n', 'p', 'p_i', 's', 's_i', 'u', 'w', 'w_f'],
  12: ['academic_period_desc', 'subject', 'course_num', 'title', 'instructor', 'a', 'b', 'c', 'd', 'f', 'w', 'i'],
});

/** Schema for a headerless file by its column count; null when the count is unknown. */
export function inferHeaderlessColumns(columnCount: number): readonly string[] | null {
  return HEADERLESS_SCHEMAS[columnCount] ?? null;
}
