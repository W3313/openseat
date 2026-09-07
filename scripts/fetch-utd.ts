// Downloads the UT Dallas grade CSVs (MULTI_SCHOOL_DESIGN §4.2, §7) into data/raw/utd/ (gitignored).
//
//   tsx scripts/fetch-utd.ts [--refresh] [--out data/raw/utd] [--years 6]
//
// Lists raw_data/ in acmutd/utd-grades through the GitHub contents API, keeps the
// enhanced_grades_enhanced_grades_<yy><f|s|u>.csv files whose term falls inside the grade window
// (UTD.currentTerm − GRADE_YEARS_BACK), and downloads each one that is missing or whose size differs from
// the listing (idempotent: a re-run with everything cached downloads nothing). --refresh re-downloads all.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { env } from '@/lib/config/env';
import { UTD } from '@/lib/config/schools/utd';
import type { TermCode } from '@/lib/domain/types';
import { DEFAULT_UTD_RAW_DIR } from '@/lib/sources/utd/UtdGradesCsvSource';
import { termFromUtdFilename } from '@/lib/sources/utd/parseUtdGradesCsv';
import { compareTerms, inGradeWindow } from '@/lib/utils/term';
import { flagBool, flagString, readArgs } from './lib/args';
import { fail, log } from './lib/log';

export const UTD_RAW_DATA_API = 'https://api.github.com/repos/acmutd/utd-grades/contents/raw_data';
export const USER_AGENT = 'ProfPeek/1.0 (+https://github.com/W3313/profpeek)';

const ListingSchema = z.array(z.object({ name: z.string(), size: z.number().int().nonnegative(), download_url: z.url().nullable() }));

export interface TermFileEntry {
  name: string;
  term: TermCode;
  size: number;
  downloadUrl: string;
}

/** Pure: GitHub contents listing → in-window term files, ascending by term. */
export function selectTermFiles(listing: unknown, currentTerm: TermCode, yearsBack: number): TermFileEntry[] {
  const entries = ListingSchema.parse(listing);
  const out: TermFileEntry[] = [];
  for (const e of entries) {
    const term = termFromUtdFilename(e.name);
    if (!term || !e.download_url || !inGradeWindow(term, currentTerm, yearsBack)) continue;
    out.push({ name: e.name, term, size: e.size, downloadUrl: e.download_url });
  }
  return out.sort((a, b) => compareTerms(a.term, b.term));
}

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size;
  } catch {
    return null;
  }
}

async function fetchText(url: string, accept: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main(): Promise<void> {
  const args = readArgs();
  const outDir = path.resolve(flagString(args, 'out', DEFAULT_UTD_RAW_DIR)!);
  const yearsBack = Number(flagString(args, 'years', String(env.GRADE_YEARS_BACK)));
  if (!Number.isInteger(yearsBack) || yearsBack < 1) fail(`--years must be a positive integer (got ${flagString(args, 'years')})`);
  const refresh = flagBool(args, 'refresh');

  log.info(`listing ${UTD_RAW_DATA_API}`);
  const listing = JSON.parse(await fetchText(UTD_RAW_DATA_API, 'application/vnd.github+json')) as unknown;
  const files = selectTermFiles(listing, UTD.currentTerm, yearsBack);
  if (files.length === 0) fail(`no term files inside the window (${UTD.currentTerm} − ${yearsBack}y) in the listing`);
  await mkdir(outDir, { recursive: true });

  let downloaded = 0;
  let cached = 0;
  let rows = 0;
  for (const f of files) {
    const dest = path.join(outDir, f.name);
    const localSize = await fileSize(dest);
    if (!refresh && localSize === f.size) {
      cached += 1;
    } else {
      log.info(`downloading ${f.name} (${f.term}, ${(f.size / 1024).toFixed(0)} KB)`);
      const text = await fetchText(f.downloadUrl, 'text/csv');
      await writeFile(dest, text, 'utf8');
      downloaded += 1;
    }
    const text = await readFile(dest, 'utf8');
    rows += Math.max(0, text.split('\n').filter((l) => l.trim() !== '').length - 1);
  }
  const rel = path.relative(process.cwd(), outDir) || '.';
  log.summary(
    `fetched ${files.length} UTD term files (${downloaded} downloaded, ${cached} cached) · ` +
      `${files[0].term} … ${files[files.length - 1].term} · ${rows.toLocaleString('en-US')} section rows → ${rel}/`,
  );
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
