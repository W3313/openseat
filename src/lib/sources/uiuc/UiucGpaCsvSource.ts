// GradeSource for the public UIUC GPA dataset (SPEC 6.2, SOURCE_FACTS 1). Reads the cached CSV under
// data/raw/uiuc/ (downloaded by scripts/fetch-uiuc-gpa.ts), validates the 23-column header, and returns
// only rows inside the grade window.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { GradeSource, RawGradeRow, SourceInfo } from '@/lib/sources/types';
import { filterGradeWindow, parseGpaCsv } from './parseGpaCsv';

export const UIUC_GPA_CSV_SOURCE_INFO: SourceInfo = {
  id: 'uiuc-gpa-csv',
  label: 'UIUC GPA dataset (wadefagen/datasets)',
  url: 'https://github.com/wadefagen/datasets',
  license: 'MIT',
};

export const DEFAULT_UIUC_GPA_CSV_PATH = path.join('data', 'raw', 'uiuc', 'uiuc-gpa-dataset.csv');

export interface UiucGpaCsvSourceOptions {
  /** Term the rankings are built for; rows older than the window are dropped. */
  currentTerm: TermCode;
  /** GRADE_YEARS_BACK. */
  yearsBack: number;
  /** CSV location (default data/raw/uiuc/uiuc-gpa-dataset.csv, relative to cwd). */
  csvPath?: string;
  /** Receives warnings and the discarded-row count. Default: console.warn / console.log. */
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export class UiucGpaCsvSource implements GradeSource {
  readonly info = UIUC_GPA_CSV_SOURCE_INFO;
  readonly csvPath: string;
  private readonly currentTerm: TermCode;
  private readonly yearsBack: number;
  private readonly log: NonNullable<UiucGpaCsvSourceOptions['log']>;

  constructor(opts: UiucGpaCsvSourceOptions) {
    this.currentTerm = opts.currentTerm;
    this.yearsBack = opts.yearsBack;
    this.csvPath = path.resolve(opts.csvPath ?? DEFAULT_UIUC_GPA_CSV_PATH);
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  async fetch(opts: { schoolId: SchoolId }): Promise<{ rows: RawGradeRow[]; fetchedAt: string }> {
    if (opts.schoolId !== 'uiuc') {
      throw new Error(`UiucGpaCsvSource only serves school "uiuc" (got "${opts.schoolId}")`);
    }
    let text: string;
    let fetchedAt: string;
    try {
      const [buf, st] = await Promise.all([readFile(this.csvPath, 'utf8'), stat(this.csvPath)]);
      text = buf;
      fetchedAt = st.mtime.toISOString();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error(
          `GPA CSV not found at ${this.csvPath}. Run \`npm run data:fetch\` (scripts/fetch-uiuc-gpa.ts) first.`,
        );
      }
      throw err;
    }
    const parsed = parseGpaCsv(text, { onWarn: (m) => this.log.warn(`[uiuc-gpa-csv] ${m}`) });
    const { kept, discarded } = filterGradeWindow(parsed.rows, this.currentTerm, this.yearsBack);
    this.log.info(
      `[uiuc-gpa-csv] parsed ${parsed.rows.length} rows; kept ${kept.length} in window ` +
        `(${this.currentTerm} − ${this.yearsBack}y); discarded ${discarded}` +
        (parsed.studentsMismatch > 0 ? `; ${parsed.studentsMismatch} rows had Students ≠ Σ buckets` : ''),
    );
    return { rows: kept, fetchedAt };
  }
}
