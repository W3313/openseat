// SPEC 9 — AI summary module entry point. Models (Claude, or an OpenAI-compatible provider such as Groq)
// are called from scripts/precompute-summaries.ts (allowClaude: true) and, only when SUMMARY_ON_DEMAND=1,
// from the summary route; everything else gets the cached summary or the extractive one. Nothing here writes to disk.
import type Anthropic from '@anthropic-ai/sdk';
import type { ProfessorDetail, ProfessorSummary, Review } from '@/lib/domain/types';
import { MIN_REVIEWS_RANKED, PROMPT_VERSION } from '@/lib/domain/constants';
import { env } from '@/lib/config/env';
import { EXTRACTIVE_MODEL_TAG, getCachedSummary, isSummaryValid, summaryInputHash } from './cache';
import { extractiveSummary } from './extractive';
import { gradingNote } from './gradingNote';
import type { SummaryOutput } from './schema';
import { selectReviews, selectedIds } from './selectReviews';
import { hasAnthropicKey, summarizeWithClaude, type SummaryLogger } from './summarize';
import { hasLlmKey, summarizeWithOpenAICompatible } from './openaiCompatible';

export type SummaryProviderId = 'claude' | 'openai-compatible' | 'extractive';

export interface SummaryOptions {
  /** Allow a model call at all (true inside scripts/precompute-summaries.ts, or the route with SUMMARY_ON_DEMAND=1). */
  allowClaude: boolean;
  /** Which model path to use; default resolveSummaryProvider() (an injected `client` implies 'claude'). */
  provider?: SummaryProviderId;
  /** Injected fetch for the OpenAI-compatible provider (tests). */
  fetchImpl?: typeof fetch;
  /** Skip the cache and regenerate (script --force). */
  force?: boolean;
  /** Injected client (tests). When set together with allowClaude, Claude is called even without a key in env. */
  client?: Anthropic;
  /** Injected sleep for the rate-limit retry (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Event sink (tests / script); defaults to console.warn inside summarize.ts. */
  log?: SummaryLogger;
  /** Clock for generatedAt (tests). */
  now?: () => string;
}

export { EXTRACTIVE_MODEL_TAG, summaryInputHash, isSummaryValid, getCachedSummary } from './cache';
export {
  loadSummaryCache, primeSummaryCache, resetSummaryCache, summaryCacheEntries, summariesFilePath, readSummariesFile,
  serializeSummaries,
} from './cache';
export type { SummaryHashInput } from './cache';
export { selectReviews, selectedIds } from './selectReviews';
export { extractiveSummary } from './extractive';
export { gradingNote } from './gradingNote';
export { SummarySchema } from './schema';
export type { SummaryOutput } from './schema';
export { SYSTEM_PROMPT, PROMPT_VERSION, buildUserMessage, estimateInputTokens } from './prompt';
export {
  summarizeWithClaude, getClaudeUsageTotals, resetClaudeUsageTotals, hasAnthropicKey, getAnthropicClient,
} from './summarize';
export type { SummaryLogger, ClaudeUsageTotals, ClaudeSummarizeOptions } from './summarize';
export {
  summarizeWithOpenAICompatible, hasLlmKey, getLlmUsageTotals, resetLlmUsageTotals, extractJson, buildJsonInstruction, coerceSummaryShape,
} from './openaiCompatible';
export type { LlmUsageTotals, OpenAICompatibleOptions, LlmSummaryResult } from './openaiCompatible';

/** SUMMARY_PROVIDER resolution against the keys that are actually present. */
export function resolveSummaryProvider(pref: 'auto' | SummaryProviderId = env.SUMMARY_PROVIDER): SummaryProviderId {
  if (pref === 'claude') return hasAnthropicKey() ? 'claude' : 'extractive';
  if (pref === 'openai-compatible') return hasLlmKey() ? 'openai-compatible' : 'extractive';
  if (pref === 'extractive') return 'extractive';
  if (hasAnthropicKey()) return 'claude';
  if (hasLlmKey()) return 'openai-compatible';
  return 'extractive';
}

/** Hash inputs shared by both providers for one professor + selection. */
function hashBase(detail: ProfessorDetail, selected: readonly Review[]) {
  return {
    professorId: detail.professor.id,
    selectedReviewIds: selectedIds(selected),
    ratingShrunk: detail.scores.ratingShrunk,
    gpaDelta: detail.scores.gpaDelta,
    reviewCount: detail.scores.reviewCount,
  };
}

