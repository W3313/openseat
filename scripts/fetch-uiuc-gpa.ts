// `npm run data:fetch` — downloads the public UIUC GPA dataset to data/raw/uiuc/uiuc-gpa-dataset.csv
// (gitignored; reused when present) and regenerates the two committed, impersonal config files
// (SPEC 6.4): data/config/uiuc/course-priors.json and data/config/uiuc/real-instructor-keys.json.
//
//   tsx scripts/fetch-uiuc-gpa.ts [--subjects CS,ECE] [--refresh] [--offline] [--out data/config/uiuc]
//
// --subjects  filters course-priors.json (default: env SUBJECTS). real-instructor-keys.json always covers
//             the whole dataset. --refresh re-downloads even if the CSV is cached; --offline never downloads.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from '@/lib/config/env';
import type { GradeBuckets } from '@/lib/domain/types';
import { GPA_POINTS } from '@/lib/domain/constants';
import type { RawGradeRow } from '@/lib/sources/types';
import { DEFAULT_UIUC_GPA_CSV_PATH } from '@/lib/sources/uiuc/UiucGpaCsvSource';
import { parseGpaCsv } from '@/lib/sources/uiuc/parseGpaCsv';
import { instructorKeyFromRaw } from '@/lib/utils/hash';
import { makeCourseId } from '@/lib/utils/ids';
import { stableStringify } from '@/lib/utils/stableStringify';
import { flagBool, flagList, flagString, readArgs } from './lib/args';
import { fail, log } from './lib/log';

export const MIN_PRIOR_GRADED = 200;

export interface CoursePrior {
  courseId: string; subject: string; number: string; title: string;
  gpaMean: number; graded: number;
  bucketShares: GradeBuckets;          // letters: count / graded (sum to 1); w: w / students (= wRate)
  typicalRowSize: number;              // median graded per row
  wRate: number;
  gpaByYear: { year: number; gpa: number }[];
}

const LETTER_KEYS = Object.keys(GPA_POINTS) as (keyof typeof GPA_POINTS)[];
/** GPA points in integer hundredths (A- = 367) so per-row sums are exact. */
const POINTS_100 = Object.fromEntries(LETTER_KEYS.map((k) => [k, Math.round(GPA_POINTS[k] * 100)])) as Record<keyof typeof GPA_POINTS, number>;

function gradedOf(b: GradeBuckets): number {
  return LETTER_KEYS.reduce((s, k) => s + b[k], 0);
}
/**
 * Round to 3 dp the way Python's round() does: correctly rounded on the EXACT binary value (what
 * Number#toFixed implements), with genuine ties broken to even. The committed file was produced that
 * way; stableStringify's half-away-from-zero nudge would flip ~1 in 300 values (3.4335 → 3.434 where the
 * stored double is really 3.43349999…). A double is an exact 3-dp tie only when it is an odd multiple of
 * 1/16 (0.0625, 0.1875, …), which `x * 16` detects exactly.
 */
export function round3(x: number): number {
  const sixteenths = x * 16;
  if (Number.isInteger(sixteenths) && sixteenths % 2 !== 0) {
    const k = Math.floor(x * 1000);            // x·1000 = k + 0.5 exactly
    return (k % 2 === 0 ? k : k + 1) / 1000;
  }
  return Number(x.toFixed(3));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.floor((s[mid - 1] + s[mid]) / 2);
}

/** Per-row quality points as an exact decimal (integer hundredths / 100) — avoids float drift from 3.67 × n. */
function rowPoints(b: GradeBuckets): number {
  return LETTER_KEYS.reduce((s, k) => s + b[k] * POINTS_100[k], 0) / 100;
}

/**
 * Pure: course priors for the given subjects (all sched types, all years). Sorted by courseId.
 * Arithmetic order is fixed so the committed file is byte-reproducible: points are accumulated per
 * calendar year (ascending), gpaByYear = pointsYear / gradedYear, gpaMean = Σ pointsYear / Σ gradedYear.
 */
