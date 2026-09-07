// GradeSource over the fictional dataset written by scripts/seed-demo.ts (SPEC 6.2, 6.5). Reuses the
// real CSV parser on data/raw/demo/<school>/gpa.csv (same 23 columns; the fictional school id is `demo`)
// so the parser is exercised end-to-end for the demo school.
import { readFile } from 'node:fs/promises';
import { DEMO_FETCHED_AT } from './generator-types';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { GradeSource, RawGradeRow, SourceInfo } from '@/lib/sources/types';
import { filterGradeWindow, parseGpaCsv } from '@/lib/sources/uiuc/parseGpaCsv';

export const DEMO_RAW_DIR = path.join('data', 'raw', 'demo');

export function demoSourceLabel(seed: number): string {
  return `Fictional demo data (seed ${seed})`;
}

export function demoRawDir(schoolId: SchoolId, dir: string = DEMO_RAW_DIR): string {
  return path.resolve(dir, schoolId);
}

export interface DemoGradeSourceOptions {
  seed: number;                       // env DEMO_SEED (label only)
  /** When both are given, rows outside the grade window are dropped (mirrors the live adapter). */
  currentTerm?: TermCode;
  yearsBack?: number;
  /** Directory holding {school}/gpa.csv (default data/raw/demo). */
  dir?: string;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export class DemoGradeSource implements GradeSource {
  readonly info: SourceInfo;
  private readonly opts: DemoGradeSourceOptions;
  private readonly log: NonNullable<DemoGradeSourceOptions['log']>;

  constructor(opts: DemoGradeSourceOptions) {
    this.opts = opts;
    this.info = { id: 'demo-grades', label: demoSourceLabel(opts.seed), url: null, license: 'MIT' };
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  csvPath(schoolId: SchoolId): string {
    return path.join(demoRawDir(schoolId, this.opts.dir), 'gpa.csv');
  }

  async fetch(opts: { schoolId: SchoolId }): Promise<{ rows: RawGradeRow[]; fetchedAt: string }> {
    const file = this.csvPath(opts.schoolId);
    let text: string;
    let fetchedAt: string;
    try {
      text = await readFile(file, 'utf8');
      fetchedAt = DEMO_FETCHED_AT; // fixed snapshot instant so the demo pipeline is byte-reproducible
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Demo grade CSV not found at ${file}. Run \`npm run data:seed\` (scripts/seed-demo.ts) first.`);
      }
      throw err;
    }
    const parsed = parseGpaCsv(text, { onWarn: (m) => this.log.warn(`[demo-grades] ${m}`) });
    let rows = parsed.rows;
    let discarded = 0;
    if (this.opts.currentTerm && this.opts.yearsBack !== undefined) {
      const f = filterGradeWindow(rows, this.opts.currentTerm, this.opts.yearsBack);
      rows = f.kept;
      discarded = f.discarded;
    }
    this.log.info(`[demo-grades] parsed ${parsed.rows.length} fictional rows; kept ${rows.length}; discarded ${discarded}`);
    return { rows, fetchedAt };
  }
}
