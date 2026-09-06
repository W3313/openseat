import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessorDetail } from '@/lib/domain/types';
import type { SummaryOutput } from '@/lib/ai/schema';
import fixture from '../fixtures/professors-detail.fixture.json';

// The env module is parsed once at import; make sure a key is present before any import evaluates.
const { parseMock } = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.ANTHROPIC_MODEL = 'claude-opus-5';
  return { parseMock: vi.fn() };
});

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class MockAnthropic {
    messages = { parse: parseMock };
    beta = { messages: { parse: parseMock } };
  }
  return { ...actual, default: MockAnthropic };
});

import { APIConnectionError, APIError, RateLimitError } from '@anthropic-ai/sdk';
import { getOrCreateSummary, finalizeClaudeSummary, expectedInputHashes } from '@/lib/ai';
import { primeSummaryCache, resetSummaryCache } from '@/lib/ai/cache';
import { gradingNote } from '@/lib/ai/gradingNote';
import { selectReviews } from '@/lib/ai/selectReviews';
import { getClaudeUsageTotals, resetClaudeUsageTotals } from '@/lib/ai/summarize';

const details = fixture as unknown as Record<string, ProfessorDetail>;
const okonkwo = details['adaeze-okonkwo'];
const sorensen = details['halvard-sorensen']; // 2 reviews → below the guard

