/**
 * Submit through the queue, end to end: HTTP → queue → grading → MongoDB.
 * Real app, real Mongoose against an in-memory MongoDB; only the compiler and
 * identity are faked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Problem } from "../../src/models/Problem.ts";
import { Submission } from "../../src/models/Submission.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { COIN_RULES, coinRewardFor } from "@dwcode/shared";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import type { FetchLike, TokenVerifier } from "../../src/types/ports.ts";

const IDENTITY = "%dw 2.0\noutput application/json\n---\npayload";
const WRONG = "%dw 2.0\noutput application/json\n---\n[]";
const BROKEN = "%dw 2.0\noutput application/json\n---\npayload map (";

let mongo: MongoMemoryServer;
let problemId: string;
let compilerDown = false;

/** A fake compiler: echoes `payload` for IDENTITY, `[]` for WRONG, a compile error for BROKEN. */
const fakeCompiler: FetchLike = (_url, init) => {
  const json = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  if (compilerDown) return json(503, { ok: false, error: { kind: "OVERLOADED", message: "busy" } });
  const req = JSON.parse(init?.body as string) as { script: string; inputs: { value: string }[] };
  if (req.script === BROKEN) return json(200, { ok: false, error: { kind: "COMPILE", message: "Invalid input" } });
  const output = req.script === IDENTITY ? (req.inputs[0]?.value ?? "{}") : "[]";
  return json(200, { ok: true, output, mimeType: "application/json", timeMs: 1 });
};

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};

function app(): Application {
  return buildTestApp({
    fetchImpl: fakeCompiler,
    compiler: { url: "http://compiler.internal", authToken: "t".repeat(40), cacheTtlMs: 0 },
    tokenVerifier: verifier,
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: "Ada", imageUrl: "https://img" }) },
    inlineQueues: true,
  });
}

