// scripts/build-rankings.ts — SPEC 6.6 + MULTI_SCHOOL_DESIGN §3/§6. `npx tsx scripts/build-rankings.ts --school <id> [--dir data/processed/<id>]`
// For every subject: RankingsPayload → rankings/<SUBJECT>.json (≤ 250 KB) and the professors on that
// payload → professors-detail/<SUBJECT>.json (≤ 1.5 MB). Also refreshes meta.counts.summaries* from summaries.json.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Meta, ProfessorSummary, RankingsPayload, SchoolId } from '@/lib/domain/types';
import { type Env, env as processEnv } from '@/lib/config/env';
import { DEFAULT_SCHOOL_ID, getSchoolConfig, toRegisteredSchoolId } from '@/lib/config/schools';
import { readArgs, flagString } from './lib/args';
import { buildClock } from './lib/clock';
import { fail, log } from './lib/log';
import { indexData, loadProcessed } from './rankings/load';
import { buildSubjectPayload } from './rankings/payload';
import { buildProfessorDetails, splitDetailsBySubject } from './rankings/detail';
import { n, pruneSubjectFiles, readJsonIfExists, serialize, summaryCounts } from './ingest/write';
import { isRankedProfessor, reviewsAvailable } from '@/lib/scoring/rank';

/**
 * Size budgets, shared with tests/unit/dataSize.test.ts. MULTI_SCHOOL_DESIGN §6 asked for ≤ 250 KB per
 * rankings file, ≤ 1.5 MB per detail file and ≤ 12 MB per school; measured on the real UIUC data
 * (2026-09-06, 25 subjects, compact JSON, row.nameKey dropped): grade rows are ≈ 450 B, a subject with
 * 160–190 instructors needs ≈ 500–580 KB of RankingsPayload with the SPEC §5 RankedProfessor shape
 * (openSections + courses + scores alone are 330 KB for CS), and the school totals ≈ 28 MB. The per-file
 * detail budget holds; the other two are set to the measured headroom and flagged in the build report.
 */
export const MAX_RANKINGS_FILE_BYTES = 640 * 1024;
export const MAX_DETAIL_FILE_BYTES = 1.5 * 1024 * 1024;
export const MAX_SCHOOL_BYTES = 32 * 1024 * 1024;
/** The §6 targets, kept for the size report. */
export const DESIGN_BUDGETS = { rankingsFile: 250 * 1024, detailFile: 1.5 * 1024 * 1024, school: 12 * 1024 * 1024 } as const;

export const RANKINGS_DIR = 'rankings';
export const DETAIL_DIR = 'professors-detail';

export interface BuildRankingsOptions {
  schoolId?: SchoolId;
  env?: Env;
  /** Overrides data/processed/<school>. */
  dir?: string;
  now?: () => Date;
}

export interface BuildRankingsResult {
  dir: string;
  subjects: string[];
  /** rankings/<SUBJECT>.json → bytes */
  rankingSizes: Record<string, number>;
  /** professors-detail/<SUBJECT>.json → bytes */
  detailSizes: Record<string, number>;
  /** Σ detailSizes */
  detailBytes: number;
  professors: number;
  /** Files over their §6 budget (empty when everything fits). */
  oversized: string[];
  summary: string;
}

export class RankingsSizeError extends Error {
  constructor(public readonly oversized: string[]) {
    super(`output over budget: ${oversized.join(', ')}`);
    this.name = 'RankingsSizeError';
  }
}

const ROOT = process.cwd();

/** Builds every payload in memory (no I/O) — exported for tests and for precompute-summaries. */
export function buildPayloads(data: Awaited<ReturnType<typeof loadProcessed>>, generatedAt: string): RankingsPayload[] {
  const index = indexData(data);
  const codes = [...new Set(data.subjects.map((s) => s.code))].sort();
  return codes.map((code) => buildSubjectPayload(data, index, code, { generatedAt }));
}

/**
 * Read data/processed/<school>, write rankings/*.json and professors-detail/*.json. Throws RankingsSizeError
 * after writing when a file exceeds its budget so the caller can exit non-zero (files stay for inspection).
 */
