// OpenAI-compatible chat provider (Groq by default; Ollama / OpenRouter / any compatible server via
// GROQ_BASE_URL). Server-only; reached through scripts/precompute-summaries.ts, or through the summary
// route when SUMMARY_ON_DEMAND=1. Same contract as the Claude path: validated SummaryOutput or null.
import { z } from 'zod';
import type { ProfessorDetail, Review } from '@/lib/domain/types';
import { env } from '@/lib/config/env';
import { assertServerOnly } from '@/lib/config/serverOnly';
import { SUMMARY_LIMITS, SummarySchema, type SummaryOutput } from './schema';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt';
import { validateOutput, type SummaryLogger } from './summarize';

assertServerOnly('src/lib/ai/openaiCompatible.ts');

export const LLM_MAX_TOKENS = 2048;
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_RATE_LIMIT_RETRY_MS = 10_000;
export const LLM_MAX_RATE_LIMIT_RETRIES = 10;
/** Never sleep longer than this per 429, so a daily-quota response (retry-after in the thousands of seconds) fails fast to the extractive path. */
export const LLM_MAX_RETRY_WAIT_MS = 90_000;

export interface LlmUsageTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

export interface OpenAICompatibleOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Display name stored on the summary ("Groq"). */
  providerName?: string;
  /** Injected fetch (tests). */
  fetchImpl?: typeof fetch;
  /** reasoning_effort for reasoning models; default 'low'; null omits the field. */
  reasoningEffort?: 'low' | 'medium' | 'high' | null;
  /** Injected sleep for the 429 retry (tests). */
  sleep?: (ms: number) => Promise<void>;
  log?: SummaryLogger;
  timeoutMs?: number;
}

export interface LlmSummaryResult {
  output: SummaryOutput;
  model: string;
  provider: string;
}

const totals: LlmUsageTotals = { calls: 0, promptTokens: 0, completionTokens: 0 };

export function getLlmUsageTotals(): Readonly<LlmUsageTotals> {
  return { ...totals };
}

export function resetLlmUsageTotals(): void {
  totals.calls = 0;
  totals.promptTokens = 0;
  totals.completionTokens = 0;
}

/** True when the OpenAI-compatible provider can be called at all (key present). */
export function hasLlmKey(): boolean {
  return Boolean(env.GROQ_API_KEY);
}

const JSON_SCHEMA_TEXT = JSON.stringify(z.toJSONSchema(SummarySchema));

/** Appended to the user message: JSON-mode providers need the word "JSON" and the exact shape. */
export function buildJsonInstruction(): string {
  return `Respond with a single JSON object and nothing else — no prose, no code fences. It must match this JSON Schema exactly:\n${JSON_SCHEMA_TEXT}`;
}

/** Tolerates <think>…</think> blocks (local reasoning models) and code fences; returns null when no object parses. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/** Trim to `max` characters at a word boundary (no trailing punctuation fragments). */
function clampText(value: unknown, max: number): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const atWord = cut.lastIndexOf(' ');
  return (atWord > max * 0.6 ? cut.slice(0, atWord) : cut).replace(/[\s,;:—–-]+$/, '');
}

const WORKLOAD_ALIASES: Record<string, string> = { medium: 'moderate', average: 'moderate', normal: 'moderate', 'very heavy': 'heavy', intense: 'heavy', easy: 'light' };
const FORMAT_ALIASES: Record<string, string> = { 'lecture heavy': 'lecture-heavy', lectures: 'lecture-heavy', lecture: 'lecture-heavy', 'lecture-based': 'lecture-heavy', 'project based': 'project-based', projects: 'project-based', 'project heavy': 'project-based', seminar: 'discussion', 'discussion-based': 'discussion', hybrid: 'mixed', blended: 'mixed' };
const CONFIDENCE_ALIASES: Record<string, string> = { moderate: 'medium', mid: 'medium', average: 'medium', strong: 'high', weak: 'low' };

function normalizeEnum(value: unknown, aliases: Record<string, string>, allowed: readonly string[], fallback?: string): unknown {
  if (typeof value !== 'string') return fallback ?? value;
  const v = value.trim().toLowerCase().replace(/[.!]$/, '');
  const mapped = aliases[v] ?? v.replace(/\s+/g, '-');
  if (allowed.includes(mapped)) return mapped;
  return fallback ?? mapped;
}

/**
 * Models occasionally overshoot a length limit by a few characters or capitalise an enum; rather than
 * discarding the whole summary, clamp strings at word boundaries, cap array lengths and normalise enums.
 * Anything still invalid is caught by validateOutput.
 */
