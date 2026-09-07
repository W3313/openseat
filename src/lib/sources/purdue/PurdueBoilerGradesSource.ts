// GradeSource for Purdue West Lafayette (MULTI_SCHOOL_DESIGN §4.1, §4.2): the per-term CSVs of
// eduxstad/boiler-grades cached under data/raw/purdue/grades/ by scripts/fetch-purdue.ts. Every file in
// the directory is parsed; when both `<term>.csv` and `<term>_db.csv` exist the `_db` variant (already
// fill-forwarded upstream) supplies the rows and the headered twin supplies the column names.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { GradeSource, SourceInfo } from '@/lib/sources/types';
import { inGradeWindow } from '@/lib/utils/term';
import { parseBoilerGradesCsv, type ParseBoilerGradesResult } from './parseBoilerGradesCsv';
import { convertRows, type PurdueRawGradeRow } from './toRawGradeRow';
import { isHeaderRow, detectDelimiter } from './columns';

export const PURDUE_GRADES_SOURCE_INFO: SourceInfo = {
  id: 'purdue-boiler-grades',
  label: 'Boilergrades dataset (eduxstad/boiler-grades)',
  url: 'https://github.com/eduxstad/boiler-grades',
  license: 'GPL-3.0', // the repository's licence; the distributions themselves are Indiana public records obtained by APRA request
};

export const DEFAULT_PURDUE_GRADES_DIR = path.join('data', 'raw', 'purdue', 'grades');

export interface PurdueGradesLogger { info: (msg: string) => void; warn: (msg: string) => void }

export interface PurdueBoilerGradesSourceOptions {
  currentTerm: TermCode;
  yearsBack: number;
  /** Directory of cached term CSVs (default data/raw/purdue/grades, relative to cwd). */
  dir?: string;
  log?: PurdueGradesLogger;
}

export interface PurdueGradesFetchResult {
  rows: PurdueRawGradeRow[];
  fetchedAt: string;
  /** §4: excluded code → rows where it was non-zero, over in-window rows only. */
  excludedGradeCodes: Record<string, number>;
  /** §4: in-window rows dropped (duplicate CRN rows + rows without a letter curve). */
  droppedRows: number;
  /** In-window rows kept but suppressed because their percentages imply ≤ MAX_TINY_COHORT_N students. */
  tinyCohortRows: number;
  /** Per-file parse summary, for the fetch script and tests. */
  files: { file: string; rows: number; kept: number; dropped: number; duplicateCrnRows: number; tinyCohortRows: number; term: string; hadHeader: boolean }[];
}

/** `fall2025_db.csv` → `fall2025`; `fall2025.csv` → `fall2025`. */
export function termStem(file: string): { stem: string; isDb: boolean } {
  const base = path.basename(file, '.csv');
  return base.endsWith('_db') ? { stem: base.slice(0, -3), isDb: true } : { stem: base, isDb: false };
}

/** Pick one file per term stem, preferring the `_db` variant; returns [dataFile, headerTwin | null][]. */
export function chooseTermFiles(files: readonly string[]): { data: string; headerFrom: string | null }[] {
  const byStem = new Map<string, { plain?: string; db?: string }>();
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.csv')) continue;
    const { stem, isDb } = termStem(f);
    const entry = byStem.get(stem) ?? {};
    if (isDb) entry.db = f;
    else entry.plain = f;
    byStem.set(stem, entry);
  }
  return [...byStem.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, e]) => (e.db ? { data: e.db, headerFrom: e.plain ?? null } : { data: e.plain!, headerFrom: null }));
}

/** Header cells of a headered CSV, or null when its first row is data. */
export function headerOf(text: string): string[] | null {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const line = body.split(/\r?\n/, 1)[0] ?? '';
  const cells = line.split(detectDelimiter(line)).map((c) => c.trim().replace(/^"|"$/g, ''));
  return isHeaderRow(cells) ? cells : null;
}

export class PurdueBoilerGradesSource implements GradeSource {
  readonly info = PURDUE_GRADES_SOURCE_INFO;
  readonly dir: string;
  private readonly currentTerm: TermCode;
  private readonly yearsBack: number;
  private readonly log: PurdueGradesLogger;