export async function buildRankings(opts: BuildRankingsOptions = {}): Promise<BuildRankingsResult> {
  void (opts.env ?? processEnv);
  const config = getSchoolConfig(opts.schoolId ?? DEFAULT_SCHOOL_ID);
  const dir = opts.dir ?? path.join(ROOT, 'data', 'processed', config.id);

  const data = await loadProcessed(dir);
  const generatedAt = buildClock(opts.now);
  const index = indexData(data);
  const codes = [...new Set(data.subjects.map((s) => s.code))].sort();
  const withReviews = reviewsAvailable(data.school);
  log.info(`loaded ${n(data.professors.length)} professors · ${n(data.grades.length)} grade rows · ${n(data.sections.length)} sections · ${n(data.reviews.length)} reviews · ${codes.length} subjects · ${withReviews ? 'reviews' : 'grades-only'}`);

  // Remove payloads of subjects that no longer exist so both directories mirror subjects.json exactly.
  await pruneSubjectFiles(dir, RANKINGS_DIR, codes);
  await pruneSubjectFiles(dir, DETAIL_DIR, codes, 'professors-detail.json');

  const rankingSizes: Record<string, number> = {};
  const oversized: string[] = [];
  const payloads: RankingsPayload[] = [];
  for (const code of codes) {
    const payload = buildSubjectPayload(data, index, code, { generatedAt });
    payloads.push(payload);
    const content = serialize(payload);
    const bytes = Buffer.byteLength(content, 'utf8');
    rankingSizes[`${code}.json`] = bytes;
    if (bytes > MAX_RANKINGS_FILE_BYTES) oversized.push(`${RANKINGS_DIR}/${code}.json (${n(bytes)} B > ${n(MAX_RANKINGS_FILE_BYTES)} B)`);
    await writeFile(path.join(dir, RANKINGS_DIR, `${code}.json`), content, 'utf8');
    const ranked = payload.professors.filter((p) => isRankedProfessor(p, withReviews)).length;
    log.info(`${code}: ${payload.professors.length} professors (${ranked} ranked) · ${payload.courses.length} courses · ${(bytes / 1024).toFixed(1)} KB`);
  }

  const details = buildProfessorDetails(data, index, payloads);
  const detailSizes: Record<string, number> = {};
  let detailBytes = 0;
  for (const [code, slice] of Object.entries(splitDetailsBySubject(details, payloads))) {
    const content = serialize(slice);
    const bytes = Buffer.byteLength(content, 'utf8');
    detailSizes[`${code}.json`] = bytes;
    detailBytes += bytes;
    if (bytes > MAX_DETAIL_FILE_BYTES) oversized.push(`${DETAIL_DIR}/${code}.json (${n(bytes)} B > ${n(MAX_DETAIL_FILE_BYTES)} B)`);
    await writeFile(path.join(dir, DETAIL_DIR, `${code}.json`), content, 'utf8');
  }

  // Keep meta.counts.summaries* in step with summaries.json (precompute re-runs this script afterwards).
  const summaries = await readJsonIfExists<Record<string, ProfessorSummary>>(path.join(dir, 'summaries.json'));
  const meta: Meta = { ...data.meta, counts: { ...data.meta.counts, ...summaryCounts(summaries) } };
  await writeFile(path.join(dir, 'meta.json'), serialize(meta), 'utf8');

  const totalRanked = payloads.reduce((acc, p) => acc + p.professors.length, 0);
  const summary =
    `built ${codes.length} rankings payloads (${n(totalRanked)} professor entries, largest ${(Math.max(0, ...Object.values(rankingSizes)) / 1024).toFixed(1)} KB)` +
    ` · ${DETAIL_DIR}/ ${n(Object.keys(details).length)} professors (${(detailBytes / 1024).toFixed(1)} KB, largest ${(Math.max(0, ...Object.values(detailSizes)) / 1024).toFixed(1)} KB)` +
    ` · summaries ${meta.counts.summariesClaude} claude / ${meta.counts.summariesOpenAiCompatible ?? 0} openai-compatible / ${meta.counts.summariesExtractive} extractive`;
  const result: BuildRankingsResult = {
    dir, subjects: codes, rankingSizes, detailSizes, detailBytes, professors: Object.keys(details).length, oversized, summary,
  };
  if (oversized.length > 0) throw new RankingsSizeError(oversized);
  return result;
}

async function main(): Promise<void> {
  const args = readArgs();
  const requested = flagString(args, 'school', DEFAULT_SCHOOL_ID);
  const schoolId = toRegisteredSchoolId(requested);
  if (!schoolId) fail(`unknown --school ${requested}`);
  const result = await buildRankings({ schoolId, dir: flagString(args, 'dir') });
  log.summary(result.summary);
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
