// scripts/build-rankings.ts — SPEC 6.6. `npx tsx scripts/build-rankings.ts --school uiuc [--dir data/processed/uiuc]`
// For every subject: RankingsPayload → rankings/<SUBJECT>.json (< 200 KB); every professor →
// professors-detail.json (< 2 MB). Also refreshes meta.counts.summaries* from summaries.json.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Meta, ProfessorSummary, RankingsPayload, SchoolId } from '@/lib/domain/types';
import { type Env, env as processEnv } from '@/lib/config/env';
import { DEFAULT_SCHOOL_ID, processedDirName, toSchoolId } from '@/lib/config/schools';
import { readArgs, flagString } from './lib/args';
import { buildClock } from './lib/clock';
import { fail, log } from './lib/log';
import { indexData, loadProcessed } from './rankings/load';
import { buildSubjectPayload } from './rankings/payload';
import { buildProfessorDetails } from './rankings/detail';
import { n, readJsonIfExists, serialize, summaryCounts } from './ingest/write';

export const MAX_RANKINGS_FILE_BYTES = 200 * 1024;
export const MAX_DETAIL_FILE_BYTES = 2 * 1024 * 1024;

export interface BuildRankingsOptions {
  schoolId?: SchoolId;
  env?: Env;
  /** Overrides data/processed/<dir>. */
  dir?: string;
  now?: () => Date;
}

export interface BuildRankingsResult {
  dir: string;
  subjects: string[];
  /** rankings/<SUBJECT>.json → bytes */
  rankingSizes: Record<string, number>;
  detailBytes: number;
  professors: number;
  /** Files over their SPEC 6.6 budget (empty when everything fits). */
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
 * Read data/processed/<dir>, write rankings/*.json and professors-detail.json. Throws RankingsSizeError
 * after writing when a file exceeds its budget so the caller can exit non-zero (files stay for inspection).
 */
export async function buildRankings(opts: BuildRankingsOptions = {}): Promise<BuildRankingsResult> {
  const env = opts.env ?? processEnv;
  const schoolId = opts.schoolId ?? DEFAULT_SCHOOL_ID;
  const dir = opts.dir ?? path.join(ROOT, 'data', 'processed', processedDirName(schoolId, env.DATA_MODE));
  const generatedAt = buildClock(env, opts.now);

  const data = await loadProcessed(dir);
  const index = indexData(data);
  const codes = [...new Set(data.subjects.map((s) => s.code))].sort();
  log.info(`loaded ${n(data.professors.length)} professors · ${n(data.grades.length)} grade rows · ${n(data.sections.length)} sections · ${n(data.reviews.length)} reviews · ${codes.length} subjects`);

  const rankingsDir = path.join(dir, 'rankings');
  await mkdir(rankingsDir, { recursive: true });
  // Remove payloads of subjects that no longer exist so the directory mirrors subjects.json exactly.
  for (const file of await readdir(rankingsDir)) {
    if (file.endsWith('.json') && !codes.includes(file.slice(0, -5))) await rm(path.join(rankingsDir, file));
  }

  const rankingSizes: Record<string, number> = {};
  const oversized: string[] = [];
  const payloads: RankingsPayload[] = [];
  for (const code of codes) {
    const payload = buildSubjectPayload(data, index, code, { generatedAt });
    payloads.push(payload);
    const content = serialize(payload);
    const bytes = Buffer.byteLength(content, 'utf8');
    rankingSizes[`${code}.json`] = bytes;
    if (bytes > MAX_RANKINGS_FILE_BYTES) oversized.push(`rankings/${code}.json (${n(bytes)} B > ${n(MAX_RANKINGS_FILE_BYTES)} B)`);
    await writeFile(path.join(rankingsDir, `${code}.json`), content, 'utf8');
    const ranked = payload.professors.filter((p) => p.scores.reviewCount >= 3).length;
    log.info(`${code}: ${payload.professors.length} professors (${ranked} ranked) · ${payload.courses.length} courses · ${(bytes / 1024).toFixed(1)} KB`);
  }

  const details = buildProfessorDetails(data, index, payloads);
  const detailContent = serialize(details);
  const detailBytes = Buffer.byteLength(detailContent, 'utf8');
  if (detailBytes > MAX_DETAIL_FILE_BYTES) oversized.push(`professors-detail.json (${n(detailBytes)} B > ${n(MAX_DETAIL_FILE_BYTES)} B)`);
  await writeFile(path.join(dir, 'professors-detail.json'), detailContent, 'utf8');

  // Keep meta.counts.summaries* in step with summaries.json (precompute re-runs this script afterwards).
  const summaries = await readJsonIfExists<Record<string, ProfessorSummary>>(path.join(dir, 'summaries.json'));
  const meta: Meta = { ...data.meta, counts: { ...data.meta.counts, ...summaryCounts(summaries) } };
  await writeFile(path.join(dir, 'meta.json'), serialize(meta), 'utf8');

  const totalRanked = payloads.reduce((acc, p) => acc + p.professors.length, 0);
  const summary =
    `built ${codes.length} rankings payloads (${n(totalRanked)} professor entries, largest ${(Math.max(0, ...Object.values(rankingSizes)) / 1024).toFixed(1)} KB)` +
    ` · professors-detail.json ${n(Object.keys(details).length)} professors (${(detailBytes / 1024).toFixed(1)} KB)` +
    ` · summaries ${meta.counts.summariesClaude} claude / ${meta.counts.summariesOpenAiCompatible ?? 0} openai-compatible / ${meta.counts.summariesExtractive} extractive`;
  const result: BuildRankingsResult = { dir, subjects: codes, rankingSizes, detailBytes, professors: Object.keys(details).length, oversized, summary };
  if (oversized.length > 0) throw new RankingsSizeError(oversized);
  return result;
}

async function main(): Promise<void> {
  const args = readArgs();
  const schoolId = toSchoolId(flagString(args, 'school', DEFAULT_SCHOOL_ID));
  if (!schoolId) fail(`unknown --school ${flagString(args, 'school')}`);
  const result = await buildRankings({ schoolId, dir: flagString(args, 'dir') });
  log.summary(result.summary);
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