export function buildCoursePriors(rows: readonly RawGradeRow[], subjects: readonly string[]): CoursePrior[] {
  const wanted = new Set(subjects.map((s) => s.toUpperCase()));
  const groups = new Map<string, { subject: string; number: string; rows: RawGradeRow[] }>();
  for (const r of rows) {
    if (wanted.size > 0 && !wanted.has(r.subject)) continue;
    const key = `${r.subject}:${r.number}`;
    const g = groups.get(key) ?? { subject: r.subject, number: r.number, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const out: CoursePrior[] = [];
  for (const g of groups.values()) {
    const total = {} as GradeBuckets;
    for (const k of [...LETTER_KEYS, 'w'] as (keyof GradeBuckets)[]) total[k] = 0;
    const byYear = new Map<number, { graded: number; points: number }>();
    const rowSizes: number[] = [];
    let latest: RawGradeRow | null = null;
    for (const r of g.rows) {
      const rg = gradedOf(r.buckets);
      for (const k of Object.keys(total) as (keyof GradeBuckets)[]) total[k] += r.buckets[k];
      const y = byYear.get(r.year) ?? { graded: 0, points: 0 };
      y.graded += rg;
      y.points += rowPoints(r.buckets);
      byYear.set(r.year, y);
      if (rg > 0) rowSizes.push(rg);
      if (!latest || r.yearTerm > latest.yearTerm) latest = r;
    }
    const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
    let graded = 0;
    let points = 0;
    for (const [, v] of years) {
      graded += v.graded;
      points += v.points;
    }
    if (graded < MIN_PRIOR_GRADED || !latest) continue;
    const students = graded + total.w;
    const wRate = round3(students > 0 ? total.w / students : 0);
    const shares = {} as GradeBuckets;                                   // letters: count / graded; w: w / students
    for (const k of LETTER_KEYS) shares[k] = round3(total[k] / graded);
    shares.w = wRate;
    out.push({
      courseId: makeCourseId('uiuc', g.subject, g.number),
      subject: g.subject,
      number: g.number,
      title: latest.title,
      gpaMean: round3(points / graded),
      graded,
      bucketShares: shares,
      typicalRowSize: median(rowSizes),
      wRate,
      gpaByYear: years.filter(([, v]) => v.graded > 0).map(([year, v]) => ({ year, gpa: round3(v.points / v.graded) })),
    });
  }
  return out.sort((a, b) => (a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0));
}

/** Pure: sorted unique 12-hex collision keys for every distinct non-empty Primary Instructor. */
export function buildRealInstructorKeys(rows: readonly RawGradeRow[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.instructorRaw === '') continue;
    const k = instructorKeyFromRaw(r.instructorRaw);
    if (k) keys.add(k);
  }
  return [...keys].sort();
}

/** Float-valued fields of a CoursePrior (rendered `0.0`, never `0`, so the committed file is byte-stable). */
const FLOAT_KEYS = ['aPlus', 'a', 'aMinus', 'bPlus', 'b', 'bMinus', 'cPlus', 'c', 'cMinus', 'dPlus', 'd', 'dMinus', 'f', 'w', 'gpaMean', 'wRate', 'gpa'];
const FLOAT_LINE_RE = new RegExp(`^(\\s*"(?:${FLOAT_KEYS.join('|')})": -?\\d+)(,?)$`, 'gm');

/** stableStringify (sorted keys, 2-space indent, 3 dp) with whole-number floats written as `N.0`. */
export function serializePriors(priors: readonly CoursePrior[]): string {
  return stableStringify(priors).replace(FLOAT_LINE_RE, '$1.0$2') + '\n';
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function ensureCsv(csvPath: string, refresh: boolean, offline: boolean): Promise<string> {
  if (!refresh && (await exists(csvPath))) {
    log.info(`using cached CSV ${csvPath}`);
    return readFile(csvPath, 'utf8');
  }
  if (offline) fail(`CSV not cached at ${csvPath} and --offline was given`);
  log.info(`downloading ${env.UIUC_GPA_CSV_URL}`);
  const res = await fetch(env.UIUC_GPA_CSV_URL, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) fail(`download failed: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(path.dirname(csvPath), { recursive: true });
  await writeFile(csvPath, text, 'utf8');
  log.info(`saved ${(text.length / 1e6).toFixed(1)} MB to ${csvPath}`);
  return text;
}

/**
 * Node's parseArgs (strict: false) reads an undeclared `--name value` as `name: true` plus a positional.
 * Rewrite to `--name=value` so `--subjects CS,ECE` and `--subjects=CS,ECE` both work.
 */
function normalizeArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (/^--[a-zA-Z][\w-]*$/.test(a) && next !== undefined && !next.startsWith('-')) {
      out.push(`${a}=${next}`);
      i += 1;
    } else out.push(a);
  }
  return out;
}

function displayPath(abs: string): string {
  const rel = path.relative(process.cwd(), abs);
  return rel.startsWith('..') ? abs : rel;
}

async function main(): Promise<void> {
  const args = readArgs(normalizeArgv(process.argv.slice(2)));
  const subjects = flagList(args, 'subjects', env.SUBJECTS).map((s) => s.toUpperCase());
  const outDir = path.resolve(flagString(args, 'out', path.join('data', 'config', 'uiuc'))!);
  const csvPath = path.resolve(flagString(args, 'csv', DEFAULT_UIUC_GPA_CSV_PATH)!);

  const text = await ensureCsv(csvPath, flagBool(args, 'refresh'), flagBool(args, 'offline'));
  const parsed = parseGpaCsv(text, { onWarn: (m) => log.warn(m) });
  log.info(`parsed ${parsed.rows.length.toLocaleString('en-US')} rows` +
    (parsed.studentsMismatch ? ` (${parsed.studentsMismatch} Students ≠ Σ buckets)` : ''));

  const priors = buildCoursePriors(parsed.rows, subjects);
  const keys = buildRealInstructorKeys(parsed.rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'course-priors.json'), serializePriors(priors), 'utf8');
  await writeFile(path.join(outDir, 'real-instructor-keys.json'), stableStringify(keys) + '\n', 'utf8');

  const subjectsWithPriors = new Set(priors.map((p) => p.subject)).size;
  log.summary(
    `fetched ${parsed.rows.length.toLocaleString('en-US')} grade rows · ${priors.length} course priors ` +
      `(${subjectsWithPriors}/${subjects.length} subjects, ≥ ${MIN_PRIOR_GRADED} graded) · ` +
      `${keys.length.toLocaleString('en-US')} real-instructor keys → ${displayPath(outDir)}/`,
  );
}

/** Run only when executed directly (`tsx scripts/...`), never when imported by tests or probes. */
const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
