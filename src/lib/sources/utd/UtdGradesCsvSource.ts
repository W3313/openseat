// GradeSource for UT Dallas (MULTI_SCHOOL_DESIGN §4.2, §7): reads the per-term CSVs cached under
// data/raw/utd/ by scripts/fetch-utd.ts, validates each header, keeps the terms inside the grade window
// and concatenates them. Grades-only school: no schedule, no reviews.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { GradeSource, RawGradeRow, SourceInfo } from '@/lib/sources/types';
import { compareTerms, inGradeWindow } from '@/lib/utils/term';
import { parseUtdGradesCsv, termFromUtdFilename, type UtdGradeRow } from './parseUtdGradesCsv';

export const UTD_GRADES_SOURCE_INFO: SourceInfo = {
  id: 'utd-grades-csv',
  label: 'UTD Grades raw data (acmutd/utd-grades)',
  url: 'https://github.com/acmutd/utd-grades',
  license: 'MIT', // the repository's declared licence; the grade records themselves are inferred (unconfirmed) Texas Public Information Act releases
};

export const DEFAULT_UTD_RAW_DIR = path.join('data', 'raw', 'utd');

export interface UtdGradesCsvSourceOptions {
  /** Term the rankings are built for; term files older than the window are skipped. */
  currentTerm: TermCode;
  /** GRADE_YEARS_BACK. */
  yearsBack: number;
  /** Directory holding enhanced_grades_enhanced_grades_<term>.csv files (default data/raw/utd, relative to cwd). */
  dir?: string;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

/** GradeSource.fetch result plus the §4 extras ingest reads off it (excluded codes, dropped rows). */
export interface UtdFetchResult {
  rows: RawGradeRow[];
  fetchedAt: string;
  /** Rows per excluded grade code (CR / I / NC / P) over every in-window term file (§4 row counts). */
  excludedGradeCodes: Record<string, number>;
  /** Sections with no letter grade and no W (pass/fail-only) — not returned as rows. */
  droppedRows: number;
  /** Terms actually loaded, ascending. */
  terms: TermCode[];
}

/** Term files in a directory: { file, term }, ascending by term. Non-term files are ignored. */
export async function listUtdTermFiles(dir: string): Promise<{ file: string; term: TermCode }[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: { file: string; term: TermCode }[] = [];
  for (const name of names) {
    const term = termFromUtdFilename(name);
    if (term) out.push({ file: path.join(dir, name), term });
  }
  return out.sort((a, b) => compareTerms(a.term, b.term));
}

export class UtdGradesCsvSource implements GradeSource {
  readonly info = UTD_GRADES_SOURCE_INFO;
  readonly dir: string;
  private readonly currentTerm: TermCode;
  private readonly yearsBack: number;
  private readonly log: NonNullable<UtdGradesCsvSourceOptions['log']>;

  constructor(opts: UtdGradesCsvSourceOptions) {
    this.currentTerm = opts.currentTerm;
    this.yearsBack = opts.yearsBack;
    this.dir = path.resolve(opts.dir ?? DEFAULT_UTD_RAW_DIR);
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  async fetch(opts: { schoolId: SchoolId }): Promise<UtdFetchResult> {
    if (opts.schoolId !== 'utd') throw new Error(`UtdGradesCsvSource only serves school "utd" (got "${opts.schoolId}")`);
    const all = await listUtdTermFiles(this.dir);
    const files = all.filter((f) => inGradeWindow(f.term, this.currentTerm, this.yearsBack));
    if (files.length === 0) {
      throw new Error(
        `No UTD term files inside the grade window (${this.currentTerm} − ${this.yearsBack}y) under ${this.dir}. ` +
          'Run `npx tsx scripts/fetch-utd.ts` first.',
      );
    }
    const rows: UtdGradeRow[] = [];
    const excludedGradeCodes: Record<string, number> = {};
    let droppedRows = 0;
    let fetchedAt = '';
    for (const { file, term } of files) {
      const [text, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
      const mtime = st.mtime.toISOString();
      if (mtime > fetchedAt) fetchedAt = mtime;
      const parsed = parseUtdGradesCsv(text, { term, onWarn: (m) => this.log.warn(`[utd-grades-csv] ${path.basename(file)}: ${m}`) });
      rows.push(...parsed.rows);
      droppedRows += parsed.droppedRows;
      for (const [code, n] of Object.entries(parsed.excludedGradeCodes)) excludedGradeCodes[code] = (excludedGradeCodes[code] ?? 0) + n;
    }
    const terms = files.map((f) => f.term);
    const excludedText = Object.entries(excludedGradeCodes).map(([c, n]) => `${c}=${n}`).join(' ');
    this.log.info(
      `[utd-grades-csv] ${files.length} term files (${terms[0]} … ${terms[terms.length - 1]}; skipped ${all.length - files.length} outside the window): ` +
        `${rows.length} section rows; dropped ${droppedRows} with no letter grade or W; rows with excluded codes ${excludedText || 'none'}`,
    );
    return { rows, fetchedAt, excludedGradeCodes, droppedRows, terms };
  }
}
