// `npx tsx scripts/fetch-purdue.ts [--refresh] [--offline] [--subjects MA,CS] [--term 2026-fa] [--no-schedule]`
// Downloads the raw Purdue inputs (MULTI_SCHOOL_DESIGN §4.2, §7) to data/raw/purdue/ (gitignored):
//   grades/<term>.csv        every *.csv in the eduxstad/boiler-grades repo root (listed via the GitHub API;
//                            falls back to the known file list when the API is unavailable)
//   schedule/<term>/<S>.json purdue.io Sections for the school's subject allowlist (warms the ingest cache)
//   departments.json         subject code → [name] from the CSVs' "Subject Desc" and purdue.io Subject names
//                            (copy to data/config/purdue/departments.json to label subjects in the UI)
// Idempotent: cached files are reused unless --refresh. Ends with a one-line summary.
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from '@/lib/config/env';
import { PURDUE, PURDUE_SUBJECTS } from '@/lib/config/schools/purdue';
import type { TermCode } from '@/lib/domain/types';
import { DEFAULT_PURDUE_GRADES_DIR, PurdueBoilerGradesSource } from '@/lib/sources/purdue/PurdueBoilerGradesSource';
import { PURDUE_USER_AGENT, PurdueIoSource } from '@/lib/sources/purdue/PurdueIoSource';
import { parseBoilerGradesCsv } from '@/lib/sources/purdue/parseBoilerGradesCsv';
import { headerOf, chooseTermFiles } from '@/lib/sources/purdue/PurdueBoilerGradesSource';
import { isTermCode } from '@/lib/utils/term';
import { stableStringify } from '@/lib/utils/stableStringify';
import { flagBool, flagList, flagString, readArgs } from './lib/args';
import { fail, log } from './lib/log';

export const BOILER_GRADES_REPO = 'eduxstad/boiler-grades';
export const BOILER_GRADES_RAW_BASE = `https://raw.githubusercontent.com/${BOILER_GRADES_REPO}/main`;
/** Root-level CSVs seen in the repo on 2026-09-06 — used when the GitHub tree API is unreachable. */
export const KNOWN_TERM_FILES: readonly string[] = [
  'fall2021.csv', 'summer2023.csv', 'summer2023_db.csv', 'fall2023.csv', 'spring2024.csv', 'fall2024.csv',
  'spring2025.csv', 'fall2025.csv', 'fall2025_db.csv', 'spring2026.csv',
];

const HEADERS = { 'user-agent': PURDUE_USER_AGENT, accept: 'application/vnd.github+json, application/json, text/csv' };

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Root-level *.csv paths of the repo (GitHub tree API; null on failure). */
export async function listRepoCsvs(fetchImpl: typeof fetch = fetch): Promise<string[] | null> {
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${BOILER_GRADES_REPO}/git/trees/main?recursive=1`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { tree?: { path: string; type: string }[] };
    const files = (json.tree ?? []).filter((t) => t.type === 'blob' && /^[^/]+\.csv$/i.test(t.path)).map((t) => t.path).sort();
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}

async function downloadCsv(name: string, dir: string, refresh: boolean, offline: boolean): Promise<'cached' | 'downloaded' | 'skipped'> {
  const file = path.join(dir, name);
  if (!refresh && (await exists(file))) return 'cached';
  if (offline) return 'skipped';
  const url = `${BOILER_GRADES_RAW_BASE}/${name}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) fail(`download failed: HTTP ${res.status} for ${url}`);
  const text = await res.text();
  await mkdir(dir, { recursive: true });
  await writeFile(file, text, 'utf8');
  return 'downloaded';
}

