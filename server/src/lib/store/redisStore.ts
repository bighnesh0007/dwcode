/**
 * Redis-backed `KeyValueStore`: the same port as MemoryKeyValueStore, so the
 * swap happens in the container and no caller changes.
 *
 * Why it matters: memory-backed rate limits and caches are per process. With two
 * server instances a user gets twice the quota, and a result cached on one
 * instance is a miss on the other. Redis makes both shared.
 */
import type { Redis } from "ioredis";
import type { KeyValueStore } from "../../types/ports.ts";

/**
 * INCR, setting the TTL only when the key is new — atomically, so a crash between
 * the two commands can never leave a counter that never expires. Matches
 * MemoryKeyValueStore.increment: the window starts at the first hit and does not slide.
 */
const INCREMENT_WITH_TTL = `
local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return n`;

export class RedisKeyValueStore implements KeyValueStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "dwc:",
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.prefix + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlMs === undefined) await this.redis.set(this.prefix + key, raw);
    else await this.redis.set(this.prefix + key, raw, "PX", ttlMs);
  }

  async setIfAbsent<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
    const raw = JSON.stringify(value);
    const result =
      ttlMs === undefined
        ? await this.redis.set(this.prefix + key, raw, "NX")
        : await this.redis.set(this.prefix + key, raw, "PX", ttlMs, "NX");
    return result === "OK";
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const n = await this.redis.eval(INCREMENT_WITH_TTL, 1, this.prefix + key, ttlMs);
    return Number(n);
  }
}
