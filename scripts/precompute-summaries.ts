// SPEC 9.8 — the ONLY place Claude is called. Reads data/processed/<school>/professors-detail/*.json through
// the Repository, generates a ProfessorSummary for every professor with ≥ MIN_REVIEWS_RANKED reviews,
// writes data/processed/<school>/summaries.json, then rebuilds the rankings payloads (which embed summaries).
//
//   npx tsx scripts/precompute-summaries.ts --school <id> [--only-missing] [--force] [--yes] [--extractive] [--concurrency 4]
//
//   --only-missing  keep every cached entry whose inputHash still matches (CI: --only-missing --extractive → no diff)
//   --force         regenerate everything
//   --yes           skip the MAX_SUMMARIES confirmation
//   --extractive    never call a model, even with a key
//   --provider X    claude | openai-compatible | extractive (default: SUMMARY_PROVIDER / auto)
//   --limit N       only generate the first N pending professors (smoke tests)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProfessorDetail, ProfessorSummary, SchoolId } from '@/lib/domain/types';
import { MIN_REVIEWS_RANKED } from '@/lib/domain/constants';
import { env } from '@/lib/config/env';
import { getSchoolConfig, toRegisteredSchoolId } from '@/lib/config/schools';
import { getRepository } from '@/lib/repo';
import {
  buildUserMessage, estimateInputTokens, getCachedSummary, getClaudeUsageTotals, getLlmUsageTotals, getOrCreateSummary, resolveSummaryProvider,
  type SummaryProviderId,
  isCacheHit, loadSummaryCache, selectReviews, serializeSummaries, summariesFilePath, type SummaryLogger,
} from '@/lib/ai';
import { buildRankings } from './build-rankings';
import { flagBool, flagString, readArgs } from './lib/args';
import { fail, log } from './lib/log';

interface Plan {
  keep: ProfessorSummary[];
  todo: ProfessorDetail[];
  skippedLowData: number;
}

async function loadDetails(schoolId: SchoolId): Promise<ProfessorDetail[]> {
  const repo = getRepository();
  const professors = await repo.getProfessors(schoolId);
  const details = await Promise.all(professors.map((p) => repo.getProfessorBySlug(schoolId, p.slug)));
  return details.filter((d): d is ProfessorDetail => d !== null);
}

