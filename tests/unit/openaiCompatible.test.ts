import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessorDetail } from '@/lib/domain/types';
import fixture from '../fixtures/professors-detail.fixture.json';

// env is parsed once at import; provide the provider key before any module evaluates.
vi.hoisted(() => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GROQ_API_KEY = 'gsk_test';
  process.env.GROQ_MODEL = 'openai/gpt-oss-20b';
  process.env.GROQ_PROVIDER_NAME = 'Groq';
});

import { expectedInputHashes, getOrCreateSummary, isCacheHit, resolveSummaryProvider } from '@/lib/ai';
import { coerceSummaryShape, extractJson, getLlmUsageTotals, resetLlmUsageTotals, summarizeWithOpenAICompatible } from '@/lib/ai/openaiCompatible';
import { resetSummaryCache } from '@/lib/ai/cache';
import { gradingNote } from '@/lib/ai/gradingNote';
import { selectReviews } from '@/lib/ai/selectReviews';

const details = fixture as unknown as Record<string, ProfessorDetail>;
const okonkwo = details['adaeze-okonkwo'];

function output(evidence = okonkwo.reviews.slice(0, 3).map((r) => r.id)) {
  return {
    verdict: 'Students call Okonkwo demanding but unusually clear.',
    teachingStyle: ['Clear lectures', 'Heavy problem sets'],
    strengths: ['Lectures are clear', 'Grading is fair'],
    watchOuts: ['Workload is heavy'],
    bestFor: 'Students willing to put in the hours',
    workload: 'heavy',
    format: 'lecture-heavy',
    confidence: 'low', // deliberately wrong — must be overwritten by rule
    evidenceReviewIds: evidence,
  };
}

function chatResponse(content: string, status = 200): Response {
  return new Response(
    status === 200 ? JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 200 } }) : 'rate limited',
    { status, headers: { 'content-type': 'application/json' } },
  );
}

const noSleep = async () => {};
const quiet = () => {};

beforeEach(() => {
  resetSummaryCache();
  resetLlmUsageTotals();
});

describe('resolveSummaryProvider', () => {
  it('prefers the OpenAI-compatible provider when only GROQ_API_KEY is set', () => {
    expect(resolveSummaryProvider('auto')).toBe('openai-compatible');
    expect(resolveSummaryProvider('claude')).toBe('extractive'); // no Anthropic key
    expect(resolveSummaryProvider('extractive')).toBe('extractive');
  });
});

describe('coerceSummaryShape', () => {
  it('clamps over-length fields at word boundaries, caps arrays and normalises enums', () => {
    const long = 'word '.repeat(60).trim(); // 299 chars
    const out = coerceSummaryShape({
      ...output(),
      verdict: long,
      teachingStyle: ['Clear lectures with lots of worked examples every week', 'a', 'b', 'c', 'd', ''],
      workload: 'Heavy',
      format: 'Lecture heavy',
      confidence: 'Moderate',
    }) as Record<string, unknown>;
    expect((out.verdict as string).length).toBeLessThanOrEqual(160);
    expect((out.verdict as string).endsWith('word')).toBe(true);
    expect((out.teachingStyle as string[]).length).toBe(4);
    expect(((out.teachingStyle as string[])[0]).length).toBeLessThanOrEqual(40);
    expect(out.workload).toBe('heavy');
    expect(out.format).toBe('lecture-heavy');
    expect(out.confidence).toBe('medium');
    expect((coerceSummaryShape({ ...output(), confidence: 'medium' }) as { confidence: string }).confidence).toBe('medium');
    expect((coerceSummaryShape({ ...output(), confidence: 'somewhat sure' }) as { confidence: string }).confidence).toBe('medium');
    expect((coerceSummaryShape({ ...output(), workload: 'medium' }) as { workload: string }).workload).toBe('moderate');
  });

  it('leaves already-valid output untouched', () => {
    expect(coerceSummaryShape(output())).toEqual(output());
  });
});

describe('extractJson', () => {
  it('parses plain JSON, fenced JSON, and JSON after a <think> block', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('<think>reasoning…</think>\n{"a":[1,2]}')).toEqual({ a: [1, 2] });
    expect(extractJson('no json here')).toBeNull();
  });
});

