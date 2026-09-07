// GradeSource for UC Santa Barbara (MULTI_SCHOOL_DESIGN §4.2 "ucsb", §7). Reads the Daily Nexus
// courseGrades.csv cached under data/raw/ucsb/ by scripts/fetch-ucsb.ts, validates the 25-column header,
// converts every row (courseId.ts, instructor.ts, quarter.ts) and returns the rows inside the grade
// window plus the §4 extras ingest reads off the result: `excludedGradeCodes` and `droppedRows`.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { GradeSource, SourceInfo } from '@/lib/sources/types';
import { inGradeWindow } from '@/lib/utils/term';
import { type ExcludedGradeCode, type UcsbRawGradeRow, parseCourseGradesCsv, scopeUcsbBookkeeping } from './parseCourseGrades';

export const UCSB_GRADES_SOURCE_INFO: SourceInfo = {
  id: 'ucsb-daily-nexus-csv',
  label: 'UCSB grade distributions (Daily Nexus, dailynexusdata/grades-data)',
  url: 'https://github.com/dailynexusdata/grades-data',
  // The repository declares no licence file; its README says "All data is free to reuse" and the grades
  // are California Public Records Act records obtained from the UCSB Office of the Registrar.
  license: null,
};

export const UCSB_GRADES_CSV_URL = 'https://raw.githubusercontent.com/dailynexusdata/grades-data/main/courseGrades.csv';
export const DEFAULT_UCSB_GRADES_CSV_PATH = path.join('data', 'raw', 'ucsb', 'courseGrades.csv');

export interface UcsbGradesSourceOptions {
  /** Term the rankings are built for; rows older than the window are dropped. */
  currentTerm: TermCode;
  /** GRADE_YEARS_BACK. */
  yearsBack: number;
  /** CSV location (default data/raw/ucsb/courseGrades.csv, relative to cwd). */
  csvPath?: string;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export interface UcsbGradesFetchResult {
  rows: UcsbRawGradeRow[];
  fetchedAt: string;
  /** §4: rows in the grade window where P / NP / S / U / IP was non-zero (row counts, like every adapter). */
  excludedGradeCodes: Record<ExcludedGradeCode, number>;
  /** §4: in-window rows with no letter grades (P/NP- or S/U-only) plus rows with an unparsable course id / quarter. */
  droppedRows: number;
}

export class UcsbGradesSource implements GradeSource {
  readonly info = UCSB_GRADES_SOURCE_INFO;
  readonly csvPath: string;
  private readonly currentTerm: TermCode;
  private readonly yearsBack: number;
  private readonly log: NonNullable<UcsbGradesSourceOptions['log']>;

  constructor(opts: UcsbGradesSourceOptions) {
    this.currentTerm = opts.currentTerm;
    this.yearsBack = opts.yearsBack;
    this.csvPath = path.resolve(opts.csvPath ?? DEFAULT_UCSB_GRADES_CSV_PATH);
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  async fetch(opts: { schoolId: SchoolId }): Promise<UcsbGradesFetchResult> {
    if (opts.schoolId !== 'ucsb') throw new Error(`UcsbGradesSource only serves school "ucsb" (got "${opts.schoolId}")`);
    let text: string;
    let fetchedAt: string;
    try {
      const [buf, st] = await Promise.all([readFile(this.csvPath, 'utf8'), stat(this.csvPath)]);
      text = buf;
      fetchedAt = st.mtime.toISOString();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`UCSB grades CSV not found at ${this.csvPath}. Run \`npx tsx scripts/fetch-ucsb.ts\` first.`);
      }
      throw err;
    }
    const parsed = parseCourseGradesCsv(text, { onWarn: (m) => this.log.warn(`[ucsb-daily-nexus-csv] ${m}`) });
    const rows: UcsbRawGradeRow[] = [];
    let discarded = 0;
    for (const row of parsed.rows) {
      if (inGradeWindow(row.yearTerm as TermCode, this.currentTerm, this.yearsBack)) rows.push(row);
      else discarded += 1;
    }
    const scoped = scopeUcsbBookkeeping(parsed, (t) => inGradeWindow(t as TermCode, this.currentTerm, this.yearsBack));
    const ex = scoped.excludedGradeCodes;
    this.log.info(
      `[ucsb-daily-nexus-csv] parsed ${parsed.rows.length} letter-graded rows; kept ${rows.length} in window ` +
        `(${this.currentTerm} − ${this.yearsBack}y); discarded ${discarded}; dropped ${scoped.droppedRows} in-window rows without letter grades` +
        (parsed.malformedRows > 0 ? ` (incl. ${parsed.malformedRows} malformed)` : '') +
        `; in-window rows with excluded codes P=${ex.P} NP=${ex.NP} S=${ex.S} U=${ex.U} IP=${ex.IP}` +
        (parsed.lettersMismatch > 0 ? `; ${parsed.lettersMismatch} rows had nLetterStudents ≠ Σ letters` : ''),
    );
    return { rows, fetchedAt, excludedGradeCodes: ex, droppedRows: scoped.droppedRows };
  }
}
