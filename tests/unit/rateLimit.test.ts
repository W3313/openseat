// src/lib/api/rateLimit.ts: sliding window per key, Retry-After, key extraction, memory bound, and the
// withApiErrors integration (429 with the standard error shape, no-store).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody } from '@/lib/api/respond';
import {
  MAX_TRACKED_KEYS, READ_RATE_LIMIT, SUMMARY_RATE_LIMIT, checkRateLimit, clientKey, rateLimitStats, resetRateLimits, setRateLimitEnabled,
} from '@/lib/api/rateLimit';
import { withApiErrors } from '@/lib/api/handlers';

beforeEach(() => {
  setRateLimitEnabled(true);
  resetRateLimits();
});
afterEach(() => resetRateLimits());

describe('checkRateLimit', () => {
  it('allows `limit` requests inside the window, then denies with a Retry-After', () => {
    const policy = { limit: 3, windowMs: 10_000 };
    const t0 = 1_000_000;
    expect(checkRateLimit('k', policy, t0)).toEqual({ allowed: true, limit: 3, remaining: 2, retryAfterSec: 0 });
    expect(checkRateLimit('k', policy, t0 + 100).remaining).toBe(1);
    expect(checkRateLimit('k', policy, t0 + 200).remaining).toBe(0);
    const denied = checkRateLimit('k', policy, t0 + 300);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSec).toBe(10); // oldest stamp at t0 expires at t0 + 10 s → ceil(9.7 s)
  });

  it('slides: once the oldest request leaves the window a new one fits', () => {
    const policy = { limit: 2, windowMs: 1_000 };
    checkRateLimit('k', policy, 0);
    checkRateLimit('k', policy, 500);
    expect(checkRateLimit('k', policy, 900).allowed).toBe(false);
    expect(checkRateLimit('k', policy, 1_001).allowed).toBe(true); // stamp at 0 expired, 500 remains
    expect(checkRateLimit('k', policy, 1_002).allowed).toBe(false);
    expect(checkRateLimit('k', policy, 1_501).allowed).toBe(true);
  });

  it('keys are independent and a denied request never counts', () => {
    const policy = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit('a', policy, 0).allowed).toBe(true);
    expect(checkRateLimit('b', policy, 0).allowed).toBe(true);
    expect(checkRateLimit('a', policy, 1).allowed).toBe(false);
    expect(checkRateLimit('a', policy, 2).retryAfterSec).toBe(60); // still measured from the single accepted stamp
  });

  it('bounds memory: past MAX_TRACKED_KEYS the store is dropped rather than growing', () => {
    const policy = { limit: 1, windowMs: 60_000 };
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) checkRateLimit(`ip-${i}`, policy, 0);
    expect(rateLimitStats().keys).toBe(MAX_TRACKED_KEYS);
    checkRateLimit('one-more', policy, 0);
    expect(rateLimitStats().keys).toBe(1);
  });

  it('can be disabled for unrelated tests', () => {
    setRateLimitEnabled(false);
    const policy = { limit: 1, windowMs: 60_000 };
    for (let i = 0; i < 5; i++) expect(checkRateLimit('k', policy, 0).allowed).toBe(true);
  });

  it('ships sane defaults: 60/min for reads, 6/min for the summary route', () => {
    expect(READ_RATE_LIMIT).toEqual({ limit: 60, windowMs: 60_000 });
    expect(SUMMARY_RATE_LIMIT).toEqual({ limit: 6, windowMs: 60_000 });
  });
});

describe('clientKey', () => {
  const withHeaders = (h: Record<string, string>) => new Request('http://localhost/x', { headers: h });
  it('uses the first x-forwarded-for hop, then x-real-ip, then unknown', () => {
    expect(clientKey(withHeaders({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientKey(withHeaders({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientKey(withHeaders({}))).toBe('unknown');
  });
  it('truncates absurd header values', () => {
    expect(clientKey(withHeaders({ 'x-forwarded-for': 'x'.repeat(1_000) })).length).toBe(64);
  });
});

describe('withApiErrors rate limiting', () => {
  const ok = async () => new Response('ok');
  const from = (ip: string) => new Request('http://localhost/api/x', { headers: { 'x-forwarded-for': ip } });

  it('returns 429 with the standard error shape, Retry-After and no-store once the policy is exceeded', async () => {
    const policy = { limit: 2, windowMs: 60_000 };
    expect((await withApiErrors(from('1.1.1.1'), ok, { rateLimit: policy, bucket: 't' })).status).toBe(200);
    expect((await withApiErrors(from('1.1.1.1'), ok, { rateLimit: policy, bucket: 't' })).status).toBe(200);
    const res = await withApiErrors(from('1.1.1.1'), ok, { rateLimit: policy, bucket: 't' });
    expect(res.status).toBe(429);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(res.headers.get('x-ratelimit-limit')).toBe('2');
    const body = (await res.json()) as ApiErrorBody;
    expect(body).toEqual({ error: { code: 'rate_limited', message: 'Too many requests' } });
    // another client is unaffected; another bucket for the same client is unaffected
    expect((await withApiErrors(from('2.2.2.2'), ok, { rateLimit: policy, bucket: 't' })).status).toBe(200);
    expect((await withApiErrors(from('1.1.1.1'), ok, { rateLimit: policy, bucket: 'other' })).status).toBe(200);
  });

  it('applies the read default when no policy is given and can be switched off per route', async () => {
    for (let i = 0; i < READ_RATE_LIMIT.limit; i++) expect((await withApiErrors(from('3.3.3.3'), ok)).status).toBe(200);
    expect((await withApiErrors(from('3.3.3.3'), ok)).status).toBe(429);
    expect((await withApiErrors(from('3.3.3.3'), ok, { rateLimit: null })).status).toBe(200);
  });
});