describe('summarizeWithOpenAICompatible', () => {
  it('posts JSON mode to {baseUrl}/chat/completions with a bearer key and returns the validated output', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('openai/gpt-oss-20b');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.reasoning_effort).toBe('low');
      expect(body.messages[1].content).toContain('JSON Schema');
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer gsk_test');
      return chatResponse(JSON.stringify(output()));
    }) as unknown as typeof fetch;
    const result = await summarizeWithOpenAICompatible(okonkwo, selectReviews(okonkwo.reviews), { fetchImpl, log: quiet, sleep: noSleep });
    expect(result?.provider).toBe('Groq');
    expect(result?.model).toBe('openai/gpt-oss-20b');
    expect(result?.output.verdict).toBe(output().verdict);
    expect(getLlmUsageTotals()).toEqual({ calls: 1, promptTokens: 900, completionTokens: 200 });
  });

  it('retries after HTTP 429 (honouring retry-after) and gives up after the retry budget', async () => {
    const events: string[] = [];
    let calls = 0;
    const slept: number[] = [];
    const fetchImpl = vi.fn(async () => (++calls <= 2 ? new Response('slow down', { status: 429, headers: { 'retry-after': '2' } }) : chatResponse(JSON.stringify(output())))) as unknown as typeof fetch;
    const ok = await summarizeWithOpenAICompatible(okonkwo, selectReviews(okonkwo.reviews), { fetchImpl, log: (e) => events.push(e), sleep: async (ms) => { slept.push(ms); } });
    expect(ok).not.toBeNull();
    expect(events.filter((e) => e === 'rate-limited')).toHaveLength(2);
    expect(slept).toEqual([10000, 15000]); // header says 2.5 s but the geometric floor (10 s, 15 s) wins
    const always429 = vi.fn(async () => chatResponse('', 429)) as unknown as typeof fetch;
    expect(await summarizeWithOpenAICompatible(okonkwo, selectReviews(okonkwo.reviews), { fetchImpl: always429, log: quiet, sleep: noSleep })).toBeNull();
  });

  it('returns null on non-JSON content, bad evidence ids, HTTP errors and network failures', async () => {
    const sel = selectReviews(okonkwo.reviews);
    const notJson = vi.fn(async () => chatResponse('Sorry, here is prose.')) as unknown as typeof fetch;
    expect(await summarizeWithOpenAICompatible(okonkwo, sel, { fetchImpl: notJson, log: quiet })).toBeNull();
    const badEvidence = vi.fn(async () => chatResponse(JSON.stringify(output(['not-a-real-review-id'])))) as unknown as typeof fetch;
    expect(await summarizeWithOpenAICompatible(okonkwo, sel, { fetchImpl: badEvidence, log: quiet })).toBeNull();
    const http500 = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    expect(await summarizeWithOpenAICompatible(okonkwo, sel, { fetchImpl: http500, log: quiet })).toBeNull();
    const network = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await summarizeWithOpenAICompatible(okonkwo, sel, { fetchImpl: network, log: quiet })).toBeNull();
  });
});

describe('getOrCreateSummary with the OpenAI-compatible provider', () => {
  it('produces a summary tagged openai-compatible with rule-based confidence, code grading note and the provider hash', async () => {
    const fetchImpl = vi.fn(async () => chatResponse(JSON.stringify(output()))) as unknown as typeof fetch;
    const s = await getOrCreateSummary(okonkwo, { allowClaude: true, provider: 'openai-compatible', force: true, fetchImpl, log: quiet, now: () => '2026-09-06T00:00:00.000Z' });
    expect(s?.source).toBe('openai-compatible');
    expect(s?.provider).toBe('Groq');
    expect(s?.model).toBe('openai/gpt-oss-20b');
    expect(s?.confidence).toBe(okonkwo.scores.confidence);
    expect(s?.gradingNote).toBe(gradingNote(okonkwo.scores, okonkwo.courses.length));
    expect(s?.inputHash).toBe(expectedInputHashes(okonkwo, selectReviews(okonkwo.reviews)).llm);
    expect(s?.generatedAt).toBe('2026-09-06T00:00:00.000Z');
  });

  it('keeps a model-written entry valid after the configured model changes', async () => {
    const fetchImpl = vi.fn(async () => chatResponse(JSON.stringify(output()))) as unknown as typeof fetch;
    const s = await getOrCreateSummary(okonkwo, { allowClaude: true, provider: 'openai-compatible', force: true, fetchImpl, log: quiet });
    expect(s).not.toBeNull();
    const selected = selectReviews(okonkwo.reviews);
    expect(isCacheHit(okonkwo, selected, s)).toBe(true);
    // Same entry, produced by a different model: still valid because the hash is checked against its own model.
    const other = { ...s!, model: 'qwen/qwen3.8-27b', inputHash: expectedInputHashes(okonkwo, selected, undefined, 'qwen/qwen3.8-27b').llm };
    expect(isCacheHit(okonkwo, selected, other)).toBe(true);
    // A stale hash (different review set) is not.
    expect(isCacheHit(okonkwo, selected, { ...s!, inputHash: 'deadbeefdeadbeef' })).toBe(false);
  });

  it('falls back to the extractive summary when the provider returns nothing usable', async () => {
    const fetchImpl = vi.fn(async () => chatResponse('not json')) as unknown as typeof fetch;
    const s = await getOrCreateSummary(okonkwo, { allowClaude: true, provider: 'openai-compatible', force: true, fetchImpl, log: quiet });
    expect(s?.source).toBe('extractive');
  });
});
