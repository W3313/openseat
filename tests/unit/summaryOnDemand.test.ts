// src/lib/api/summary.ts: request-time model calls are gated by SUMMARY_ON_DEMAND, the shared secret header
// and the per-instance budget; anonymous requests never reach a provider even when a key is configured.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessorDetail } from '@/lib/domain/types';
import detailFixture from '../fixtures/professors-detail.fixture.json';

const details = detailFixture as unknown as Record<string, ProfessorDetail>;
const base = details['adaeze-okonkwo'];

const getOrCreateSummary = vi.fn();
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return { ...actual, getOrCreateSummary: (...args: unknown[]) => getOrCreateSummary(...args), resolveSummaryProvider: () => 'openai-compatible' };
});

const envState = { SUMMARY_ON_DEMAND: false, SUMMARY_ON_DEMAND_TOKEN: undefined as string | undefined };
vi.mock('@/lib/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config/env')>();
  return { ...actual, env: new Proxy(actual.env, { get: (target, key) => (key in envState ? envState[key as keyof typeof envState] : target[key as keyof typeof target]) }) };
});

const { buildSummaryResponse, isOnDemandAuthorized, ON_DEMAND_HEADER, ON_DEMAND_BUDGET_PER_MINUTE, resetOnDemandState, setSummaryWarnLogger } = await import('@/lib/api/summary');
const { resetRateLimits } = await import('@/lib/api/rateLimit');
const { resetSummaryCache } = await import('@/lib/ai');

const TOKEN = 'a-shared-secret-of-sufficient-length';
const uncached = (id = 'uiuc:p:on-demand-target'): ProfessorDetail => ({
  ...base, summary: null,
  professor: { ...base.professor, id },
  reviews: base.reviews.map((r) => ({ ...r, professorId: id })),
});
const repo = { getSummary: async () => null };
const generated = (id: string) => ({ ...base.summary!, professorId: id, source: 'openai-compatible' as const, model: 'mock', provider: 'Mock' });

beforeEach(() => {
  envState.SUMMARY_ON_DEMAND = false;
  envState.SUMMARY_ON_DEMAND_TOKEN = undefined;
  getOrCreateSummary.mockReset();
  getOrCreateSummary.mockImplementation(async (detail: ProfessorDetail) => generated(detail.professor.id));
  resetRateLimits();
  resetOnDemandState();
  resetSummaryCache();
  setSummaryWarnLogger(() => {});
});
afterEach(() => setSummaryWarnLogger(null));

describe('isOnDemandAuthorized', () => {
  const withKey = (value?: string) => new Request('http://localhost/x', { headers: value === undefined ? {} : { [ON_DEMAND_HEADER]: value } });
  it('is false without a configured token, without the header, or with the wrong value', () => {
    expect(isOnDemandAuthorized(withKey(TOKEN), undefined)).toBe(false);
    expect(isOnDemandAuthorized(withKey(), TOKEN)).toBe(false);
    expect(isOnDemandAuthorized(withKey('nope'), TOKEN)).toBe(false);
    expect(isOnDemandAuthorized(withKey(`${TOKEN}x`), TOKEN)).toBe(false);
  });
  it('is true only for the exact token', () => {
    expect(isOnDemandAuthorized(withKey(TOKEN), TOKEN)).toBe(true);
  });
});

describe('buildSummaryResponse gating', () => {
  it('never calls a provider when SUMMARY_ON_DEMAND is off, even for an authorised request', async () => {
    const body = await buildSummaryResponse(uncached(), repo, { onDemandAuthorized: true });
    expect(body.summary?.source).toBe('extractive');
    expect(getOrCreateSummary).not.toHaveBeenCalled();
  });

  it('never calls a provider for an anonymous request when SUMMARY_ON_DEMAND is on', async () => {
    envState.SUMMARY_ON_DEMAND = true;
    envState.SUMMARY_ON_DEMAND_TOKEN = TOKEN;
    const body = await buildSummaryResponse(uncached(), repo);
    expect(body.summary?.source).toBe('extractive');
    expect(body.cached).toBe(false);
    expect(getOrCreateSummary).not.toHaveBeenCalled();
    expect((await buildSummaryResponse(uncached(), repo, { onDemandAuthorized: false })).summary?.source).toBe('extractive');
    expect(getOrCreateSummary).not.toHaveBeenCalled();
  });

  it('calls the provider once for an authorised request, with request-context retry/timeout bounds', async () => {
    envState.SUMMARY_ON_DEMAND = true;
    envState.SUMMARY_ON_DEMAND_TOKEN = TOKEN;
    const body = await buildSummaryResponse(uncached(), repo, { onDemandAuthorized: true });
    expect(body.summary?.source).toBe('openai-compatible');
    expect(body.cached).toBe(false);
    expect(getOrCreateSummary).toHaveBeenCalledTimes(1);
    const opts = getOrCreateSummary.mock.calls[0][1] as Record<string, unknown>;
    expect(opts).toMatchObject({ allowClaude: true, force: true, maxRateLimitRetries: 0 });
    expect(opts.timeoutMs).toBeLessThanOrEqual(8_000);
  });

  it('de-duplicates concurrent requests and memoises the generated entry for later ones', async () => {
    envState.SUMMARY_ON_DEMAND = true;
    envState.SUMMARY_ON_DEMAND_TOKEN = TOKEN;
    let release!: () => void;
    getOrCreateSummary.mockImplementation((detail: ProfessorDetail) => new Promise((resolve) => { release = () => resolve(generated(detail.professor.id)); }));
    const burst = Promise.all(Array.from({ length: 10 }, () => buildSummaryResponse(uncached(), repo, { onDemandAuthorized: true })));
    await new Promise((r) => setTimeout(r, 5));
    release();
    const results = await burst;
    expect(getOrCreateSummary).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.summary?.source === 'openai-compatible')).toBe(true);
  });

  it('falls through to the extractive summary once the per-instance budget is spent', async () => {
    envState.SUMMARY_ON_DEMAND = true;
    envState.SUMMARY_ON_DEMAND_TOKEN = TOKEN;
    const warnings: string[] = [];
    setSummaryWarnLogger((m) => warnings.push(m));
    for (let i = 0; i < ON_DEMAND_BUDGET_PER_MINUTE.limit; i++) {
      expect((await buildSummaryResponse(uncached(`uiuc:p:budget-${i}`), repo, { onDemandAuthorized: true })).summary?.source).toBe('openai-compatible');
    }
    const over = await buildSummaryResponse(uncached('uiuc:p:budget-over'), repo, { onDemandAuthorized: true });
    expect(over.summary?.source).toBe('extractive');
    expect(getOrCreateSummary).toHaveBeenCalledTimes(ON_DEMAND_BUDGET_PER_MINUTE.limit);
    expect(warnings.some((w) => w.includes('budget'))).toBe(true);
  });
});
