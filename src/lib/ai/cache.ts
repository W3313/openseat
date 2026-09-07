// SPEC 9.7 — summary cache. data/processed/<school>/summaries.json (Record<professorId, ProfessorSummary>)
// is read once into a module-level Map. Runtime NEVER writes to disk (Vercel FS is read-only); the
// precompute script writes the file through writeSummariesFile.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProfessorSummary, SchoolId } from '@/lib/domain/types';
import { PROMPT_VERSION } from '@/lib/domain/constants';
import { processedDirName, toSchoolId } from '@/lib/config/schools';
import { assertServerOnly } from '@/lib/config/serverOnly';
import { sha256Hex } from '@/lib/utils/hash';
import { stableStringify } from '@/lib/utils/stableStringify';

assertServerOnly('src/lib/ai/cache.ts');

/** Value stored in ProfessorSummary.model / used in the inputHash for the no-key path. */
export const EXTRACTIVE_MODEL_TAG = 'extractive';

export interface SummaryHashInput {
  professorId: string;
  /** env.ANTHROPIC_MODEL for Claude output, EXTRACTIVE_MODEL_TAG otherwise. */
  modelOrExtractive: string;
  selectedReviewIds: readonly string[];
  ratingShrunk: number | null;
  gpaDelta: number | null;
  reviewCount: number;
}

function round2(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'null';
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  return (value < 0 && rounded !== 0 ? -rounded : rounded).toFixed(2);
}

/** sha256(professorId | PROMPT_VERSION | model | sortedIds.join(',') | round2(rating) | round2(delta ?? 'null') | n).slice(0, 16). */
export function summaryInputHash(input: SummaryHashInput): string {
  const ids = [...new Set(input.selectedReviewIds)].sort().join(',');
  const material = [
    input.professorId,
    String(PROMPT_VERSION),
    input.modelOrExtractive,
    ids,
    round2(input.ratingShrunk),
    round2(input.gpaDelta),
    String(input.reviewCount),
  ].join('|');
  return sha256Hex(material).slice(0, 16);
}

/** A cached entry is valid iff its inputHash equals the freshly computed one. */
export function isSummaryValid(summary: ProfessorSummary, expectedInputHash: string): boolean {
  return summary.inputHash === expectedInputHash;
}

// ── module-level store ───────────────────────────────────────────────────────────────────────────────
const store = new Map<string, ProfessorSummary>();
const loaded = new Map<SchoolId, Promise<void>>();

/** Absolute path of a school's summaries.json (data/processed/<school>/summaries.json). */
export function summariesFilePath(schoolId: SchoolId, dataDir = path.join(process.cwd(), 'data', 'processed')): string {
  return path.join(dataDir, processedDirName(schoolId), 'summaries.json');
}

/** Read summaries.json from disk; {} when the file is absent. Never throws on ENOENT. */
export async function readSummariesFile(filePath: string): Promise<Record<string, ProfessorSummary>> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return {};
    throw err;
  }
  const parsed = JSON.parse(text) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`summaries.json must be an object keyed by professorId (${filePath})`);
  }
  return parsed as Record<string, ProfessorSummary>;
}

/** Serialize for the script: sorted keys, deterministic floats (utils/stableStringify). */
export function serializeSummaries(entries: ReadonlyMap<string, ProfessorSummary> | Record<string, ProfessorSummary>): string {
  const record = entries instanceof Map ? Object.fromEntries(entries) : entries;
  return `${stableStringify(record)}\n`;
}

/** Load data/processed/<school>/summaries.json into the module-level Map (idempotent per school). */
export function loadSummaryCache(schoolId: SchoolId): Promise<ReadonlyMap<string, ProfessorSummary>> {
  let pending = loaded.get(schoolId);
  if (!pending) {
    pending = readSummariesFile(summariesFilePath(schoolId)).then((entries) => {
      for (const [id, summary] of Object.entries(entries)) store.set(id, summary);
    });
    loaded.set(schoolId, pending);
    pending.catch(() => loaded.delete(schoolId)); // let a later call retry after a transient error
  }
  return pending.then(() => store);
}

/** "uiuc:p:slug" → "uiuc"; null when the prefix is not a known school. */
export function schoolIdOfProfessor(professorId: string): SchoolId | null {
  return toSchoolId(professorId.split(':')[0]);
}

/** Cached entry for a professor, or null. Validity (inputHash match) is checked by the caller. */
export async function getCachedSummary(professorId: string): Promise<ProfessorSummary | null> {
  const schoolId = schoolIdOfProfessor(professorId);
  if (schoolId && !loaded.has(schoolId)) await loadSummaryCache(schoolId);
  return store.get(professorId) ?? null;
}

/** Put entries into the in-memory Map only (script bookkeeping and tests). Nothing touches disk. */
export function primeSummaryCache(entries: Iterable<ProfessorSummary>, schoolId?: SchoolId): void {
  for (const summary of entries) store.set(summary.professorId, summary);
  if (schoolId && !loaded.has(schoolId)) loaded.set(schoolId, Promise.resolve());
}

/** Snapshot of the in-memory Map (the script serializes this after a run). */
export function summaryCacheEntries(): ReadonlyMap<string, ProfessorSummary> {
  return store;
}

/** Forget everything (tests). */
export function resetSummaryCache(): void {
  store.clear();
  loaded.clear();
}
