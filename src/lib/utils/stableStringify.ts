// Deterministic JSON for every file under data/processed/ (SPEC 5, 6.5, risk #17):
// sorted object keys, 2-space indent, non-integer numbers rounded to 3 decimals, non-finite → null.

export interface StableStringifyOptions {
  /** Indentation passed to JSON.stringify (default 2). */
  indent?: number;
  /** Decimal places non-integer numbers are rounded to (default 3). */
  decimals?: number;
}

/** Round half away from zero at `dp` decimals, avoiding the classic 1.005 → 1 float trap. */
export function roundFloat(value: number, dp = 3): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** dp;
  const scaled = Math.abs(value) * factor;
  // Nudge by one ulp-ish epsilon so 1.0005 * 1000 = 1000.4999… rounds up as a human expects.
  const rounded = Math.round(scaled + Number.EPSILON * scaled);
  const result = rounded / factor;
  return value < 0 ? -result : result;
}

function normalizeValue(value: unknown, decimals: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) return null;
      return Number.isInteger(value) ? value : roundFloat(value, decimals);
    case 'string':
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
    case 'symbol':
      return undefined;
    default:
      break;
  }
  const obj = value as object;
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  if (seen.has(obj)) throw new TypeError('stableStringify: circular structure');
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      return obj.map((item) => {
        const v = normalizeValue(item, decimals, seen);
        return v === undefined ? null : v;
      });
    }
    if (obj instanceof Set) return normalizeValue([...obj], decimals, seen);
    if (obj instanceof Map) return normalizeValue(Object.fromEntries(obj), decimals, seen);
    const withToJson = obj as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === 'function') return normalizeValue(withToJson.toJSON(), decimals, seen);

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = normalizeValue((obj as Record<string, unknown>)[key], decimals, seen);
      if (v !== undefined) out[key] = v;
    }
    return out;
  } finally {
    seen.delete(obj);
  }
}

/**
 * JSON.stringify with sorted keys, 2-space indent and floats rounded to 3 dp. No trailing newline —
 * writers append one so committed files end with "\n".
 */
export function stableStringify(value: unknown, options: StableStringifyOptions = {}): string {
  const { indent = 2, decimals = 3 } = options;
  const normalized = normalizeValue(value, decimals, new WeakSet());
  return JSON.stringify(normalized === undefined ? null : normalized, null, indent);
}

/** Deep copy with the same normalization stableStringify applies (handy before hashing or comparing). */
export function stableNormalize<T>(value: T, decimals = 3): T {
  return JSON.parse(stableStringify(value, { indent: 0, decimals })) as T;
}