async function submitAndWait(a: Application, token: string, body: Record<string, unknown>) {
  const res = await request(a).post("/api/v1/submissions").set("Authorization", `Bearer ${token}`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  const jobId = res.body.data.jobId as string;
  for (let i = 0; i < 400; i++) {
    const poll = await request(a).get(`/api/v1/submissions/jobs/${jobId}`).set("Authorization", `Bearer ${token}`);
    if (poll.body.data?.state === "completed" || poll.body.data?.state === "failed") return { jobId, job: poll.body.data };
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("job did not finish");
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  compilerDown = false;
  await Promise.all([Problem.deleteMany({}), Submission.deleteMany({}), UserCoins.deleteMany({})]);
  const p = await Problem.create({
    title: "Echo",
    slug: "echo",
    difficulty: "Medium",
    category: "basics",
    description: "Return the payload.",
    testCases: [
      { input: '{"a":1}', expectedOutput: '{"a":1}' },
      { input: "[1,2]", expectedOutput: "[1, 2]" },
    ],
    // Deliberately wrong: proves hidden cases are not graded while the flag is off.
    hiddenTestCases: [{ input: "[3]", expectedOutput: "[999]" }],
  });
  problemId = String(p._id);
});

describe("POST /api/v1/submissions", () => {
  it("requires sign-in", async () => {
    const res = await request(app()).post("/api/v1/submissions").send({ problemId, code: IDENTITY });
    expect(res.status).toBe(401);
  });

  it("rejects a body carrying a verdict (audit C-4)", async () => {
    const res = await request(app())
      .post("/api/v1/submissions")
      .set("Authorization", "Bearer user-a")
      .send({ problemId, code: WRONG, status: "Accepted" });
    expect(res.status).toBe(400);
    expect(await Submission.countDocuments()).toBe(0);
  });

  it("grades on the server, records the verdict, and pays first-solve + difficulty coins once", async () => {
    const a = app();
    const { job } = await submitAndWait(a, "user-a", { problemId, code: IDENTITY });
    expect(job.result.status).toBe("Accepted");

    const saved = await Submission.findOne({ userId: "user_a" }).lean();
    expect(saved).toMatchObject({ status: "Accepted", problemSlug: "echo", userName: "Ada", userImageUrl: "https://img" });

    const bonus = coinRewardFor("Medium");
    expect((await UserCoins.findOne({ userId: "user_a" }).lean())?.balance).toBe(COIN_RULES.firstSolve + bonus);

    await submitAndWait(a, "user-a", { problemId, code: IDENTITY });
    expect((await UserCoins.findOne({ userId: "user_a" }).lean())?.balance).toBe(COIN_RULES.firstSolve + 2 * bonus);
  });

  it("records a wrong answer as Attempted and pays nothing", async () => {
    const { job } = await submitAndWait(app(), "user-a", { problemId, code: WRONG });
    expect(job.result.status).toBe("Attempted");
    expect((await Submission.findOne({ userId: "user_a" }).lean())?.status).toBe("Attempted");
    expect(await UserCoins.countDocuments()).toBe(0);
  });

  it("records the user's compile error as their Error verdict", async () => {
    const { job } = await submitAndWait(app(), "user-a", { problemId, code: BROKEN });
    expect(job.result.status).toBe("Error");
    expect(await Submission.countDocuments({ status: "Error" })).toBe(1);
  });

  it("records NOTHING when the compiler is unavailable — our outage is not the user's verdict", async () => {
    compilerDown = true;
    const { job } = await submitAndWait(app(), "user-a", { problemId, code: IDENTITY });
    expect(job.state).toBe("failed");
    expect(job.error.code).toBe("COMPILER_UNAVAILABLE");
    expect(await Submission.countDocuments()).toBe(0);
    expect(await UserCoins.countDocuments()).toBe(0);
  }, 30_000);

  it("reports 404 for an unknown problem without recording anything", async () => {
    const { job } = await submitAndWait(app(), "user-a", { problemId: "0".repeat(24), code: IDENTITY });
    expect(job.state).toBe("failed");
    expect(job.error.code).toBe("NOT_FOUND");
    expect(await Submission.countDocuments()).toBe(0);
  });
});

describe("GET /api/v1/submissions/jobs/:jobId", () => {
  it("hides another user's job behind a 404", async () => {
    const a = app();
    const { jobId } = await submitAndWait(a, "user-a", { problemId, code: IDENTITY });
    const res = await request(a).get(`/api/v1/submissions/jobs/${jobId}`).set("Authorization", "Bearer user-b");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/submissions", () => {
  it("lists only the caller's submissions, newest first", async () => {
    const a = app();
    await submitAndWait(a, "user-a", { problemId, code: WRONG });
    await submitAndWait(a, "user-a", { problemId, code: IDENTITY });
    await submitAndWait(a, "user-b", { problemId, code: IDENTITY });
    const res = await request(a).get("/api/v1/submissions").set("Authorization", "Bearer user-a");
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { status: string }) => s.status)).toEqual(["Accepted", "Attempted"]);
  });
});

describe("GET /api/v1/submissions/progress", () => {
  it("reports a slug as solved once any submission was accepted, attempted otherwise", async () => {
    const a = app();
    await submitAndWait(a, "user-a", { problemId, code: WRONG });
    await submitAndWait(a, "user-a", { problemId, code: IDENTITY });
    await submitAndWait(a, "user-b", { problemId, code: WRONG });
    const ra = await request(a).get("/api/v1/submissions/progress").set("Authorization", "Bearer user-a");
    expect(ra.body.data).toEqual({ solved: ["echo"], attempted: [] });
    const rb = await request(a).get("/api/v1/submissions/progress").set("Authorization", "Bearer user-b");
    expect(rb.body.data).toEqual({ solved: [], attempted: ["echo"] });
  });

  it("filters history by problem", async () => {
    const a = app();
    await submitAndWait(a, "user-a", { problemId, code: IDENTITY });
    const r = await request(a).get("/api/v1/submissions?problemSlug=nope").set("Authorization", "Bearer user-a");
    expect(r.body.data).toEqual([]);
  });
});

describe("GET /api/v1/submissions/stats", () => {
  it("counts totals, acceptances and today's activity for the caller only", async () => {
    const a = app();
    await submitAndWait(a, "user-a", { problemId, code: WRONG });
    await submitAndWait(a, "user-a", { problemId, code: IDENTITY });
    await submitAndWait(a, "user-b", { problemId, code: IDENTITY });
    const r = await request(a).get("/api/v1/submissions/stats").set("Authorization", "Bearer user-a");
    const today = new Date().toISOString().slice(0, 10);
    expect(r.body.data).toMatchObject({ total: 2, accepted: 1, solved: ["echo"], attempted: [] });
    expect(r.body.data.daily[today]).toBe(2);
  });
});
