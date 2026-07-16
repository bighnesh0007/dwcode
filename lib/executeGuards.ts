/**
 * In-memory guards for the DataWeave execute proxy (`/api/execute`).
 *
 * The DataWeave runtime is a JVM that compiles + runs a script per request —
 * expensive CPU/memory work. On a small/free instance a burst of Submits (each
 * fanning out to one call per test case) is enough to take it down. These
 * guards cut that load *before* it reaches the backend, with zero extra infra:
 *
 *   1. resultCache  — dedupe identical {script, inputs} runs (huge hit rate on
 *                     a practice site where everyone submits the same problems)
 *   2. rateLimit    — cap executions per user/IP so one client can't saturate it
 *
 * State lives on `globalThis` so it survives module re-evaluation (hot reload /
 * warm serverless invocations), the same pattern used in lib/db.ts.
 */

// ---- Tunables ---------------------------------------------------------------

/** How long a compile/exec result stays fresh. Scripts are pure, so the only
 *  reason to expire at all is to bound memory. */
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
/** Max cached results; oldest is evicted past this (simple LRU). */
export const CACHE_MAX_ENTRIES = 1000;

/** Rolling window and per-identity budget for executions. */
export const RATE_WINDOW_MS = 60 * 1000; // 1 min
export const RATE_MAX_REQUESTS = 30; // 30 runs / min / identity

/** Abort a single backend call after this long so hung compiles don't pile up. */
export const BACKEND_TIMEOUT_MS = 15 * 1000;

// ---- Shared state (survives hot reload / warm invocations) ------------------

type CacheEntry = { value: unknown; expiresAt: number };
type RateEntry = { count: number; resetAt: number };

type GuardState = {
  cache: Map<string, CacheEntry>;
  rate: Map<string, RateEntry>;
};

const g = globalThis as unknown as { __dwExecuteGuards?: GuardState };
const state: GuardState =
  g.__dwExecuteGuards ??
  (g.__dwExecuteGuards = { cache: new Map(), rate: new Map() });

// ---- Result cache -----------------------------------------------------------

/** Stable cache key for a run. `Map` keys on the full string, so there's no
 *  hashing and no collision risk. */
export function cacheKey(script: string, inputs: unknown): string {
  return JSON.stringify({ script, inputs });
}

export function cacheGet(key: string): unknown | undefined {
  const hit = state.cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= now()) {
    state.cache.delete(key);
    return undefined;
  }
  // Refresh recency so the hot set survives eviction (Map preserves insertion
  // order, so delete+set moves this key to the "newest" end).
  state.cache.delete(key);
  state.cache.set(key, hit);
  return hit.value;
}

export function cacheSet(key: string, value: unknown): void {
  state.cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
  // Evict oldest entries (front of insertion order) past the cap.
  while (state.cache.size > CACHE_MAX_ENTRIES) {
    const oldest = state.cache.keys().next().value;
    if (oldest === undefined) break;
    state.cache.delete(oldest);
  }
}

// ---- Rate limiter (fixed window per identity) -------------------------------

export type RateResult = {
  allowed: boolean;
  /** Seconds until the window resets — surfaced as Retry-After on a 429. */
  retryAfterSec: number;
};

export function checkRateLimit(identity: string): RateResult {
  const t = now();
  const entry = state.rate.get(identity);

  if (!entry || entry.resetAt <= t) {
    state.rate.set(identity, { count: 1, resetAt: t + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= RATE_MAX_REQUESTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - t) / 1000) };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

// `Date.now()` isolated here so the rest of the module stays trivially testable.
function now(): number {
  return Date.now();
}
