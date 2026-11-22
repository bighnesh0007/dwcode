/**
 * Phase B practice modes end to end: interview mode, code-size ranking and the
 * explain endpoint's guards. Real app + Mongoose against an in-memory MongoDB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { DIFFICULTY_TIERS, INTERVIEW_PRESETS, codeSize } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Problem } from "../../src/models/Problem.ts";
import { Submission } from "../../src/models/Submission.ts";
import { UserProfile } from "../../src/models/UserProfile.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import { MemoryKeyValueStore } from "../../src/lib/store/memoryStore.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
const EASY = DIFFICULTY_TIERS[0]?.id ?? "";

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

function app(store = new MemoryKeyValueStore()): Application {
  return buildTestApp({
    tokenVerifier: verifier,
    store,
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: userId, imageUrl: "", primaryEmail: "" }) },
  });
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
  await Promise.all([Problem.deleteMany({}), Submission.deleteMany({}), UserProfile.deleteMany({})]);
});

async function seed(count: number, category = "basics") {
  for (let i = 0; i < count; i++) {
    await Problem.create({ title: `P${i}`, slug: `${category}-${i}`, difficulty: EASY, category, description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
  }
}

async function accept(userId: string, slug: string, code = "x", at = new Date()) {
  const p = await Problem.findOne({ slug }).orFail();
  return Submission.create({ problemId: p._id, problemSlug: slug, userId, userName: userId, code, status: "Accepted", createdAt: at });
}

describe("interview mode", () => {
  const quick = INTERVIEW_PRESETS[0];

  it("picks distinct problems, never debugging ones, and scores only submissions inside the window", async () => {
    await seed(4);
    await seed(3, "Debugging");
    const a = app();

    const started = await request(a).post("/api/v1/interview/start").set(as("user-a")).send({ preset: quick.id });
    expect(started.status).toBe(200);
    const slugs: string[] = started.body.data.problems.map((p: { slug: string }) => p.slug);
    expect(new Set(slugs).size).toBe(quick.problems);
    expect(slugs.every((s) => !s.startsWith("Debugging"))).toBe(true);
    expect(started.body.data.verdict).toBeNull();

    // A solve from before the interview does not count; one during it does.
    await accept("user_a", slugs[0] ?? "", "x", new Date(Date.now() - 60 * 60_000));
    await accept("user_a", slugs[1] ?? "");
    const current = await request(a).get("/api/v1/interview/current").set(as("user-a"));
    expect(current.body.data.interview.outcomes[slugs[0] ?? ""].status).toBe("untouched");
    expect(current.body.data.interview.outcomes[slugs[1] ?? ""].status).toBe("solved");

    const finished = await request(a).post("/api/v1/interview/finish").set(as("user-a"));
    expect(finished.body.data).toMatchObject({ solved: 1 });
    expect(typeof finished.body.data.verdict).toBe("string");
  });

  it("refuses a second interview while one is running, and an unknown preset", async () => {
    await seed(4);
    const a = app();
    await request(a).post("/api/v1/interview/start").set(as("user-a")).send({ preset: quick.id });
    expect((await request(a).post("/api/v1/interview/start").set(as("user-a")).send({ preset: quick.id })).status).toBe(400);
    expect((await request(a).post("/api/v1/interview/start").set(as("user-b")).send({ preset: "nope" })).status).toBe(400);
  });

  it("needs a session, and has no interview for a new user", async () => {
    const a = app();
    expect((await request(a).get("/api/v1/interview/current")).status).toBe(401);
    expect((await request(a).get("/api/v1/interview/current").set(as("user-z"))).body.data.interview).toBeNull();
  });
});

describe("code-size ranking", () => {
  it("ranks each solver's smallest solution, with usernames and the caller's place", async () => {
    await seed(1);
    await UserProfile.create({ userId: "user_a", username: "ada" });
    await UserProfile.create({ userId: "user_b", username: "bob" });
    const long = "%dw 2.0\noutput application/json\n---\npayload map ((item) -> item)";
    const short = "%dw 2.0\noutput application/json\n---\npayload";
    await accept("user_a", "basics-0", long);
    await accept("user_b", "basics-0", short);
    await accept("user_a", "basics-0", `${short}\n// same as bob`);

    const res = await request(app()).get("/api/v1/code-size/basics-0").set(as("user-a"));
    expect(res.status).toBe(200);
    expect(res.body.data.solvers).toBe(2);
    expect(res.body.data.top[0]).toMatchObject({ rank: 1, username: "bob", size: codeSize(short) });
    expect(res.body.data.mine).toMatchObject({ rank: 2, size: codeSize(short) });
  });
});

describe("explain my error", () => {
  it("needs a session, and says so when no AI key is configured", async () => {
    const a = app();
    expect((await request(a).post("/api/v1/explain").send({ code: "x", error: "y" })).status).toBe(401);
    const res = await request(a).post("/api/v1/explain").set(as("user-a")).send({ code: "x", error: "y" });
    expect([200, 503]).toContain(res.status);
    if (res.status === 503) expect(res.body.error.code).toBe("NOT_CONFIGURED");
  });
});
