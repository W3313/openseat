// scripts/fetch-ucsb.ts — downloads the Daily Nexus UCSB grades CSV to data/raw/ucsb/courseGrades.csv
// (gitignored; reused when present) and prints a one-line summary (MULTI_SCHOOL_DESIGN §7).
//
//   npx tsx scripts/fetch-ucsb.ts [--refresh] [--offline] [--top 20] [--years 6] [--term 2026-fa]
//
// --refresh re-downloads even if cached; --offline never downloads. --top N lists the N largest subjects
// by letter-graded students inside the grade window (this is how UCSB_SUBJECTS in
// src/lib/config/schools/ucsb.ts was chosen). The schedule needs no fetch here: UcsbCurriculumsSource
// caches its own JSON under data/raw/ucsb/<term>/ during ingest when UCSB_API_KEY is set.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TermCode } from '@/lib/domain/types';
import { DEFAULT_UCSB_GRADES_CSV_PATH, UCSB_GRADES_CSV_URL } from '@/lib/sources/ucsb/UcsbGradesSource';
import { type UcsbRawGradeRow, parseCourseGradesCsv } from '@/lib/sources/ucsb/parseCourseGrades';
import { assertTermCode, inGradeWindow } from '@/lib/utils/term';
import { flagBool, flagString, readArgs } from './lib/args';
import { fail, log } from './lib/log';

export const USER_AGENT = 'ProfPeek/1.0 (+https://github.com/W3313/profpeek)';

export interface SubjectSize { subject: string; graded: number; rows: number; instructors: number }

/** Pure: subjects ranked by letter-graded students inside the window (ties: rows, then code). */
export function rankSubjects(rows: readonly UcsbRawGradeRow[], currentTerm: TermCode, yearsBack: number): SubjectSize[] {
  const by = new Map<string, { graded: number; rows: number; instructors: Set<string> }>();
  for (const r of rows) {
    if (!inGradeWindow(r.yearTerm as TermCode, currentTerm, yearsBack)) continue;
    const s = by.get(r.subject) ?? { graded: 0, rows: 0, instructors: new Set<string>() };
    s.graded += r.students;
    s.rows += 1;
    if (r.instructorRaw !== '') s.instructors.add(r.instructorRaw);
    by.set(r.subject, s);
  }
  return [...by.entries()]
    .map(([subject, s]) => ({ subject, graded: s.graded, rows: s.rows, instructors: s.instructors.size }))
    .sort((a, b) => b.graded - a.graded || b.rows - a.rows || a.subject.localeCompare(b.subject));
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function ensureCsv(csvPath: string, refresh: boolean, offline: boolean): Promise<{ text: string; downloaded: boolean }> {
  if (!refresh && (await exists(csvPath))) {
    log.info(`using cached CSV ${csvPath}`);
    return { text: await readFile(csvPath, 'utf8'), downloaded: false };
  }
  if (offline) fail(`CSV not cached at ${csvPath} and --offline was given`);
  log.info(`downloading ${UCSB_GRADES_CSV_URL}`);
  const res = await fetch(UCSB_GRADES_CSV_URL, { signal: AbortSignal.timeout(120_000), headers: { 'user-agent': USER_AGENT, accept: 'text/csv' } });
  if (!res.ok) fail(`download failed: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(path.dirname(csvPath), { recursive: true });
  await writeFile(csvPath, text, 'utf8');
  log.info(`saved ${(text.length / 1e6).toFixed(1)} MB to ${csvPath}`);
  return { text, downloaded: true };
}

function displayPath(abs: string): string {
  const rel = path.relative(process.cwd(), abs);
  return rel.startsWith('..') ? abs : rel;
}

async function main(): Promise<void> {
  const args = readArgs();
  const csvPath = path.resolve(flagString(args, 'csv', DEFAULT_UCSB_GRADES_CSV_PATH)!);
  const top = Number(flagString(args, 'top', '0'));
  const yearsBack = Number(flagString(args, 'years', '6'));
  const currentTerm = assertTermCode(flagString(args, 'term', '2026-fa')!, '--term');

  const { text, downloaded } = await ensureCsv(csvPath, flagBool(args, 'refresh'), flagBool(args, 'offline'));
  const parsed = parseCourseGradesCsv(text, { onWarn: (m) => log.warn(m) });
  const ranked = rankSubjects(parsed.rows, currentTerm, yearsBack);
  const inWindow = ranked.reduce((a, s) => a + s.rows, 0);
  if (top > 0) {
    for (const [i, s] of ranked.slice(0, top).entries()) {
      log.info(`${String(i + 1).padStart(2)}. ${s.subject.padEnd(6)} ${s.graded.toLocaleString('en-US').padStart(8)} graded · ${s.rows} rows · ${s.instructors} instructors`);
    }
  }
  const ex = parsed.excludedGradeCodes;
  log.summary(
    `${downloaded ? 'fetched' : 'cached'} ${parsed.rows.length.toLocaleString('en-US')} letter-graded rows ` +
      `(${parsed.droppedRows.toLocaleString('en-US')} without letter grades dropped; excluded P=${ex.P} NP=${ex.NP} S=${ex.S} U=${ex.U} IP=${ex.IP}) · ` +
      `${inWindow.toLocaleString('en-US')} rows in ${ranked.length} subjects inside ${currentTerm} − ${yearsBack}y → ${displayPath(csvPath)}`,
  );
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
