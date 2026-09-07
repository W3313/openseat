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

  it('ships no RMP or UCSB credential by default and keeps them optional', () => {
    const e = envOf({});
    expect(e.RMP_AUTH_HEADER).toBeUndefined();
    expect(e.UCSB_API_KEY).toBeUndefined();
    expect(envOf({ RMP_AUTH_HEADER: 'Basic x', UCSB_API_KEY: 'k' })).toMatchObject({ RMP_AUTH_HEADER: 'Basic x', UCSB_API_KEY: 'k' });
  });

  it('removed the global data-mode switches', () => {
    for (const gone of ['DATA_MODE', 'REVIEW_SOURCE', 'RMP_ENABLED']) expect(ENV_KEYS as string[]).not.toContain(gone);
    expect(ENV_KEYS as string[]).toEqual(expect.arrayContaining(['SCHOOLS', 'UCSB_API_KEY']));
  });
});

describe('SCHOOLS allowlist', () => {
  it('defaults to every registered school and keeps registry order', () => {
    expect(envOf({}).SCHOOLS).toEqual(['uiuc', 'purdue', 'ucsb', 'uh', 'utd', 'demo']);
    expect(envOf({ SCHOOLS: 'demo, UIUC' }).SCHOOLS).toEqual(['uiuc', 'demo']);
    expect(envOf({ SCHOOLS: 'utd,uh' }).SCHOOLS).toEqual(['uh', 'utd']);
    expect(envOf({ SCHOOLS: 'uiuc' }).SCHOOLS).toEqual(['uiuc']);
    expect(envOf({ SCHOOLS: 'demo' }).SCHOOLS).toEqual(['demo']);
  });

  it('rejects unknown school ids', () => {
    expect(() => envOf({ SCHOOLS: 'uiuc,mit' })).toThrow(/unknown school id\(s\) mit/);
  });
});
