/**
 * Ports (interfaces) for everything the services depend on that touches the
 * outside world. Constructor-injecting these is what lets unit tests run with
 * trivial fakes instead of a network, a clock, or a Clerk instance.
 */

/** `globalThis.fetch`, narrowed so tests can substitute a stub. */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Injectable time source; makes TTLs and durations deterministic in tests. */
export interface Clock {
  now(): Date;
  nowMs(): number;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

/** Verified identity extracted from a bearer token. */
export interface VerifiedIdentity {
  userId: string;
  sessionId?: string;
  /** Raw JWT claims, for anything not surfaced above. */
  claims?: Record<string, unknown>;
}

/** Wraps Clerk's `verifyToken`. */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

/** Display information about a user, fetched from the identity provider. */
export interface UserIdentity {
  userId: string;
  displayName: string;
  imageUrl: string;
  primaryEmail?: string;
}

/**
 * Wraps Clerk's user lookup. Previously the frontend read `currentUser()` and
 * posted `userName`/`userImageUrl` in request bodies; the backend now resolves
 * them itself so they cannot be spoofed.
 */
export interface IdentityProvider {
  getUser(userId: string): Promise<UserIdentity | null>;
}

/**
 * Minimal async key/value store. `MemoryKeyValueStore` backs it today; a Redis
 * implementation can be dropped in without touching a single caller.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  /** Returns false when the key already existed (atomic set-if-absent). */
  setIfAbsent<T>(key: string, value: T, ttlMs?: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Atomic counter used by the abuse detectors. */
  increment(key: string, ttlMs: number): Promise<number>;
}
