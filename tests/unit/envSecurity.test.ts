// src/lib/config/env.ts: the two opt-in switches that spend money or talk to a third party refuse to start
// without their companion secret, and no third-party credential ships as a default.
import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from '@/lib/config/env';

const envOf = (vars: Record<string, string>) => loadEnv(vars as NodeJS.ProcessEnv);

describe('env security invariants', () => {
  it('SUMMARY_ON_DEMAND=1 requires SUMMARY_ON_DEMAND_TOKEN of at least 16 characters', () => {
    expect(() => envOf({ SUMMARY_ON_DEMAND: '1' })).toThrow(EnvError);
    expect(() => envOf({ SUMMARY_ON_DEMAND: '1', SUMMARY_ON_DEMAND_TOKEN: 'short' })).toThrow(EnvError);
    expect(envOf({ SUMMARY_ON_DEMAND: '1', SUMMARY_ON_DEMAND_TOKEN: 'a-shared-secret-of-sufficient-length' }).SUMMARY_ON_DEMAND).toBe(true);
    expect(envOf({}).SUMMARY_ON_DEMAND).toBe(false);
  });

  it('RMP_ENABLED=1 requires RMP_AUTH_HEADER and no default token is shipped', () => {
    expect(envOf({}).RMP_AUTH_HEADER).toBeUndefined();
    expect(() => envOf({ RMP_ENABLED: '1' })).toThrow(EnvError);
    expect(envOf({ RMP_ENABLED: '1', RMP_AUTH_HEADER: 'Basic x' }).RMP_AUTH_HEADER).toBe('Basic x');
  });
});
