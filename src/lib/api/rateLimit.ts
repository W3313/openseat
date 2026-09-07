// In-memory sliding-window rate limiter for the GET routes (defence in depth, not the real limit).
//
// Scope and limits: the store is a module-level Map, so it lives per warm serverless instance and is
// reset whenever the instance is recycled. On Vercel that means it reliably blunts a single-source burst
// against one instance and does nothing against traffic spread over many instances or many IPs. The
// real limit belongs at the edge: a Vercel Firewall rate-limit rule on `/api/*` (Pro plan; Attack Challenge
// Mode is the Hobby-plan emergency switch), or a shared store such as Upstash Redis — swap the body of
// `checkRateLimit` for `@upstash/ratelimit`'s `Ratelimit.slidingWindow(limit, window).limit(key)` and
// keep the call sites unchanged.
//
// Keying: the client IP from the first `x-forwarded-for` hop (set by the platform in front of the
// function; on Vercel it is trustworthy) falling back to `x-real-ip`, then 'unknown'. Behind no proxy
// every client shares the 'unknown' bucket, which is the safe direction to fail.

export interface RateLimitPolicy {
  /** Max requests per key inside one window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests left in the window after this one (0 when denied). */
  remaining: number;
  /** Seconds until the oldest request in the window expires (>= 1 when denied). */
  retryAfterSec: number;
}

/** Default for read routes: 60 requests per minute per IP. */
export const READ_RATE_LIMIT: RateLimitPolicy = { limit: 60, windowMs: 60_000 };
/** The summary route may reach a model when on-demand generation is authorised, so it is stricter. */
export const SUMMARY_RATE_LIMIT: RateLimitPolicy = { limit: 6, windowMs: 60_000 };

/** Upper bound on tracked keys; the whole store is dropped past it so a hot instance cannot grow without bound. */
export const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, number[]>();
let enabled = true;

/** Client key for a request: first x-forwarded-for hop → x-real-ip → 'unknown'. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  const real = req.headers.get('x-real-ip')?.trim();
  return real ? real.slice(0, 64) : 'unknown';
}

/**
 * Record one request against `key` under `policy` and say whether it fits in the window.
 * Sliding log: timestamps older than `windowMs` are dropped on every call.
 */
export function checkRateLimit(key: string, policy: RateLimitPolicy, now: number = Date.now()): RateLimitResult {
  if (!enabled) return { allowed: true, limit: policy.limit, remaining: policy.limit, retryAfterSec: 0 };
  if (windows.size >= MAX_TRACKED_KEYS && !windows.has(key)) windows.clear();
  const cutoff = now - policy.windowMs;
  const stamps = (windows.get(key) ?? []).filter((t) => t > cutoff);
  if (stamps.length >= policy.limit) {
    windows.set(key, stamps);
    const retryAfterMs = stamps[0] + policy.windowMs - now;
    return { allowed: false, limit: policy.limit, remaining: 0, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  stamps.push(now);
  windows.set(key, stamps);
  return { allowed: true, limit: policy.limit, remaining: policy.limit - stamps.length, retryAfterSec: 0 };
}

/** Forget every window (tests). */
export function resetRateLimits(): void {
  windows.clear();
}

/** Tests only: bypass the limiter globally while exercising unrelated route behaviour. */
export function setRateLimitEnabled(value: boolean): void {
  enabled = value;
}

/** Observability for tests. */
export function rateLimitStats(): { keys: number } {
  return { keys: windows.size };
}