const usage = { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function goodOutput(evidence = okonkwo.reviews.slice(0, 3).map((r) => r.id)): SummaryOutput {
  return {
    verdict: 'Across 23 reviews students call Okonkwo demanding but clear.',
    teachingStyle: ['Clear lectures', 'Heavy problem sets'],
    strengths: ['Lectures are clear', 'Grading is fair'],
    watchOuts: ['Workload is heavy'],
    bestFor: 'Students willing to put in the hours',
    workload: 'heavy' as const,
    format: 'lecture-heavy' as const,
    confidence: 'low' as const, // deliberately wrong — must be overwritten
    evidenceReviewIds: evidence,
  };
}

function response(over: Record<string, unknown>) {
  return { stop_reason: 'end_turn', parsed_output: null, usage, ...over };
}

const log = vi.fn();
const sleep = vi.fn(async () => undefined);
const opts = { allowClaude: true, log, sleep, now: () => '2026-09-05T00:00:00.000Z' };

beforeEach(() => {
  parseMock.mockReset();
  log.mockReset();
  sleep.mockClear();
  resetSummaryCache();
  primeSummaryCache([], 'uiuc'); // mark the school as loaded so nothing touches disk
  resetClaudeUsageTotals();
});

describe('getOrCreateSummary with a mocked Anthropic client', () => {
  it('returns null below MIN_REVIEWS_RANKED without calling the provider', async () => {
    expect(await getOrCreateSummary(sorensen, opts)).toBeNull();
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('parsed output → source claude, confidence overwritten, gradingNote from code', async () => {
    parseMock.mockResolvedValueOnce(response({ parsed_output: goodOutput() }));
    const s = await getOrCreateSummary(okonkwo, opts);
    expect(s?.source).toBe('claude');
    expect(s?.model).toBe('claude-opus-5');
    expect(s?.confidence).toBe('high');
    expect(s?.gradingNote).toBe(gradingNote(okonkwo.scores, okonkwo.courses.length));
    expect(s?.generatedAt).toBe('2026-09-05T00:00:00.000Z');
    expect(s?.inputHash).toBe(expectedInputHashes(okonkwo, selectReviews(okonkwo.reviews)).claude);
    expect(parseMock).toHaveBeenCalledTimes(1);
    const params = parseMock.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-5');
    expect(params.max_tokens).toBe(2048);
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.messages[0].content).toContain('<reviews>');
    expect(getClaudeUsageTotals()).toMatchObject({ calls: 1, inputTokens: 1200, outputTokens: 300 });
  });

  it('stop_reason refusal → extractive', async () => {
    parseMock.mockResolvedValueOnce(response({ stop_reason: 'refusal', parsed_output: goodOutput() }));
    const s = await getOrCreateSummary(okonkwo, opts);
    expect(s?.source).toBe('extractive');
    expect(log).toHaveBeenCalledWith('refusal', expect.anything());
  });

  it('parsed_output null → extractive', async () => {
    parseMock.mockResolvedValueOnce(response({ parsed_output: null }));
    const s = await getOrCreateSummary(okonkwo, opts);
    expect(s?.source).toBe('extractive');
    expect(s?.model).toBeNull();
    expect(log).toHaveBeenCalledWith('empty-output', expect.anything());
  });

  it('unknown evidence id → extractive with evidence-mismatch logged', async () => {
    parseMock.mockResolvedValueOnce(response({ parsed_output: goodOutput(['uiuc:r:d-00020', 'uiuc:r:not-in-set']) }));
    const s = await getOrCreateSummary(okonkwo, opts);
    expect(s?.source).toBe('extractive');
    expect(log).toHaveBeenCalledWith('evidence-mismatch', expect.objectContaining({ unknown: ['uiuc:r:not-in-set'] }));
  });

  it('schema-invalid output → extractive', async () => {
    parseMock.mockResolvedValueOnce(response({ parsed_output: { ...goodOutput(), verdict: 'x'.repeat(200) } }));
    const s = await getOrCreateSummary(okonkwo, opts);
    expect(s?.source).toBe('extractive');
    expect(log).toHaveBeenCalledWith('schema-invalid', expect.anything());
  });

  it('RateLimitError → one manual retry after 10 s, then extractive', async () => {
    const err = new RateLimitError(429, { type: 'rate_limit_error' }, 'rate limited', new Headers());
    parseMock.mockRejectedValueOnce(err).mockRejectedValueOnce(err);
    const s = await getOrCreateSummary(okonkwo, opts);
    expect(s?.source).toBe('extractive');
    expect(sleep).toHaveBeenCalledWith(10_000);
    expect(parseMock).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('rate-limited', expect.anything());
  });

  it('RateLimitError then success → claude', async () => {
    const err = new RateLimitError(429, { type: 'rate_limit_error' }, 'rate limited', new Headers());
    parseMock.mockRejectedValueOnce(err).mockResolvedValueOnce(response({ parsed_output: goodOutput() }));
    const s = await getOrCreateSummary(okonkwo, opts);
    expect(s?.source).toBe('claude');
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('4xx APIError → extractive, no retry; APIConnectionError → extractive', async () => {
    parseMock.mockRejectedValueOnce(new APIError(400, { type: 'invalid_request_error' }, 'bad request', new Headers()));
    expect((await getOrCreateSummary(okonkwo, opts))?.source).toBe('extractive');
    expect(log).toHaveBeenCalledWith('api-status-error', expect.objectContaining({ status: 400 }));
    expect(sleep).not.toHaveBeenCalled();

    parseMock.mockRejectedValueOnce(new APIConnectionError({ message: 'ECONNRESET' }));
    expect((await getOrCreateSummary(okonkwo, opts))?.source).toBe('extractive');
    expect(log).toHaveBeenCalledWith('api-connection-error', expect.anything());
  });

  it('non-SDK errors propagate', async () => {
    parseMock.mockRejectedValueOnce(new TypeError('boom'));
    await expect(getOrCreateSummary(okonkwo, opts)).rejects.toThrow('boom');
  });

  it('valid cache entry is returned without a provider call; --force bypasses it', async () => {
    const selected = selectReviews(okonkwo.reviews);
    const cached = finalizeClaudeSummary(okonkwo, selected, goodOutput(), 'claude-opus-5', '2026-01-01T00:00:00.000Z');
    primeSummaryCache([cached], 'uiuc');
    const hit = await getOrCreateSummary(okonkwo, opts);
    expect(hit).toBe(cached);
    expect(parseMock).not.toHaveBeenCalled();

    primeSummaryCache([{ ...cached, inputHash: 'stale-stale-stale' }], 'uiuc');
    parseMock.mockResolvedValueOnce(response({ parsed_output: goodOutput() }));
    const regenerated = await getOrCreateSummary(okonkwo, opts);
    expect(regenerated?.generatedAt).toBe('2026-09-05T00:00:00.000Z');
    expect(parseMock).toHaveBeenCalledTimes(1);

    parseMock.mockResolvedValueOnce(response({ parsed_output: goodOutput() }));
    primeSummaryCache([cached], 'uiuc');
    await getOrCreateSummary(okonkwo, { ...opts, force: true });
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  it('allowClaude: false never calls the provider and yields extractive when nothing is cached', async () => {
    const s = await getOrCreateSummary(okonkwo, { ...opts, allowClaude: false });
    expect(s?.source).toBe('extractive');
    expect(parseMock).not.toHaveBeenCalled();
  });
});
