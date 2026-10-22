/**
 * The browser side of Run/Submit via server/. What matters: an outage on our
 * side ("unavailable") must never reach the user as a wrong answer, and a
 * flaky poll must not abandon a submission that is still being graded.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { runViaApi, submitViaApi } from "@/lib/compilerApi";

const token = () => Promise.resolve("tok");
const noSleep = () => Promise.resolve();
const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), { status, headers: { "Content-Type": "application/json" } });
const fail = (code: string, status: number, message = "x") =>
  new Response(JSON.stringify({ success: false, error: { code, message, requestId: "r" } }), { status });

function stubFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("runViaApi", () => {
  it("sends the input as text and returns the output", async () => {
    const calls = stubFetch([ok({ ok: true, output: "[2]", timeMs: 3, cached: false })]);
    const r = await runViaApi("%dw 2.0\n---\npayload", '{"a":1}', token);
    expect(r).toEqual({ kind: "ok", output: "[2]", timeMs: 3 });
    expect(JSON.parse(calls[0].init?.body as string).inputs).toEqual([{ name: "payload", value: '{"a":1}' }]);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("explains a user's error", async () => {
    stubFetch([ok({ ok: false, error: { kind: "COMPILE", message: "Unable to resolve reference of nope" }, timeMs: 1, cached: false })]);
    const r = await runViaApi("x", "{}", token);
    expect(r.kind).toBe("error");
    expect(r.kind === "error" && r.message).toContain("Hint:");
  });

  it("reports our outage as unavailable, not as the user's error", async () => {
    stubFetch([fail("COMPILER_UNAVAILABLE", 503, "busy")]);
    expect((await runViaApi("x", "{}", token)).kind).toBe("unavailable");
  });

  it("does not hang when Clerk never yields a token: runs anonymously", async () => {
    const calls = stubFetch([ok({ ok: true, output: "1", timeMs: 1, cached: false })]);
    const never = () => new Promise<string | null>(() => {});
    const r = await runViaApi("x", "{}", never);
    expect(r.kind).toBe("ok");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("reports an unreachable API as unavailable", async () => {
    stubFetch([new TypeError("Failed to fetch")]);
    expect((await runViaApi("x", "{}", token)).kind).toBe("unavailable");
  });
});

describe("submitViaApi", () => {
  const body = { problemId: "a".repeat(24), code: "x" };
  const graded = { status: "Accepted", summary: "ok", results: [], executionTime: "3ms", output: "", submissionId: "s1" };

  it("enqueues, polls, and returns the verdict", async () => {
    stubFetch([ok({ jobId: "j1" }, 202), ok({ state: "queued", position: 3 }), ok({ state: "active" }), ok({ state: "completed", result: graded })]);
    const progress: string[] = [];
    const r = await submitViaApi(body, token, (m) => progress.push(m), noSleep);
    expect(r).toEqual({ kind: "graded", result: graded });
    expect(progress[0]).toContain("3 ahead");
  });

  it("keeps polling through a transient poll failure", async () => {
    stubFetch([ok({ jobId: "j1" }, 202), new TypeError("Failed to fetch"), fail("INTERNAL", 500), ok({ state: "completed", result: graded })]);
    expect((await submitViaApi(body, token, () => {}, noSleep)).kind).toBe("graded");
  });

  it("maps a job that failed on our compiler to unavailable", async () => {
    stubFetch([ok({ jobId: "j1" }, 202), ok({ state: "failed", error: { code: "COMPILER_UNAVAILABLE", message: "not recorded" } })]);
    expect(await submitViaApi(body, token, () => {}, noSleep)).toEqual({ kind: "unavailable", message: "not recorded" });
  });

  it("maps a deterministic job failure to error", async () => {
    stubFetch([ok({ jobId: "j1" }, 202), ok({ state: "failed", error: { code: "NOT_FOUND", message: "Problem not found." } })]);
    expect(await submitViaApi(body, token, () => {}, noSleep)).toEqual({ kind: "error", message: "Problem not found." });
  });

  it("maps a full queue at enqueue time to unavailable", async () => {
    stubFetch([fail("COMPILER_UNAVAILABLE", 503, "queued to capacity")]);
    expect((await submitViaApi(body, token, () => {}, noSleep)).kind).toBe("unavailable");
  });

  it("maps a rate limit to a friendly error", async () => {
    stubFetch([fail("RATE_LIMITED", 429)]);
    const r = await submitViaApi(body, token, () => {}, noSleep);
    expect(r.kind).toBe("error");
  });
});
