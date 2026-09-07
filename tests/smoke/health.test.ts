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

  it('sends the security headers on pages and API routes and hides X-Powered-By', async () => {
    for (const path of ['/', '/about', '/api/health', '/api/schools/uiuc/professors/nobody-here']) {
      const res = await fetch(`${baseUrl}${path}`);
      const csp = res.headers.get('content-security-policy') ?? '';
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(res.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(res.headers.get('x-frame-options'), path).toBe('DENY');
      expect(res.headers.get('referrer-policy'), path).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('permissions-policy'), path).toContain('camera=()');
      expect(res.headers.get('strict-transport-security'), path).toContain('max-age=63072000');
      expect(res.headers.get('x-powered-by'), path).toBeNull();
    }
  });

  it('robots.txt keeps crawlers off the API and the per-request compare page', async () => {
    const text = await (await fetch(`${baseUrl}/robots.txt`)).text();
    expect(text).toMatch(/Disallow: \/api\//);
    expect(text).toMatch(/Disallow: \/compare\//);
  });
});