export function coerceSummaryShape(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
  const list = (v: unknown, max: number, item: number): unknown =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim().length > 0).slice(0, max).map((x) => clampText(x, item)) : v;
  o.verdict = clampText(o.verdict, SUMMARY_LIMITS.verdict);
  o.bestFor = clampText(o.bestFor, SUMMARY_LIMITS.bestFor);
  o.teachingStyle = list(o.teachingStyle, 4, SUMMARY_LIMITS.teachingStylePhrase);
  o.strengths = list(o.strengths, 4, SUMMARY_LIMITS.strength);
  o.watchOuts = list(o.watchOuts, 3, SUMMARY_LIMITS.watchOut);
  if (Array.isArray(o.evidenceReviewIds)) o.evidenceReviewIds = o.evidenceReviewIds.filter((x) => typeof x === 'string').slice(0, SUMMARY_LIMITS.evidenceMax);
  o.workload = normalizeEnum(o.workload, WORKLOAD_ALIASES, ['light', 'moderate', 'heavy']);
  o.format = normalizeEnum(o.format, FORMAT_ALIASES, ['lecture-heavy', 'discussion', 'project-based', 'mixed']);
  // confidence is ALWAYS overwritten by rule after validation (SPEC 9.6), so any unrecognised value becomes a placeholder.
  o.confidence = normalizeEnum(o.confidence, CONFIDENCE_ALIASES, ['low', 'medium', 'high'], 'medium');
  return o;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

const defaultLog: SummaryLogger = (event, detail) => {
  console.warn(`[ai] ${event}`, detail ?? '');
};
const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One chat completion in JSON mode; on HTTP 429 waits retry-after (default 10 s) up to 6 times, then null. Any other HTTP or
 * network failure → null (the caller falls back to the extractive summary). Never throws for API problems.
 */
export async function summarizeWithOpenAICompatible(
  detail: ProfessorDetail,
  selected: readonly Review[],
  opts: OpenAICompatibleOptions = {},
): Promise<LlmSummaryResult | null> {
  const baseUrl = (opts.baseUrl ?? env.GROQ_BASE_URL).replace(/\/$/, '');
  const apiKey = opts.apiKey ?? env.GROQ_API_KEY;
  const model = opts.model ?? env.GROQ_MODEL;
  const provider = opts.providerName ?? env.GROQ_PROVIDER_NAME;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.log ?? defaultLog;
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
  const professorId = detail.professor.id;
  if (!apiKey) {
    log('llm-no-key', { professorId });
    return null;
  }

  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: LLM_MAX_TOKENS,
    response_format: { type: 'json_object' },
    // Reasoning models (gpt-oss, qwen3) otherwise spend ~1.5k hidden tokens per call; low effort keeps the
    // batch inside free-tier token budgets. Groq ignores the field for non-reasoning models.
    ...(opts.reasoningEffort === null ? {} : { reasoning_effort: opts.reasoningEffort ?? 'low' }),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${buildUserMessage(detail, selected)}\n\n${buildJsonInstruction()}` },
    ],
  };

  let retryAfterMs = LLM_RATE_LIMIT_RETRY_MS;
  const attempt = async (): Promise<LlmSummaryResult | null | 'rate-limited'> => {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429) {
      // Groq sends retry-after in seconds (sometimes fractional); fall back to 10 s.
      const header = Number(res.headers.get('retry-after'));
      retryAfterMs = Math.min(LLM_MAX_RETRY_WAIT_MS, Number.isFinite(header) && header > 0 ? Math.ceil(header * 1000) + 500 : LLM_RATE_LIMIT_RETRY_MS);
      if (Number.isFinite(header) && header * 1000 > LLM_MAX_RETRY_WAIT_MS) log('rate-limit-long-wait', { professorId, retryAfterSeconds: header });
      return 'rate-limited';
    }
    if (!res.ok) {
      log('llm-http-error', { professorId, status: res.status, message: (await res.text()).slice(0, 200) });
      return null;
    }
    const json = (await res.json()) as ChatCompletion;
    totals.calls += 1;
    totals.promptTokens += json.usage?.prompt_tokens ?? 0;
    totals.completionTokens += json.usage?.completion_tokens ?? 0;
    const raw = extractJson(json.choices?.[0]?.message?.content ?? '');
    if (raw === null) {
      log('llm-not-json', { professorId, finishReason: json.choices?.[0]?.finish_reason ?? null });
      return null;
    }
    const output = validateOutput(coerceSummaryShape(raw), selected, log, professorId);
    return output ? { output, model, provider } : null;
  };

  try {
    let result = await attempt();
    for (let retry = 0; result === 'rate-limited' && retry < LLM_MAX_RATE_LIMIT_RETRIES; retry++) {
      // Grow the wait geometrically: the retry-after header tracks the request bucket, while the token
      // bucket (the one a 2k-token call actually exhausts) refills more slowly.
      const waitMs = Math.min(LLM_MAX_RETRY_WAIT_MS, Math.max(retryAfterMs, Math.round(LLM_RATE_LIMIT_RETRY_MS * 1.5 ** retry)));
      log('rate-limited', { professorId, retryInMs: waitMs, retry: retry + 1 });
      await sleep(waitMs);
      result = await attempt();
    }
    if (result === 'rate-limited') {
      log('rate-limited-giving-up', { professorId });
      return null;
    }
    return result;
  } catch (err) {
    log('llm-connection-error', { professorId, message: (err as Error).message });
    return null;
  }
}
