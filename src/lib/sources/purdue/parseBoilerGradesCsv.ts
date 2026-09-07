// Parser for one boiler-grades term CSV (MULTI_SCHOOL_DESIGN §4.1, §4.2). Pure: text in, rows out.
// Handles delimiter detection, optional header, header aliasing, cascading blanks (fill-forward) and
// per-row term resolution. Conversion to RawGradeRow (the percent-only rule) lives in ./toRawGradeRow.
import { parse } from 'csv-parse/sync';
import type { TermCode } from '@/lib/domain/types';
import { parsePercentCell } from './gradeCodes';
import { termFromPurdueCode, termFromPurdueName } from './terms';
import {
  BoilerGradesSchemaError,
  FILL_FORWARD_COLUMNS,
  detectDelimiter,
  inferHeaderlessColumns,
  isHeaderRow,
  mapHeader,
  type ColumnSpec,
  type MetaColumn,
} from './columns';

export interface BoilerGradesRow {
  subject: string;           // "AAE"
  subjectDesc: string;       // "AAE-Aero & Astro Engineering" ('' in the aggregate file)
  number: string;            // "20300"
  title: string;
  term: TermCode;            // resolved from Academic Period (code) or its description
  academicPeriod: string;    // "202610" as printed ('' when the file has no code column)
  termName: string;          // "Fall 2025"
  section: string;           // "001" ('' in the aggregate file)
  crn: string;               // "17446" ('' in the aggregate file)
  instructorRaw: string;     // "Agyei, Ronald F." exactly as printed (trimmed)
  /** Grade code → percentage as published (0 when the cell is blank). Only codes the file has columns for. */
  pct: Record<string, number>;
  line: number;              // 1-based line in the file
}

export interface ParseBoilerGradesOptions {
  /** Column names for a headerless file (else inferred from the column count via HEADERLESS_SCHEMAS). */
  columns?: readonly string[];
  onWarn?: (message: string) => void;
  maxWarnings?: number;
  /** For messages only. */
  fileName?: string;
}

export interface ParseBoilerGradesResult {
  rows: BoilerGradesRow[];
  delimiter: ';' | ',';
  hadHeader: boolean;
  columns: string[];
  gradeCodes: string[];
  unknownColumns: string[];
  warnings: string[];
  /** Rows skipped because neither the period code nor its description yielded a term. */
  badTerm: number;
  /** Rows skipped for a blank subject or course number even after fill-forward. */
  badCourse: number;
  /** Rows whose percentages summed outside 98–102 (kept; the §4.1 rule renormalises anyway). */
  percentSumMismatch: number;
  /** Cells that were not blank and not a percentage (treated as 0). */
  badCells: number;
}

function firstLine(text: string): string {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const nl = body.indexOf('\n');
  return (nl < 0 ? body : body.slice(0, nl)).replace(/\r$/, '');
}

export function parseBoilerGradesCsv(text: string, opts: ParseBoilerGradesOptions = {}): ParseBoilerGradesResult {
  const { onWarn, maxWarnings = 20 } = opts;
  const label = opts.fileName ? `${opts.fileName}: ` : '';
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (warnings.length >= maxWarnings) return;
    warnings.push(`${label}${msg}`);
    onWarn?.(`${label}${msg}`);
  };

  const head = firstLine(text);
  if (head.trim() === '') throw new BoilerGradesSchemaError(`${label}file is empty`);
  const delimiter = detectDelimiter(head);
  const records = parse(text, { delimiter, bom: true, trim: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true }) as string[][];
  if (records.length === 0) throw new BoilerGradesSchemaError(`${label}file has no rows`);

  const hadHeader = opts.columns === undefined && isHeaderRow(records[0]);
  let columns: readonly string[];
  if (hadHeader) columns = records[0];
  else if (opts.columns) columns = opts.columns;
  else {
    const inferred = inferHeaderlessColumns(records[0].length);
    if (!inferred) throw new BoilerGradesSchemaError(`${label}no header row and no known schema for ${records[0].length} columns`);
    columns = inferred;
  }
  const mapped = mapHeader(columns);
  if (mapped.unknown.length > 0) warn(`ignoring unknown columns: ${mapped.unknown.join(', ')}`);

  const rows: BoilerGradesRow[] = [];
  const carry: Partial<Record<MetaColumn, string>> = {};
  let badTerm = 0;
  let badCourse = 0;
  let percentSumMismatch = 0;
  let badCells = 0;

  records.forEach((cells, i) => {
    if (hadHeader && i === 0) return;
    const line = i + 1;
    if (cells.every((c) => c.trim() === '')) return;
    const meta: Partial<Record<MetaColumn, string>> = {};
    const pct: Record<string, number> = {};
    let sum = 0;
    mapped.columns.forEach((spec: ColumnSpec, col) => {
      const cell = (cells[col] ?? '').trim();
      if (spec.kind === 'meta') meta[spec.meta] = cell;
      else if (spec.kind === 'grade') {
        const v = parsePercentCell(cell);
        if (Number.isNaN(v)) {
          badCells += 1;
          warn(`line ${line}: unreadable ${spec.code} cell "${cell}" (treated as 0)`);
          pct[spec.code] = (pct[spec.code] ?? 0);
        } else {
          pct[spec.code] = (pct[spec.code] ?? 0) + v;   // a code listed twice (never seen) adds up
          sum += v;
        }
      }
    });
    for (const key of FILL_FORWARD_COLUMNS) {
      if ((meta[key] ?? '') === '') meta[key] = carry[key] ?? '';
      else carry[key] = meta[key];
    }
    const subject = (meta.subject ?? '').toUpperCase();
    const number = (meta.number ?? '').toUpperCase();
    if (subject === '' || number === '') {
      badCourse += 1;
      warn(`line ${line}: blank subject/course number after fill-forward (skipped)`);
      return;
    }
    const term = termFromPurdueCode(meta.termCode ?? '') ?? termFromPurdueName(meta.termName ?? '');
    if (!term) {
      badTerm += 1;
      warn(`line ${line}: unrecognised term "${meta.termCode ?? ''}" / "${meta.termName ?? ''}" (skipped)`);
      return;
    }
    if (sum < 98 || sum > 102) {
      percentSumMismatch += 1;
      warn(`line ${line}: percentages sum to ${sum.toFixed(1)} (kept; renormalised)`);
    }
    rows.push({
      subject,
      subjectDesc: meta.subjectDesc ?? '',
      number,
      title: meta.title ?? '',
      term,
      academicPeriod: meta.termCode ?? '',
      termName: meta.termName ?? '',
      section: meta.section ?? '',
      crn: meta.crn ?? '',
      instructorRaw: meta.instructor ?? '',
      pct,
      line,
    });
  });

  return {
    rows, delimiter, hadHeader, columns: [...columns], gradeCodes: mapped.gradeCodes, unknownColumns: mapped.unknown,
    warnings, badTerm, badCourse, percentSumMismatch, badCells,
  };
}
