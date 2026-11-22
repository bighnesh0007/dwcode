/**
 * Phase E contributions end to end: a problem draft is checked on the
 * (fake) compiler, submitted, approved and published with the compiler's
 * outputs as its expectations; questions join the certification bank;
 * applications raise the open limit. Real app + in-memory MongoDB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { CONTRIBUTION_REWARD, DIFFICULTY_TIERS, OPEN_LIMIT } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Contribution } from "../../src/models/Contribution.ts";
import { Notification } from "../../src/models/Notification.ts";
import { Problem } from "../../src/models/Problem.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserRole } from "../../src/models/UserRole.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import type { FetchLike, TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
const EASY = DIFFICULTY_TIERS[0]?.id ?? "";
const UPPER = "%dw 2.0\noutput application/json\n---\npayload map upper($)";
const BROKEN = "%dw 2.0\n---\nnot dataweave (";
let compilerCalls = 0;

/** Fake compiler: upper-cases every string in a JSON array input; BROKEN fails to compile. */
const fakeCompiler: FetchLike = (_url, init) => {
  compilerCalls++;
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  const req = JSON.parse(init?.body as string) as { script: string; inputs: { value: string }[] };
  if (req.script === BROKEN) return json({ ok: false, error: { kind: "COMPILE", message: "Unexpected end of input" } });
  const input = JSON.parse(req.inputs[0]?.value ?? "[]") as string[];
  return json({ ok: true, output: JSON.stringify(input.map((s) => s.toUpperCase())), mimeType: "application/json", timeMs: 1 });
};

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

function app(): Application {
  return buildTestApp({
    fetchImpl: fakeCompiler,
    compiler: { url: "http://compiler.internal", authToken: "t".repeat(40), cacheTtlMs: 0 },
    tokenVerifier: verifier,
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: userId, imageUrl: "" }) },
  });
}

const draft = (over: Record<string, unknown> = {}) => ({
  title: "Shout every word",
  difficulty: EASY,
  category: "Strings",
  description: "Return every string in the input array in upper case.",
  solution: UPPER,
  cases: [
    { input: '["a","b"]', hidden: false },
    { input: '["mule"]', hidden: true },
  ],
  ...over,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  compilerCalls = 0;
  await Promise.all([Contribution.deleteMany({}), Problem.deleteMany({}), UserCoins.deleteMany({}), UserRole.deleteMany({}), Notification.deleteMany({})]);
  await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "test" });
});

