// Tiny in-memory fixed-window rate limiter. Zero dependencies so it runs in
// Edge middleware on Vercel's free tier (no KV/Redis available). Counters live
// in module scope per instance, so this is a best-effort abuse guard, not a
// globally-consistent limiter — see docs/security-hardening-checklist.md.

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
  /** Seconds until reset, for a Retry-After header. */
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Record a hit for `key` and report whether it is within the budget.
 * Lazily sweeps expired buckets on each call so memory stays bounded.
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  // Bounded lazy sweep: drop expired buckets so the Map can't grow unbounded.
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  const allowed = bucket.count <= opts.limit;
  const remaining = Math.max(0, opts.limit - bucket.count);
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return { allowed, remaining, resetAt: bucket.resetAt, retryAfterSec };
}

/** Test-only helper to clear state between cases. */
export function __resetRateLimit(): void {
  buckets.clear();
}
