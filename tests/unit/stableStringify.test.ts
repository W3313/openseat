// src/lib/utils/stableStringify — compact by default (MULTI_SCHOOL_DESIGN §3), sorted keys, 3-dp floats.
import { describe, expect, it } from 'vitest';
import { roundFloat, stableNormalize, stableStringify } from '@/lib/utils/stableStringify';

describe('stableStringify', () => {
  it('is compact with sorted keys by default and rounds floats to 3 dp', () => {
    expect(stableStringify({ b: 1.23456, a: [3, 2.5], c: { z: null, y: 'x' } })).toBe('{"a":[3,2.5],"b":1.235,"c":{"y":"x","z":null}}');
    expect(stableStringify({ n: Number.NaN, i: Number.POSITIVE_INFINITY })).toBe('{"i":null,"n":null}');
  });

  it('still indents on request (human-facing config files)', () => {
    expect(stableStringify({ b: 1, a: 2 }, { indent: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}');
    expect(stableStringify([1.0005], { decimals: 2 })).toBe('[1]');
  });

  it('roundFloat rounds half away from zero at the requested precision', () => {
    expect(roundFloat(1.0005)).toBe(1.001);
    expect(roundFloat(-1.0005)).toBe(-1.001);
    expect(roundFloat(2.5, 0)).toBe(3);
  });

  it('stableNormalize round-trips through the same normalization', () => {
    expect(stableNormalize({ x: 0.12345, d: new Date('2026-01-02T03:04:05Z') })).toEqual({ x: 0.123, d: '2026-01-02T03:04:05.000Z' });
  });

  it('refuses circular structures', () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(() => stableStringify(a)).toThrowError(/circular/);
  });
});
