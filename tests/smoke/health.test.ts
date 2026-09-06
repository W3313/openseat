// Smoke test against a running server (SPEC 12.3 `smoke/health.test.ts`).
// Skipped unless SMOKE_BASE_URL is set, e.g. SMOKE_BASE_URL=http://localhost:3000 npx vitest run tests/smoke
import { describe, expect, it } from 'vitest';

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/+$/, '');

describe.skipIf(!baseUrl)('smoke: /api/health', () => {
  it('responds ok in demo mode', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; mode: string; counts?: { professors: number } };
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('demo');
    expect(body.counts?.professors ?? 0).toBeGreaterThan(0);
  });

  it('serves the landing and about pages', async () => {
    for (const path of ['/', '/about']) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain('ProfPeek');
    }
  });
});
