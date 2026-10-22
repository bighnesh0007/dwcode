/**
 * BullMqJobQueue against a REAL Redis (BullMQ's semantics live in Lua scripts
 * inside Redis; a fake would prove nothing). Runs only with TEST_REDIS_URL.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { BullMqJobQueue, QueueFullError, type JobQueue, type JobStatus } from "../../src/services/queue/jobQueue.ts";
import { CompilerUnavailableError, NotFoundError } from "../../src/errors/AppError.ts";

// eslint-disable-next-line no-restricted-properties -- a test opt-in switch, not app configuration
const URL = process.env.TEST_REDIS_URL;

type Data = { userId: string; mode: "ok" | "unavailable" | "notfound" | "slow" };

describe.skipIf(!URL)("BullMqJobQueue (real Redis)", () => {
  const opened: JobQueue<Data, string>[] = [];
  const calls = new Map<string, number>();

  function queue(opts: { maxWaiting?: number; concurrency?: number } = {}) {
    const q = new BullMqJobQueue<Data, string>(
      `test-${randomUUID()}`,
      new Redis(URL!, { maxRetriesPerRequest: null }),
      async (d) => {
        calls.set(d.userId, (calls.get(d.userId) ?? 0) + 1);
        if (d.mode === "unavailable") throw new CompilerUnavailableError("down", 5);
        if (d.mode === "notfound") throw new NotFoundError("Problem not found.");
        if (d.mode === "slow") await new Promise((r) => setTimeout(r, 2_000));
        return `done:${d.userId}`;
      },
      { concurrency: opts.concurrency ?? 2, attempts: 3, backoffMs: 50, maxWaiting: opts.maxWaiting ?? 100, resultTtlMs: 60_000 },
    );
    opened.push(q);
    return q;
  }

  async function settle(q: JobQueue<Data, string>, id: string): Promise<JobStatus<Data, string>> {
    for (let i = 0; i < 200; i++) {
      const s = await q.status(id);
      if (s && (s.state === "completed" || s.state === "failed")) return s;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("job did not settle");
  }

  afterAll(async () => {
    await Promise.all(opened.map((q) => q.close()));
  });

  it("runs a job and returns its result to a poller", async () => {
    const q = queue();
    const { id } = await q.enqueue({ userId: "u-ok", mode: "ok" });
    const s = await settle(q, id);
    expect(s).toMatchObject({ state: "completed", result: "done:u-ok", data: { userId: "u-ok" } });
  });

  it("retries an unavailable compiler, then fails with COMPILER_UNAVAILABLE", async () => {
    const q = queue();
    const { id } = await q.enqueue({ userId: "u-down", mode: "unavailable" });
    const s = await settle(q, id);
    expect(s.state).toBe("failed");
    expect(s.error?.code).toBe("COMPILER_UNAVAILABLE");
    expect(calls.get("u-down")).toBe(3);
  });

  it("fails a deterministic error at once, keeping its code", async () => {
    const q = queue();
    const { id } = await q.enqueue({ userId: "u-404", mode: "notfound" });
    const s = await settle(q, id);
    expect(s.error).toEqual({ code: "NOT_FOUND", message: "Problem not found." });
    expect(calls.get("u-404")).toBe(1);
  });

  it("refuses new jobs once the waiting backlog hits its cap", async () => {
    const q = queue({ maxWaiting: 2, concurrency: 1 });
    await q.enqueue({ userId: "s1", mode: "slow" });
    await new Promise((r) => setTimeout(r, 300)); // s1 becomes active
    await q.enqueue({ userId: "s2", mode: "slow" });
    await q.enqueue({ userId: "s3", mode: "slow" });
    await expect(q.enqueue({ userId: "s4", mode: "slow" })).rejects.toBeInstanceOf(QueueFullError);
  });

  it("returns null for an unknown job id", async () => {
    expect(await queue().status(randomUUID())).toBeNull();
  });
});