  constructor(opts: PurdueBoilerGradesSourceOptions) {
    this.dir = path.resolve(opts.dir ?? DEFAULT_PURDUE_GRADES_DIR);
    this.currentTerm = opts.currentTerm;
    this.yearsBack = opts.yearsBack;
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  async fetch(opts: { schoolId: SchoolId }): Promise<PurdueGradesFetchResult> {
    if (opts.schoolId !== 'purdue') throw new Error(`PurdueBoilerGradesSource only serves school "purdue" (got "${opts.schoolId}")`);
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`No boiler-grades CSVs under ${this.dir}. Run \`npx tsx scripts/fetch-purdue.ts\` first.`);
      }
      throw err;
    }
    const chosen = chooseTermFiles(names);
    if (chosen.length === 0) throw new Error(`No *.csv files under ${this.dir}. Run \`npx tsx scripts/fetch-purdue.ts\` first.`);

    const rows: PurdueRawGradeRow[] = [];
    const excludedGradeCodes: Record<string, number> = {};
    const files: PurdueGradesFetchResult['files'] = [];
    let droppedRows = 0;
    let tinyCohortRows = 0;
    let fetchedAt = '';
    let outOfWindow = 0;
    for (const { data, headerFrom } of chosen) {
      const file = path.join(this.dir, data);
      const [text, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
      if (st.mtime.toISOString() > fetchedAt) fetchedAt = st.mtime.toISOString();
      const columns = headerFrom ? headerOf(await readFile(path.join(this.dir, headerFrom), 'utf8')) ?? undefined : undefined;
      const parsed: ParseBoilerGradesResult = parseBoilerGradesCsv(text, {
        columns, fileName: data, onWarn: (m) => this.log.warn(`[purdue-boiler-grades] ${m}`),
      });
      // §4 bookkeeping (excluded codes, dropped rows) is scoped to the grade window: convert only in-window rows.
      const inWindow = parsed.rows.filter((r) => inGradeWindow(r.term, this.currentTerm, this.yearsBack));
      outOfWindow += parsed.rows.length - inWindow.length;
      const converted = convertRows(inWindow);
      if (converted.unknownCodes.length > 0) this.log.warn(`[purdue-boiler-grades] ${data}: unknown grade codes ${converted.unknownCodes.join(', ')}`);
      for (const [code, n] of Object.entries(converted.excludedGradeCodes)) excludedGradeCodes[code] = (excludedGradeCodes[code] ?? 0) + n;
      droppedRows += converted.droppedRows;
      tinyCohortRows += converted.tinyCohortRows;
      const kept = converted.rows.length;
      rows.push(...converted.rows);
      const duplicates = converted.dropped.filter((d) => d.reason === 'duplicate-crn').length;
      const terms = [...new Set(parsed.rows.map((r) => r.term))].sort();
      files.push({ file: data, rows: parsed.rows.length, kept, dropped: converted.droppedRows, duplicateCrnRows: duplicates, tinyCohortRows: converted.tinyCohortRows, term: terms.join('+'), hadHeader: parsed.hadHeader });
      this.log.info(
        `[purdue-boiler-grades] ${data}${headerFrom ? ` (columns from ${headerFrom})` : ''}: ${parsed.rows.length} sections · ` +
          `${terms.join('+')} · kept ${kept} · dropped ${converted.droppedRows} (${duplicates} duplicate CRN rows, ${converted.droppedRows - duplicates} without a letter curve)` +
          ` · ${converted.tinyCohortRows} tiny-cohort rows suppressed` +
          (parsed.badTerm + parsed.badCourse > 0 ? ` · skipped ${parsed.badTerm} bad-term, ${parsed.badCourse} bad-course` : '') +
          (parsed.percentSumMismatch > 0 ? ` · ${parsed.percentSumMismatch} rows sum ≠ 100` : ''),
      );
    }
    this.log.info(`[purdue-boiler-grades] ${chosen.length} term files → ${rows.length} percent-only rows in window (${this.currentTerm} − ${this.yearsBack}y); ${outOfWindow} out of window; ${droppedRows} dropped; ${tinyCohortRows} suppressed as tiny cohorts`);
    return { rows, fetchedAt, excludedGradeCodes, droppedRows, tinyCohortRows, files };
  }
}
