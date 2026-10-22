/**
 * Against a REAL Redis: the Lua increment and SET NX semantics cannot be proven
 * with a fake. Runs only when TEST_REDIS_URL is set, e.g.
 *
 *     docker run -d --rm --network host redis:7-alpine redis-server --port 6390
 *     TEST_REDIS_URL=redis://127.0.0.1:6390 npm test -w dwcode-server
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { RedisStore } from "rate-limit-redis";
import request from "supertest";
import express from "express";
import { RedisKeyValueStore } from "../../src/lib/store/redisStore.ts";
import { errorHandler } from "../../src/middleware/errorHandler.ts";
import { createLimiter, useRateLimitStore } from "../../src/middleware/rateLimit.ts";

// eslint-disable-next-line no-restricted-properties -- a test opt-in switch, not app configuration
const URL = process.env.TEST_REDIS_URL;

describe.skipIf(!URL)("RedisKeyValueStore (real Redis)", () => {
  let redis: Redis;
  let store: RedisKeyValueStore;
  const prefix = `test:${process.pid}:${Date.now()}:`;

  beforeAll(() => {
    redis = new Redis(URL!);
    store = new RedisKeyValueStore(redis, prefix);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  it("round-trips JSON values", async () => {
    await store.set("a", { ok: true, output: "[1]" });
    expect(await store.get("a")).toEqual({ ok: true, output: "[1]" });
    expect(await store.get("missing")).toBeUndefined();
  });

  it("expires keys after their TTL", async () => {
    await store.set("ttl", 1, 50);
    await new Promise((r) => setTimeout(r, 120));
    expect(await store.get("ttl")).toBeUndefined();
  });

  it("setIfAbsent only wins once", async () => {
    expect(await store.setIfAbsent("once", 1, 10_000)).toBe(true);
    expect(await store.setIfAbsent("once", 2, 10_000)).toBe(false);
    expect(await store.get("once")).toBe(1);
  });

  it("increments atomically under concurrency and sets the TTL once", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => store.increment("ctr", 10_000)));
    expect(new Set(results).size).toBe(50);
    expect(Math.max(...results)).toBe(50);
    const ttl = await redis.pttl(`${prefix}ctr`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10_000);
  });

  it("shares one rate-limit quota across separate app instances", async () => {
    // This is why Redis exists here: in memory, each instance would grant the
    // full quota, so N instances would multiply every limit by N.
    useRateLimitStore(
      (policy) =>
        new RedisStore({
          prefix: `${prefix}rl:${policy}:`,
          sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<never>,
        }),
    );
    const makeApp = () => express().get("/x", createLimiter("ai"), (_req, res) => res.send("ok")).use(errorHandler);
    const a = makeApp();
    const b = makeApp();
    const statuses: number[] = [];
    // The "ai" policy allows 8 per minute per key; alternate between instances.
    for (let i = 0; i < 10; i++) statuses.push((await request(i % 2 ? b : a).get("/x")).status);
    expect(statuses).toEqual([...Array(8).fill(200), 429, 429]);
  });
});
