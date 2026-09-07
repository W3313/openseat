// src/lib/config/env.ts: the opt-in switch that spends money refuses to start without its companion secret,
// no third-party credential ships as a default, and the SCHOOLS allowlist is validated against the registry
// (MULTI_SCHOOL_DESIGN §2 — DATA_MODE / REVIEW_SOURCE / RMP_ENABLED no longer exist).
import { describe, expect, it } from 'vitest';
import { ENV_KEYS, EnvError, loadEnv } from '@/lib/config/env';

const envOf = (vars: Record<string, string>) => loadEnv(vars as NodeJS.ProcessEnv);

describe('env security invariants', () => {
  it('SUMMARY_ON_DEMAND=1 requires SUMMARY_ON_DEMAND_TOKEN of at least 16 characters', () => {
    expect(() => envOf({ SUMMARY_ON_DEMAND: '1' })).toThrow(EnvError);
    expect(() => envOf({ SUMMARY_ON_DEMAND: '1', SUMMARY_ON_DEMAND_TOKEN: 'short' })).toThrow(EnvError);
    expect(envOf({ SUMMARY_ON_DEMAND: '1', SUMMARY_ON_DEMAND_TOKEN: 'a-shared-secret-of-sufficient-length' }).SUMMARY_ON_DEMAND).toBe(true);
    expect(envOf({}).SUMMARY_ON_DEMAND).toBe(false);
  });

  it('ships no RMP credential by default and keeps it optional', () => {
    const e = envOf({});
    expect(e.RMP_AUTH_HEADER).toBeUndefined();
    expect(envOf({ RMP_AUTH_HEADER: 'Basic x' })).toMatchObject({ RMP_AUTH_HEADER: 'Basic x' });
  });

  it('removed the global data-mode switches', () => {
    for (const gone of ['DATA_MODE', 'REVIEW_SOURCE', 'RMP_ENABLED', 'DEMO_SEED', 'UCSB_API_KEY']) expect(ENV_KEYS as string[]).not.toContain(gone);
    expect(ENV_KEYS as string[]).toEqual(expect.arrayContaining(['SCHOOLS']));
  });
});

describe('SCHOOLS allowlist', () => {
  it('defaults to every registered school and keeps registry order', () => {
    expect(envOf({}).SCHOOLS).toEqual(['uiuc', 'purdue', 'uh']);
    expect(envOf({ SCHOOLS: 'uh, UIUC' }).SCHOOLS).toEqual(['uiuc', 'uh']);
    expect(envOf({ SCHOOLS: 'uh,purdue' }).SCHOOLS).toEqual(['purdue', 'uh']);
    expect(envOf({ SCHOOLS: 'uiuc' }).SCHOOLS).toEqual(['uiuc']);
    expect(envOf({ SCHOOLS: 'purdue' }).SCHOOLS).toEqual(['purdue']);
  });

  it('rejects unknown school ids', () => {
    expect(() => envOf({ SCHOOLS: 'uiuc,mit' })).toThrow(/unknown school id\(s\) mit/);
    for (const removed of ['demo', 'utd', 'ucsb']) expect(() => envOf({ SCHOOLS: removed })).toThrow(/unknown school id/);
  });
});