describe("problem drafts", () => {
  it("are checked on the compiler, submitted, approved and published with generated outputs", async () => {
    const a = app();
    const created = await request(a).post("/api/v1/contributions").set(as("user-a")).send({ kind: "problem", payload: draft() });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    // Not checked yet: cannot submit.
    expect((await request(a).post(`/api/v1/contributions/${id}/submit`).set(as("user-a"))).status).toBe(400);

    const checked = await request(a).post(`/api/v1/contributions/${id}/check`).set(as("user-a"));
    expect(checked.status).toBe(200);
    expect(checked.body.data.check.ok).toBe(true);
    expect(checked.body.data.check.cases.map((c: { output: string }) => JSON.parse(c.output))).toEqual([["A", "B"], ["MULE"]]);

    expect((await request(a).post(`/api/v1/contributions/${id}/submit`).set(as("user-a"))).body.data.status).toBe("submitted");

    // Only admins see the queue; nobody approves their own work.
    expect((await request(a).get("/api/v1/admin/contributions").set(as("user-a"))).status).toBe(403);
    const queue = await request(a).get("/api/v1/admin/contributions?kind=problem").set(as("user-admin"));
    expect(queue.body.data.items.map((i: { id: string }) => i.id)).toEqual([id]);

    const calls = compilerCalls;
    const approved = await request(a).post(`/api/v1/admin/contributions/${id}/approve`).set(as("user-admin")).send({ note: "Nice one" });
    expect(approved.status).toBe(200);
    expect(compilerCalls).toBe(calls + 2); // re-checked on approval
    expect(approved.body.data.publishedRef).toBe("shout-every-word");

    const problem = await Problem.findOne({ slug: "shout-every-word" }).lean();
    expect(problem?.createdBy).toBe("user_a");
    expect(problem?.testCases.map((t) => t.expectedOutput)).toEqual([JSON.stringify(["A", "B"])]);
    expect(problem?.hiddenTestCases.map((t) => t.expectedOutput)).toEqual([JSON.stringify(["MULE"])]);

    const coins = await UserCoins.findOne({ userId: "user_a" }).lean();
    expect(coins?.balance).toBe(CONTRIBUTION_REWARD.problem);
    expect(await Notification.countDocuments({ userId: "user_a", kind: "contribution" })).toBe(1);

    // Already reviewed.
    expect((await request(a).post(`/api/v1/admin/contributions/${id}/approve`).set(as("user-admin")).send({})).status).toBe(404);
  });

  it("invalidates the check when the solution changes, and fails it on a compile error", async () => {
    const a = app();
    const id = (await request(a).post("/api/v1/contributions").set(as("user-a")).send({ kind: "problem", payload: draft() })).body.data.id as string;
    await request(a).post(`/api/v1/contributions/${id}/check`).set(as("user-a"));

    const edited = await request(a).put(`/api/v1/contributions/${id}`).set(as("user-a")).send({ payload: draft({ solution: BROKEN }) });
    expect(edited.body.data.check).toBeNull();
    const failed = await request(a).post(`/api/v1/contributions/${id}/check`).set(as("user-a"));
    expect(failed.body.data.check.ok).toBe(false);
    expect(failed.body.data.check.cases[0].error).toContain("Unexpected");
    expect((await request(a).post(`/api/v1/contributions/${id}/submit`).set(as("user-a"))).status).toBe(400);
  });

  it("refuses hand-written expectations and drafts with no visible case", async () => {
    const a = app();
    const withExpected = draft({ cases: [{ input: "[]", hidden: false, expectedOutput: "[]" }, { input: '["x"]', hidden: false }] });
    expect((await request(a).post("/api/v1/contributions").set(as("user-a")).send({ kind: "problem", payload: withExpected })).status).toBe(400);
    const allHidden = draft({ cases: [{ input: "[]", hidden: true }, { input: '["x"]', hidden: true }] });
    expect((await request(a).post("/api/v1/contributions").set(as("user-a")).send({ kind: "problem", payload: allHidden })).status).toBe(400);
  });

  it("keeps other people's drafts private and rejections need a note", async () => {
    const a = app();
    const id = (await request(a).post("/api/v1/contributions").set(as("user-a")).send({ kind: "problem", payload: draft() })).body.data.id as string;
    expect((await request(a).get(`/api/v1/contributions/${id}`).set(as("user-b"))).status).toBe(404);
    await request(a).post(`/api/v1/contributions/${id}/check`).set(as("user-a"));
    await request(a).post(`/api/v1/contributions/${id}/submit`).set(as("user-a"));
    expect((await request(a).post(`/api/v1/admin/contributions/${id}/reject`).set(as("user-admin")).send({ note: "" })).status).toBe(400);
    const rejected = await request(a).post(`/api/v1/admin/contributions/${id}/reject`).set(as("user-admin")).send({ note: "Add an edge case." });
    expect(rejected.body.data).toMatchObject({ status: "rejected", reviewNote: "Add an edge case." });
    // A rejected draft can be edited again.
    expect((await request(a).put(`/api/v1/contributions/${id}`).set(as("user-a")).send({ payload: draft({ hints: ["Use upper"] }) })).body.data.status).toBe("draft");
  });
});

describe("questions and applications", () => {
  it("adds an approved question to the certification bank", async () => {
    const a = app();
    const before = (await request(a).get("/api/v1/certification")).body.data.bank as number;
    const q = { section: "dataweave", prompt: "What does `sizeOf([1, 2, 3])` return?", options: ["3", "2", "6"], answer: 0, explanation: "sizeOf counts the elements." };
    const id = (await request(a).post("/api/v1/contributions").set(as("user-a")).send({ kind: "question", payload: q })).body.data.id as string;
    await request(a).post(`/api/v1/contributions/${id}/submit`).set(as("user-a"));
    await request(a).post(`/api/v1/admin/contributions/${id}/approve`).set(as("user-admin")).send({});
    // A fresh app has an empty bank cache.
    const after = await request(app()).get("/api/v1/certification");
    expect(after.body.data.bank).toBe(before + 1);
    expect(after.body.data.community).toBe(1);
  });

  it("an approved application makes a contributor with a higher open limit", async () => {
    const a = app();
    const id = (await request(a).post("/api/v1/contributions").set(as("user-a"))
      .send({ kind: "application", payload: { experience: "Three years of MuleSoft integrations at work." } })).body.data.id as string;
    expect((await request(a).post("/api/v1/contributions").set(as("user-a"))
      .send({ kind: "application", payload: { experience: "Applying a second time, which is refused." } })).status).toBe(409);
    await request(a).post(`/api/v1/contributions/${id}/submit`).set(as("user-a"));
    await request(a).post(`/api/v1/admin/contributions/${id}/approve`).set(as("user-admin")).send({});
    const mine = await request(a).get("/api/v1/contributions").set(as("user-a"));
    expect(mine.body.data).toMatchObject({ contributor: true, limit: OPEN_LIMIT.contributor });
  });
});