/** Subject code → names from every cached CSV's "Subject Desc" ("AAE-Aero & Astro Engineering" → "Aero & Astro Engineering"). */
async function subjectNamesFromCsvs(dir: string): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const { data, headerFrom } of chooseTermFiles(await readdir(dir))) {
    const columns = headerFrom ? headerOf(await readFile(path.join(dir, headerFrom), 'utf8')) ?? undefined : undefined;
    const parsed = parseBoilerGradesCsv(await readFile(path.join(dir, data), 'utf8'), { columns, fileName: data, maxWarnings: 0 });
    for (const r of parsed.rows) {
      const desc = r.subjectDesc.replace(new RegExp(`^${r.subject}\\s*-\\s*`), '').trim();
      if (desc === '') continue;
      (out[r.subject] ??= new Set()).add(desc);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = readArgs();
  const refresh = flagBool(args, 'refresh');
  const offline = flagBool(args, 'offline');
  const noSchedule = flagBool(args, 'no-schedule');
  const termArg = flagString(args, 'term', PURDUE.currentTerm)!;
  if (!isTermCode(termArg)) fail(`--term must look like 2026-fa (got "${termArg}")`);
  const term: TermCode = termArg;
  const subjects = flagList(args, 'subjects', [...PURDUE_SUBJECTS]).map((s) => s.toUpperCase());
  const rawDir = path.resolve('data', 'raw', 'purdue');
  const gradesDir = path.resolve(DEFAULT_PURDUE_GRADES_DIR);
  await mkdir(gradesDir, { recursive: true });

  // 1. Grade CSVs.
  const listed = offline ? null : await listRepoCsvs();
  if (!listed) log.warn(`GitHub tree listing unavailable${offline ? ' (--offline)' : ''}; using the known file list`);
  const names = listed ?? [...KNOWN_TERM_FILES];
  const tally = { cached: 0, downloaded: 0, skipped: 0 };
  for (const name of names) {
    const r = await downloadCsv(name, gradesDir, refresh, offline);
    tally[r] += 1;
    log.info(`${name}: ${r}`);
  }
  const source = new PurdueBoilerGradesSource({ currentTerm: term, yearsBack: env.GRADE_YEARS_BACK, dir: gradesDir, log });
  const grades = await source.fetch({ schoolId: 'purdue' });

  // 2. Schedule cache for the allowlist (one request per subject).
  const schedule = new PurdueIoSource({ delayMs: Math.max(250, env.SCHEDULE_FETCH_DELAY_MS), refresh, log });
  let sections = 0;
  let usedTerm: TermCode = term;
  if (!noSchedule && !offline) {
    for (const subject of subjects) {
      const res = await schedule.fetchSections({ schoolId: 'purdue', term, subject });
      usedTerm = res.term;
      sections += res.sections.length;
    }
  }

  // 3. departments.json (subject names) from the CSVs + purdue.io.
  const byCode = await subjectNamesFromCsvs(gradesDir);
  for (const [code, name] of Object.entries(schedule.subjectNames)) (byCode[code] ??= new Set()).add(name);
  const departments = Object.fromEntries(Object.keys(byCode).sort().map((code) => [code, [...byCode[code]].sort()]));
  await writeFile(path.join(rawDir, 'departments.json'), stableStringify(departments, { indent: 2 }) + '\n', 'utf8');

  const excluded = Object.entries(grades.excludedGradeCodes).map(([c, n]) => `${c}=${n}`).join(' ');
  log.summary(
    `fetched ${names.length} boiler-grades files (${tally.downloaded} downloaded, ${tally.cached} cached, ${tally.skipped} skipped) · ` +
      `${grades.rows.length.toLocaleString('en-US')} percent-only sections in window (${grades.droppedRows} dropped; excluded codes ${excluded || 'none'}) · ` +
      (noSchedule || offline ? 'schedule skipped' : `${sections.toLocaleString('en-US')} ${usedTerm} sections for ${subjects.length} subjects (${schedule.stats.requests} requests, ${schedule.stats.cacheHits} cache hits)`) +
      ` · ${Object.keys(departments).length} subject names → data/raw/purdue/departments.json`,
  );
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
