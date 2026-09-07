// GradeSource for the University of Houston (MULTI_SCHOOL_DESIGN §4.2 row `uh`, §7). Reads the cached
// `edu.uh.grade_distribution/records.csv` extracted from the latest cougargrades/publicdata release bundle
// by scripts/fetch-uh.ts, validates the 16-column header, splits co-taught listings, and returns only rows
// inside the grade window. The fetch result carries the §4 extras ingest reads: excludedGradeCodes and
// droppedRows.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { GradeSource, SourceInfo } from '@/lib/sources/types';
import { filterUhGradeWindow, parseUhRecordsCsv, scopeUhBookkeeping, type UhRawGradeRow } from './parseRecordsCsv';

export const UH_GRADES_SOURCE_INFO: SourceInfo = {
  id: 'uh-cougargrades',
  label: 'UH grade distributions (cougargrades/publicdata)',
  url: 'https://github.com/cougargrades/publicdata/releases',
  // The GitHub repository and the release asset declare no licence (GitHub API `license: null`, no LICENSE in
  // publicdata-bundle.tar.gz); the only MIT statement is the `license` field of the @cougargrades/publicdata npm
  // package.json (the same bundle). The underlying grade records are University of Houston public records
  // released under the Texas Public Information Act.
  license: 'MIT (npm @cougargrades/publicdata package.json; no licence file in the GitHub release); Texas Public Information Act records',
};

export const DEFAULT_UH_RAW_DIR = path.join('data', 'raw', 'uh');
export const UH_RECORDS_CSV_RELATIVE = path.join('edu.uh.grade_distribution', 'records.csv');
export const DEFAULT_UH_RECORDS_CSV_PATH = path.join(DEFAULT_UH_RAW_DIR, UH_RECORDS_CSV_RELATIVE);

export interface UhCougarGradesSourceOptions {
  /** Term the rankings are built for; rows older than the window are dropped. */
  currentTerm: TermCode;
  /** GRADE_YEARS_BACK. */
  yearsBack: number;
  /** records.csv location (default data/raw/uh/edu.uh.grade_distribution/records.csv, relative to cwd). */
  csvPath?: string;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export interface UhGradeFetchResult {
  rows: UhRawGradeRow[];
  fetchedAt: string;
  /** §4: in-window rows where SATISFACTORY / NOT REPORTED was non-zero (row counts). */
  excludedGradeCodes: Record<string, number>;
  /** §4: in-window rows with no letter grades and no drops. */
  droppedRows: number;
}

export class UhCougarGradesSource implements GradeSource {
  readonly info = UH_GRADES_SOURCE_INFO;
  readonly csvPath: string;
  private readonly currentTerm: TermCode;
  private readonly yearsBack: number;
  private readonly log: NonNullable<UhCougarGradesSourceOptions['log']>;

  constructor(opts: UhCougarGradesSourceOptions) {
    this.currentTerm = opts.currentTerm;
    this.yearsBack = opts.yearsBack;
    this.csvPath = path.resolve(opts.csvPath ?? DEFAULT_UH_RECORDS_CSV_PATH);
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  async fetch(opts: { schoolId: SchoolId }): Promise<UhGradeFetchResult> {
    if (opts.schoolId !== 'uh') throw new Error(`UhCougarGradesSource only serves school "uh" (got "${opts.schoolId}")`);
    let text: string;
    let fetchedAt: string;
    try {
      const [buf, st] = await Promise.all([readFile(this.csvPath, 'utf8'), stat(this.csvPath)]);
      text = buf;
      fetchedAt = st.mtime.toISOString();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`UH records.csv not found at ${this.csvPath}. Run \`npx tsx scripts/fetch-uh.ts\` first.`);
      }
      throw err;
    }
    const parsed = parseUhRecordsCsv(text, { onWarn: (m) => this.log.warn(`[uh-cougargrades] ${m}`) });
    const { kept, discarded } = filterUhGradeWindow(parsed.rows, this.currentTerm, this.yearsBack);
    const scoped = scopeUhBookkeeping(parsed, this.currentTerm, this.yearsBack);
    const excluded = Object.entries(scoped.excludedGradeCodes).map(([k, v]) => `${k}=${v}`).join(', ');
    this.log.info(
      `[uh-cougargrades] parsed ${parsed.rows.length} rows (${parsed.coTaughtSections} co-taught sections split, ` +
        `${parsed.mergedDuplicateRows} duplicate rows merged, ${parsed.droppedRows} empty rows dropped file-wide); ` +
        `kept ${kept.length} in window (${this.currentTerm} − ${this.yearsBack}y); discarded ${discarded}; ` +
        `in window: ${scoped.droppedRows} empty rows dropped, rows with excluded codes ${excluded}`,
    );
    return { rows: kept, fetchedAt, excludedGradeCodes: scoped.excludedGradeCodes, droppedRows: scoped.droppedRows };
  }
}