async function plan(details: ProfessorDetail[], opts: { onlyMissing: boolean; force: boolean; model: boolean }): Promise<Plan> {
  const out: Plan = { keep: [], todo: [], skippedLowData: 0 };
  for (const detail of details) {
    if (detail.scores.reviewCount < MIN_REVIEWS_RANKED) {
      out.skippedLowData++;
      continue;
    }
    const cached = await getCachedSummary(detail.professor.id);
    const hit = !opts.force && isCacheHit(detail, selectReviews(detail.reviews), cached);
    // Default mode upgrades valid extractive entries to a model summary when one is available; --only-missing keeps them.
    const upgrade = hit && opts.model && !opts.onlyMissing && cached.source === 'extractive';
    if (hit && !upgrade) out.keep.push(cached);
    else out.todo.push(detail);
  }
  return out;
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const args = readArgs();
  const requested = flagString(args, 'school');
  if (!requested) fail('usage: tsx scripts/precompute-summaries.ts --school <id> [--only-missing] [--force] [--yes] [--extractive]');
  const schoolId = toRegisteredSchoolId(requested);
  if (!schoolId) fail(`Unknown school: ${requested}`);
  const config = getSchoolConfig(schoolId);
  const onlyMissing = flagBool(args, 'only-missing');
  const force = flagBool(args, 'force');
  const yes = flagBool(args, 'yes');
  const extractiveOnly = flagBool(args, 'extractive');
  const concurrency = Math.max(1, Number(flagString(args, 'concurrency', '4')) || 4);
  const limit = Math.max(0, Number(flagString(args, 'limit', '0')) || 0);
  const providerFlag = flagString(args, 'provider') as SummaryProviderId | undefined;
  const provider: SummaryProviderId = extractiveOnly ? 'extractive' : resolveSummaryProvider(providerFlag ?? env.SUMMARY_PROVIDER);
  const usesModel = provider !== 'extractive';
  const modelName = provider === 'claude' ? env.ANTHROPIC_MODEL : provider === 'openai-compatible' ? `${env.GROQ_PROVIDER_NAME} ${env.GROQ_MODEL} @ ${env.GROQ_BASE_URL}` : 'extractive';
  const claude = provider === 'claude';

  log.info(`precompute-summaries: school=${schoolId} mode=${config.mode} provider=${provider} (${modelName})${force ? ' --force' : ''}${onlyMissing ? ' --only-missing' : ''}${limit ? ` --limit ${limit}` : ''}`);
  if (!usesModel && !extractiveOnly) log.info('No ANTHROPIC_API_KEY or GROQ_API_KEY set → extractive summaries for every professor.');

  await loadSummaryCache(schoolId);
  const details = await loadDetails(schoolId);
  const planned = await plan(details, { onlyMissing, force, model: usesModel });
  const { keep, skippedLowData } = planned;
  const todo = limit > 0 ? planned.todo.slice(0, limit) : planned.todo;
  if (limit > 0 && planned.todo.length > limit) log.info(`--limit ${limit}: ${planned.todo.length - limit} pending professors left untouched (their previous entries are kept).`);
  log.info(`${details.length} professors: ${keep.length} cached & valid, ${todo.length} to generate, ${skippedLowData} below ${MIN_REVIEWS_RANKED} reviews.`);

  if (usesModel && todo.length > 0) {
    const estTokens = todo.reduce((sum, d) => sum + estimateInputTokens(buildUserMessage(d, selectReviews(d.reviews))), 0);
    log.info(`Model calls: ${todo.length}; estimated input ≈ ${estTokens.toLocaleString()} tokens (chars/4) + ≤ 2,048 output tokens each.`);
    if (todo.length > env.MAX_SUMMARIES && !yes) {
      fail(`${todo.length} model calls exceed MAX_SUMMARIES=${env.MAX_SUMMARIES}. Re-run with --yes to confirm, or raise MAX_SUMMARIES.`);
    }
  }

  const events = new Map<string, number>();
  const scriptLog: SummaryLogger = (event, detail) => {
    events.set(event, (events.get(event) ?? 0) + 1);
    log.warn(`${event} ${detail ? JSON.stringify(detail) : ''}`);
  };

  let done = 0;
  const generated = await mapWithConcurrency(todo, concurrency, async (detail) => {
    const summary = await getOrCreateSummary(detail, { allowClaude: usesModel, provider, force: true, log: scriptLog });
    done++;
    if (done % 10 === 0 || done === todo.length) log.info(`  ${done}/${todo.length} ${detail.professor.displayName} → ${summary?.source ?? 'null'}`);
    return summary;
  });

  const entries = new Map<string, ProfessorSummary>();
  for (const s of keep) entries.set(s.professorId, s);
  for (const s of generated) if (s) entries.set(s.professorId, s);
  // Professors skipped by --limit keep whatever entry they had (so a smoke run never drops summaries).
  if (limit > 0) {
    for (const d of planned.todo.slice(limit)) {
      const prev = await getCachedSummary(d.professor.id);
      if (prev && !entries.has(prev.professorId)) entries.set(prev.professorId, prev);
    }
  }

  const filePath = summariesFilePath(schoolId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeSummaries(entries), 'utf8');

  const all = [...entries.values()];
  const nClaude = all.filter((s) => s.source === 'claude').length;
  const nLlm = all.filter((s) => s.source === 'openai-compatible').length;
  const nExtractive = all.length - nClaude - nLlm;
  if (provider === 'openai-compatible') {
    const u = getLlmUsageTotals();
    log.info(`usage: ${u.calls} calls, ${u.promptTokens.toLocaleString()} prompt tokens, ${u.completionTokens.toLocaleString()} completion tokens`);
  }
  if (claude) {
    const u = getClaudeUsageTotals();
    log.info(`usage: ${u.calls} calls, ${u.inputTokens.toLocaleString()} input tokens (${u.cacheReadInputTokens.toLocaleString()} cached), ${u.outputTokens.toLocaleString()} output tokens`);
  }
  if (events.size > 0) log.info(`events: ${[...events.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log.summary(`summaries: ${all.length} written to ${path.relative(process.cwd(), filePath)} (claude=${nClaude}, openai-compatible=${nLlm}, extractive=${nExtractive}, regenerated=${generated.filter(Boolean).length})`);

  log.info('rebuilding rankings payloads…');
  await buildRankings({ schoolId });
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
});