/** The hashes a cached entry may legitimately carry for this input (Claude model, OpenAI-compatible model, or extractive). */
export function expectedInputHashes(
  detail: ProfessorDetail,
  selected: readonly Review[],
  model = env.ANTHROPIC_MODEL,
  llmModel = env.GROQ_MODEL,
): { claude: string; llm: string; extractive: string } {
  const base = hashBase(detail, selected);
  return {
    claude: summaryInputHash({ ...base, modelOrExtractive: model }),
    llm: summaryInputHash({ ...base, modelOrExtractive: llmModel }),
    extractive: summaryInputHash({ ...base, modelOrExtractive: EXTRACTIVE_MODEL_TAG }),
  };
}

/** SPEC 9.6 steps 3–5 applied to a validated Claude output. */
export function finalizeClaudeSummary(
  detail: ProfessorDetail,
  selected: readonly Review[],
  output: SummaryOutput,
  model: string,
  now: string = new Date().toISOString(),
): ProfessorSummary {
  return {
    professorId: detail.professor.id,
    source: 'claude',
    model,
    promptVersion: PROMPT_VERSION,
    generatedAt: now,
    inputHash: expectedInputHashes(detail, selected, model).claude,
    reviewCount: detail.scores.reviewCount,
    ...output,
    confidence: detail.scores.confidence, // rule-based (8.4); the model's value is ignored
    gradingNote: gradingNote(detail.scores, detail.courses.length), // always code-generated
  };
}

/** SPEC 9.6 steps 3–5 applied to a validated OpenAI-compatible output. */
export function finalizeLlmSummary(
  detail: ProfessorDetail,
  selected: readonly Review[],
  output: SummaryOutput,
  model: string,
  provider: string,
  now: string = new Date().toISOString(),
): ProfessorSummary {
  return {
    professorId: detail.professor.id,
    source: 'openai-compatible',
    model,
    provider,
    promptVersion: PROMPT_VERSION,
    generatedAt: now,
    inputHash: expectedInputHashes(detail, selected, undefined, model).llm,
    reviewCount: detail.scores.reviewCount,
    ...output,
    confidence: detail.scores.confidence, // rule-based (8.4); the model's value is ignored
    gradingNote: gradingNote(detail.scores, detail.courses.length), // always code-generated
  };
}

/**
 * True when a cached entry still matches the current input. A model-written entry is judged against the
 * model that produced it (cached.model), so switching the configured model never invalidates good entries.
 */
export function isCacheHit(detail: ProfessorDetail, selected: readonly Review[], cached: ProfessorSummary | null): cached is ProfessorSummary {
  if (!cached) return false;
  const base = hashBase(detail, selected);
  if (cached.source === 'extractive') return isSummaryValid(cached, summaryInputHash({ ...base, modelOrExtractive: EXTRACTIVE_MODEL_TAG }));
  const model = cached.model ?? (cached.source === 'claude' ? env.ANTHROPIC_MODEL : env.GROQ_MODEL);
  return isSummaryValid(cached, summaryInputHash({ ...base, modelOrExtractive: model }));
}

/**
 * Entry point (SPEC 9): null when scores.reviewCount < MIN_REVIEWS_RANKED; otherwise cached (valid hash)
 * → Claude (allowClaude and a key/client) → extractive.
 */
export async function getOrCreateSummary(detail: ProfessorDetail, opts: SummaryOptions): Promise<ProfessorSummary | null> {
  if (detail.scores.reviewCount < MIN_REVIEWS_RANKED) return null;
  const selected = selectReviews(detail.reviews);
  const now = opts.now?.();

  if (!opts.force) {
    const cached = await getCachedSummary(detail.professor.id);
    if (isCacheHit(detail, selected, cached)) return cached;
  }

  if (opts.allowClaude) {
    const provider = opts.provider ?? (opts.client !== undefined ? 'claude' : resolveSummaryProvider());
    if (provider === 'claude' && (opts.client !== undefined || hasAnthropicKey())) {
      const result = await summarizeWithClaude(detail, selected, { client: opts.client, sleep: opts.sleep, log: opts.log });
      if (result) return finalizeClaudeSummary(detail, selected, result.output, result.model, now);
    } else if (provider === 'openai-compatible' && (opts.fetchImpl !== undefined || hasLlmKey())) {
      const result = await summarizeWithOpenAICompatible(detail, selected, { fetchImpl: opts.fetchImpl, sleep: opts.sleep, log: opts.log });
      if (result) return finalizeLlmSummary(detail, selected, result.output, result.model, result.provider, now);
    }
  }

  return extractiveSummary(detail, selected, now);
}
