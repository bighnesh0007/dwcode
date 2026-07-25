/**
 * In-memory `KeyValueStore`, backed by an LRU so it cannot grow without bound.
 *
 * Unbounded `Map`s are how in-process rate limiting and spam control turn into a
 * memory leak, so capacity is mandatory rather than optional.
 *
 * To move to Redis later, implement the same `KeyValueStore` port and swap the
 * instance in the container — no caller changes.
 */
import { LRUCache } from "lru-cache";
import type { KeyValueStore } from "../../types/ports.ts";

interface Entry {
  value: unknown;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly cache: LRUCache<string, Entry>;

  constructor(opts: { max?: number; defaultTtlMs?: number } = {}) {
    this.cache = new LRUCache<string, Entry>({
      max: opts.max ?? 10_000,
      ...(opts.defaultTtlMs === undefined ? {} : { ttl: opts.defaultTtlMs }),
      // Keep TTL semantics predictable: reading must not extend a key's life,
      // otherwise abuse windows would slide forever under sustained traffic.
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });
  }

  get<T>(key: string): Promise<T | undefined> {
    const hit = this.cache.get(key);
    return Promise.resolve(hit === undefined ? undefined : (hit.value as T));
  }

  set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.cache.set(key, { value }, ttlMs === undefined ? undefined : { ttl: ttlMs });
    return Promise.resolve();
  }

  setIfAbsent<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
    if (this.cache.has(key)) return Promise.resolve(false);
    this.cache.set(key, { value }, ttlMs === undefined ? undefined : { ttl: ttlMs });
    return Promise.resolve(true);
  }

  delete(key: string): Promise<void> {
    this.cache.delete(key);
    return Promise.resolve();
  }

  increment(key: string, ttlMs: number): Promise<number> {
    const current = this.cache.get(key);
    const next = typeof current?.value === "number" ? current.value + 1 : 1;
    // Preserve the original window: only a fresh key (re)starts the TTL.
    if (current === undefined) this.cache.set(key, { value: next }, { ttl: ttlMs });
    else this.cache.set(key, { value: next }, { ttl: this.cache.getRemainingTTL(key) });
    return Promise.resolve(next);
  }

  /** Test helper. */
  clear(): void {
    this.cache.clear();
  }
}
