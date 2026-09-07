// `npx tsx scripts/fetch-uh.ts [--refresh] [--offline] [--grades-only] [--raw-dir data/raw/uh]`
// Downloads the University of Houston raw data (MULTI_SCHOOL_DESIGN §4.2 row `uh`, §7) to data/raw/uh/ (gitignored):
//   1. resolves the latest cougargrades/publicdata GitHub release, downloads publicdata-bundle.tar.gz and
//      extracts edu.uh.grade_distribution/records.csv + edu.uh.publications.subjects/subjects.json
//      (skipped when records.csv is already cached, unless --refresh; --offline never downloads);
//   2. writes release.json (tag / publishedAt / asset) and departments.json ({ CODE: [name] } from
//      subjects.json — copy it to data/config/uh/departments.json so subjects get display names);
//   3. warms the Class Browser cache for the registry term + subject allowlist (skip with --grades-only).
// Idempotent; ends with a one-line summary.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from '@/lib/config/env';
import { UH, UH_SUBJECTS } from '@/lib/config/schools/uh';
import {
  BUNDLE_RECORDS_CSV, BUNDLE_SUBJECTS_JSON, PUBLICDATA_BUNDLE_ASSET, USER_AGENT, extractTarGzEntries, resolveLatestRelease, type ReleaseInfo,
} from '@/lib/sources/uh/bundle';
import { parseUhRecordsCsv } from '@/lib/sources/uh/parseRecordsCsv';
import { DEFAULT_UH_RAW_DIR } from '@/lib/sources/uh/UhCougarGradesSource';
import { UhClassBrowserSource } from '@/lib/sources/uh/UhClassBrowserSource';
import { compareTerms, termDisplay } from '@/lib/utils/term';
import { stableStringify } from '@/lib/utils/stableStringify';
import { flagBool, flagString, readArgs } from './lib/args';
import { fail, log } from './lib/log';

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function displayPath(abs: string): string {
  const rel = path.relative(process.cwd(), abs);
  return rel.startsWith('..') ? abs : rel;
}

/** Downloads the bundle (unless cached) and extracts the two files we need. Returns the release used. */
async function ensureBundle(rawDir: string, refresh: boolean, offline: boolean): Promise<ReleaseInfo | null> {
  const csvPath = path.join(rawDir, BUNDLE_RECORDS_CSV);
  const releasePath = path.join(rawDir, 'release.json');
  if (!refresh && (await exists(csvPath))) {
    log.info(`using cached ${displayPath(csvPath)}`);
    try {
      return JSON.parse(await readFile(releasePath, 'utf8')) as ReleaseInfo;
    } catch {
      return null;
    }
  }
  if (offline) fail(`${displayPath(csvPath)} is not cached and --offline was given`);
  const release = await resolveLatestRelease();
  log.info(`latest release ${release.tag} (${release.publishedAt ?? 'no date'}): ${release.asset.url}`);
  const res = await fetch(release.asset.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) fail(`bundle download failed: HTTP ${res.status}`);
  const gz = new Uint8Array(await res.arrayBuffer());
  await mkdir(rawDir, { recursive: true });
  await writeFile(path.join(rawDir, PUBLICDATA_BUNDLE_ASSET), gz);
  log.info(`saved ${(gz.byteLength / 1e6).toFixed(1)} MB bundle`);
  const entries = extractTarGzEntries(gz, new Set([BUNDLE_RECORDS_CSV, BUNDLE_SUBJECTS_JSON]));
  for (const name of [BUNDLE_RECORDS_CSV, BUNDLE_SUBJECTS_JSON]) {
    const bytes = entries.get(name);
    if (!bytes) fail(`bundle has no entry ${name}`);
    const target = path.join(rawDir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    log.info(`extracted ${name} (${(bytes.byteLength / 1e6).toFixed(1)} MB)`);
  }
  await writeFile(releasePath, stableStringify({ ...release, downloadedAt: new Date().toISOString() }, { indent: 2 }) + '\n', 'utf8');
  return release;
}

/** subjects.json ({ "COSC": "Computer Science", … }) → departments map ({ "COSC": ["Computer Science"] }). */
export function departmentsFromSubjects(subjects: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (typeof subjects !== 'object' || subjects === null) return out;
  for (const [code, name] of Object.entries(subjects as Record<string, unknown>)) {
    if (typeof name === 'string' && name.trim() !== '') out[code.trim().toUpperCase()] = [name.trim()];
  }
  return out;
}

async function main(): Promise<void> {
  const args = readArgs();
  const rawDir = path.resolve(flagString(args, 'raw-dir', DEFAULT_UH_RAW_DIR)!);
  const refresh = flagBool(args, 'refresh');
  const offline = flagBool(args, 'offline');

  const release = await ensureBundle(rawDir, refresh, offline);
  const text = await readFile(path.join(rawDir, BUNDLE_RECORDS_CSV), 'utf8');
  const parsed = parseUhRecordsCsv(text, { onWarn: (m) => log.warn(m) });
  const terms = [...new Set(parsed.rows.map((r) => r.yearTerm))].sort((a, b) => compareTerms(a as `${number}-fa`, b as `${number}-fa`));
  const subjectCodes = new Set(parsed.rows.map((r) => r.subject));
  log.info(
    `parsed ${parsed.rows.length.toLocaleString('en-US')} grade rows · ${parsed.coTaughtSections} co-taught sections split · ` +
      `${parsed.mergedDuplicateRows} duplicate rows merged · ${parsed.droppedRows} empty rows dropped · excluded codes ` +
      Object.entries(parsed.excludedGradeCodes).map(([k, v]) => `${k}=${v}`).join(', '),
  );

  let departments: Record<string, string[]> = {};
  try {
    departments = departmentsFromSubjects(JSON.parse(await readFile(path.join(rawDir, BUNDLE_SUBJECTS_JSON), 'utf8')));
    await writeFile(path.join(rawDir, 'departments.json'), stableStringify(departments, { indent: 2 }) + '\n', 'utf8');
  } catch (err) {
    log.warn(`could not derive departments.json: ${(err as Error).message}`);
  }

  let scheduleNote = 'schedule skipped (--grades-only)';
  if (!flagBool(args, 'grades-only') && !offline) {
    const source = new UhClassBrowserSource({ refresh, delayMs: env.SCHEDULE_FETCH_DELAY_MS, log, cacheDir: path.join(rawDir, 'classbrowser') });
    let sections = 0;
    for (const subject of UH_SUBJECTS) {
      const res = await source.fetchSections({ schoolId: 'uh', term: UH.currentTerm, subject });
      sections += res.sections.length;
    }
    scheduleNote = `schedule ${UH.currentTerm}: ${UH_SUBJECTS.length} subjects, ${sections.toLocaleString('en-US')} sections (${source.stats.requests} requests, ${source.stats.cacheHits} cache hits)`;
  } else if (offline) scheduleNote = 'schedule skipped (--offline)';

  log.summary(
    `fetched UH bundle ${release?.tag ?? '(cached)'} · ${parsed.rows.length.toLocaleString('en-US')} grade rows ` +
      `(${termDisplay(terms[0] as `${number}-fa`)} → ${termDisplay(terms[terms.length - 1] as `${number}-fa`)}, ${subjectCodes.size} subjects, ` +
      `${Object.keys(departments).length} subject names) · ${scheduleNote} → ${displayPath(rawDir)}/`,
  );
}

/** Run only when executed directly (`tsx scripts/...`), never when imported by tests. */
const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
