/**
 * The compiler client decides two things that are expensive to get wrong:
 * when a retry is safe, and whether a failure is the user's or ours. A wrong
 * answer on the first turns a slowdown into an outage; on the second, it records
 * our downtime as a user's wrong answer.
 */
import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../../src/lib/circuitBreaker.ts";
import { MemoryKeyValueStore } from "../../src/lib/store/memoryStore.ts";
import {
  CompilerServiceClient,
  isInfrastructureFailure,
  type CompileRequest,
} from "../../src/services/compiler/compilerService.client.ts";
import type { Clock, FetchLike } from "../../src/types/ports.ts";

const REQ: CompileRequest = {
  script: "%dw 2.0\noutput application/json\n---\npayload",
  inputs: [{ name: "payload", value: "[1]", mimeType: "application/json" }],
};

function fakeClock(start = 0): Clock & { advance(ms: number): void } {
  let now = start;
  return { now: () => new Date(now), nowMs: () => now, advance: (ms) => (now += ms) };
}

const okBody = { ok: true, output: "[1]", mimeType: "application/json", timeMs: 1 };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that plays a script of responses (a function throws to simulate network errors). */
function scriptedFetch(steps: (() => Response)[]): FetchLike & { calls: number } {
  const state = { calls: 0 };
  const f: FetchLike = () => {
    const step = steps[Math.min(state.calls, steps.length - 1)];
    state.calls += 1;
    try {
      return Promise.resolve(step!());
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  };
  return Object.defineProperty(f, "calls", { get: () => state.calls }) as FetchLike & { calls: number };
}

function client(fetchImpl: FetchLike, opts: { cacheTtlMs?: number; clock?: Clock } = {}) {
  return new CompilerServiceClient(
    { url: "http://compiler", authToken: "t".repeat(40), timeoutMs: 1_000, cacheTtlMs: opts.cacheTtlMs ?? 0, cacheMaxOutputBytes: 1024 },
    fetchImpl,
    new MemoryKeyValueStore(),
    opts.clock ?? fakeClock(),
    () => 0, // no jitter: deterministic and fast
  );
}

const refused = () => {
  throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
};
const timedOut = () => {
  throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
};

describe("CompilerServiceClient — results", () => {
  it("returns a successful run", async () => {
    const r = await client(scriptedFetch([() => json(200, okBody)])).execute(REQ);
    expect(r).toMatchObject({ ok: true, output: "[1]", cached: false });
  });

  it("passes a user's compile error through as the user's result, not ours", async () => {
    const r = await client(scriptedFetch([() => json(200, { ok: false, error: { kind: "COMPILE", message: "bad" } })])).execute(REQ);
    expect(r.ok).toBe(false);
    expect(isInfrastructureFailure(r)).toBe(false);
  });

  it("sends the bearer token and the timeout", async () => {
    let seen: RequestInit | undefined;
    const f: FetchLike = (_url, init) => {
      seen = init;
      return Promise.resolve(json(200, okBody));
    };
    await client(f).execute(REQ);
    expect((seen?.headers as Record<string, string>).Authorization).toBe(`Bearer ${"t".repeat(40)}`);
    expect(JSON.parse(seen?.body as string).timeoutMs).toBe(1_000);
  });

  it("treats a rejected token as our misconfiguration", async () => {
    const r = await client(scriptedFetch([() => json(401, { ok: false })])).execute(REQ);
    expect(isInfrastructureFailure(r)).toBe(true);
  });

  it("treats a body that breaks the contract as our failure", async () => {
    const r = await client(scriptedFetch([() => json(200, { surprise: true })])).execute(REQ);
    expect(isInfrastructureFailure(r)).toBe(true);
  });
});

describe("CompilerServiceClient — retries", () => {
  it("retries once when the connection is refused (the request never ran)", async () => {
    const f = scriptedFetch([refused, () => json(200, okBody)]);
    const r = await client(f).execute(REQ);
    expect(r.ok).toBe(true);
    expect(f.calls).toBe(2);
  });

  it("retries at most once", async () => {
    const f = scriptedFetch([refused, refused, refused]);
    const r = await client(f).execute(REQ);
    expect(isInfrastructureFailure(r)).toBe(true);
    expect(f.calls).toBe(2);
  });

  it("retries OVERLOADED, which is refused before the script runs", async () => {
    const f = scriptedFetch([() => json(503, { ok: false, error: { kind: "OVERLOADED", message: "busy" } }), () => json(200, okBody)]);
    expect((await client(f).execute(REQ)).ok).toBe(true);
    expect(f.calls).toBe(2);
  });

  it("never retries a timeout: the script may still be running", async () => {
    const f = scriptedFetch([timedOut, () => json(200, okBody)]);
    const r = await client(f).execute(REQ);
    expect(isInfrastructureFailure(r)).toBe(true);
    expect(f.calls).toBe(1);
  });

  it("never retries a user's error: it would fail identically", async () => {
    const f = scriptedFetch([() => json(200, { ok: false, error: { kind: "RUNTIME", message: "x" } }), () => json(200, okBody)]);
    await client(f).execute(REQ);
    expect(f.calls).toBe(1);
  });
});

describe("CompilerServiceClient — circuit breaker", () => {
  it("opens after repeated infrastructure failures and then fails fast without calling", async () => {
    const clock = fakeClock();
    const f = scriptedFetch([timedOut]);
    const c = client(f, { clock });
    for (let i = 0; i < 5; i++) await c.execute(REQ);
    expect(c.breakerState).toBe("open");
    const callsWhenOpened = f.calls;
    const r = await c.execute(REQ);
    expect(isInfrastructureFailure(r)).toBe(true);
    expect(f.calls).toBe(callsWhenOpened);
  });

  it("is not tripped by user errors", async () => {
    const c = client(scriptedFetch([() => json(200, { ok: false, error: { kind: "COMPILE", message: "bad" } })]));
    for (let i = 0; i < 20; i++) await c.execute(REQ);
    expect(c.breakerState).toBe("closed");
  });
});

describe("CircuitBreaker", () => {
  it("half-opens after the cool-down, admits one probe, and closes on success", () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ failureThreshold: 2, openMs: 1_000 }, clock);
    b.recordFailure();
    b.recordFailure();
    expect(b.tryAcquire()).toBe(false);
    clock.advance(1_000);
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(false); // only one probe
    b.recordSuccess();
    expect(b.state).toBe("closed");
  });

  it("re-opens when the probe fails", () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ failureThreshold: 1, openMs: 1_000 }, clock);
    b.recordFailure();
    clock.advance(1_000);
    expect(b.tryAcquire()).toBe(true);
    b.recordFailure();
    expect(b.state).toBe("open");
  });
});

describe("CompilerServiceClient — result cache", () => {
  it("serves a repeated deterministic result from cache", async () => {
    const f = scriptedFetch([() => json(200, okBody)]);
    const c = client(f, { cacheTtlMs: 60_000 });
    await c.execute(REQ);
    const r = await c.execute(REQ);
    expect(r).toMatchObject({ ok: true, cached: true });
    expect(f.calls).toBe(1);
  });

  it("does not cache timeouts or our failures", async () => {
    const f = scriptedFetch([() => json(200, { ok: false, error: { kind: "TIMEOUT", message: "slow" } })]);
    const c = client(f, { cacheTtlMs: 60_000 });
    await c.execute(REQ);
    await c.execute(REQ);
    expect(f.calls).toBe(2);
  });

  it("keys on inputs as well as the script", async () => {
    const f = scriptedFetch([() => json(200, okBody)]);
    const c = client(f, { cacheTtlMs: 60_000 });
    await c.execute(REQ);
    await c.execute({ ...REQ, inputs: [{ name: "payload", value: "[2]", mimeType: "application/json" }] });
    expect(f.calls).toBe(2);
  });
});
