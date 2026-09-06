// SPEC 9.5 — the only place the Anthropic SDK is called. Server-only; reached exclusively through
// scripts/precompute-summaries.ts (allowClaude: true). Returns the validated structured output or null,
// in which case the caller falls back to the extractive summary.
import Anthropic, { AnthropicError, APIConnectionError, APIError, RateLimitError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ProfessorDetail, Review } from '@/lib/domain/types';
import { env } from '@/lib/config/env';
import { assertServerOnly } from '@/lib/config/serverOnly';
import { SummarySchema, type SummaryOutput } from './schema';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt';

assertServerOnly('src/lib/ai/summarize.ts');

export const SUMMARY_MAX_TOKENS = 2048;
export const RATE_LIMIT_RETRY_MS = 10_000;
export const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type SummaryLogger = (event: string, detail?: Record<string, unknown>) => void;

export interface ClaudeUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface ClaudeSummarizeOptions {
  /** Defaults to env.ANTHROPIC_MODEL. */
  model?: string;
  /** Defaults to env.SUMMARY_SERVER_FALLBACKS (off). */
  serverFallbacks?: boolean;
  /** Injected client (tests); otherwise a lazily created zero-config `new Anthropic(...)`. */
  client?: Anthropic;
  /** Injected sleep for the manual rate-limit retry (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Event sink; defaults to console.warn. */
  log?: SummaryLogger;
}

export interface ClaudeSummaryResult {
  output: SummaryOutput;
  model: string;
  usage: Anthropic.Usage;
}

// ── usage bookkeeping (printed by the script) ────────────────────────────────────────────────────────
const totals: ClaudeUsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };

export function getClaudeUsageTotals(): Readonly<ClaudeUsageTotals> {
  return { ...totals };
}

export function resetClaudeUsageTotals(): void {
  totals.calls = 0;
  totals.inputTokens = 0;
  totals.outputTokens = 0;
  totals.cacheReadInputTokens = 0;
  totals.cacheCreationInputTokens = 0;
}

function recordUsage(usage: Anthropic.Usage | undefined): void {
  totals.calls += 1;
  if (!usage) return;
  totals.inputTokens += usage.input_tokens ?? 0;
  totals.outputTokens += usage.output_tokens ?? 0;
  totals.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
  totals.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
}

// ── client ───────────────────────────────────────────────────────────────────────────────────────────
let defaultClient: Anthropic | null = null;

/** Credentials resolve from the environment (ANTHROPIC_API_KEY / auth profile); nothing is hard-coded. */
export function getAnthropicClient(): Anthropic {
  if (!defaultClient) defaultClient = new Anthropic({ timeout: 60_000, maxRetries: 2 }); // TS timeout is milliseconds
  return defaultClient;
}

/** True when a Claude call is possible at all (key present). */
export function hasAnthropicKey(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

const defaultLog: SummaryLogger = (event, detail) => {
  console.warn(`[ai] ${event}`, detail ?? '');
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ── the call ─────────────────────────────────────────────────────────────────────────────────────────
interface ParsedLike {
  stop_reason: string | null;
  parsed_output: unknown;
  usage: Anthropic.Usage;
}

async function callOnce(client: Anthropic, model: string, userMessage: string, serverFallbacks: boolean): Promise<ParsedLike> {
  const params = {
    model,
    max_tokens: SUMMARY_MAX_TOKENS, // deliberately short structured output
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user' as const, content: userMessage }],
    output_config: { format: zodOutputFormat(SummarySchema), effort: 'low' as const },
  };
  // Thinking is left at the model default (adaptive on claude-opus-5); no budget_tokens.
  if (serverFallbacks) {
    return client.beta.messages.parse({ ...params, betas: [SERVER_FALLBACK_BETA], fallbacks: 'default' });
  }
  return client.messages.parse(params);
}

/**
 * Validate the parsed output: schema + every evidence id must belong to the selected review set.
 * Returns null (and logs the reason) when the output must be discarded in favour of the extractive path.
 */
export function validateOutput(raw: unknown, selected: readonly Review[], log: SummaryLogger, professorId: string): SummaryOutput | null {
  const parsed = SummarySchema.safeParse(raw);
  if (!parsed.success) {
    log('schema-invalid', { professorId, issues: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`) });
    return null;
  }
  const ids = new Set(selected.map((r) => r.id));
  const unknown = parsed.data.evidenceReviewIds.filter((id) => !ids.has(id));
  if (unknown.length > 0) {
    log('evidence-mismatch', { professorId, unknown });
    return null;
  }
  return parsed.data;
}

/**
 * One Claude call (SDK retries 429/5xx twice on its own), then one manual retry after 10 s on a
 * RateLimitError, then null. Any other API failure → null. Never throws for API-side problems.
 */
export async function summarizeWithClaude(
  detail: ProfessorDetail,
  selected: readonly Review[],
  opts: ClaudeSummarizeOptions = {},
): Promise<ClaudeSummaryResult | null> {
  const model = opts.model ?? env.ANTHROPIC_MODEL;
  const serverFallbacks = opts.serverFallbacks ?? env.SUMMARY_SERVER_FALLBACKS;
  const log = opts.log ?? defaultLog;
  const sleep = opts.sleep ?? defaultSleep;
  const client = opts.client ?? getAnthropicClient();
  const professorId = detail.professor.id;
  const userMessage = buildUserMessage(detail, selected);

  const attempt = async (): Promise<ClaudeSummaryResult | null> => {
    const res = await callOnce(client, model, userMessage, serverFallbacks);
    recordUsage(res.usage);
    if (res.stop_reason === 'refusal') {
      log('refusal', { professorId });
      return null;
    }
    if (res.parsed_output === null || res.parsed_output === undefined) {
      log('empty-output', { professorId, stopReason: res.stop_reason });
      return null;
    }
    const output = validateOutput(res.parsed_output, selected, log, professorId);
    return output ? { output, model, usage: res.usage } : null;
  };

  try {
    return await attempt();
  } catch (err) {
    // Most specific first: RateLimitError → APIError with a status (the TS SDK's "APIStatusError" tier)
    // → APIConnectionError (status undefined) → any other SDK error. Non-SDK errors propagate.
    if (err instanceof RateLimitError) {
      log('rate-limited', { professorId, retryInMs: RATE_LIMIT_RETRY_MS });
      await sleep(RATE_LIMIT_RETRY_MS);
      try {
        return await attempt();
      } catch (retryErr) {
        log('rate-limited-giving-up', { professorId, message: (retryErr as Error).message });
        return null;
      }
    }
    if (err instanceof APIConnectionError) {
      log('api-connection-error', { professorId, message: err.message });
      return null;
    }
    if (err instanceof APIError) {
      log('api-status-error', { professorId, status: err.status, message: err.message });
      return null;
    }
    if (err instanceof AnthropicError) {
      log('sdk-error', { professorId, message: err.message });
      return null;
    }
    throw err;
  }
}
