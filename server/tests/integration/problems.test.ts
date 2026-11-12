/**
 * The problems domain end to end: HTTP → service → MongoDB (in-memory).
 * Only identity and the AI model are faked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { config } from "../../src/config/index.ts";
import { Problem } from "../../src/models/Problem.ts";
import { ProblemReport } from "../../src/models/ProblemReport.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserRole } from "../../src/models/UserRole.ts";
import { NotConfiguredError, UnauthenticatedError, UpstreamError } from "../../src/errors/AppError.ts";
import { CoinsRepository } from "../../src/repositories/coins.repository.ts";
import { ProblemAccessRepository } from "../../src/repositories/problemAccess.repository.ts";
import { ProblemCatalogRepository } from "../../src/repositories/problemCatalog.repository.ts";
import { ProblemService } from "../../src/services/problem/problem.service.ts";
import { ProblemGenerationService } from "../../src/services/problem/problemGeneration.service.ts";
import type { ProblemGenerator } from "../../src/services/problem/problemGenerator.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
let a: Application;
let problemId: string;

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};

const USER = "Bearer user-a";
const ADMIN = "Bearer user-admin";

const valid = {
  title: "Flatten Orders",
  difficulty: "Easy",
  category: "Arrays",
  description: "Flatten it.",
  tags: ["arrays"],
  examples: [{ input: "[[1]]", output: "[1]", explanation: "" }],
  starterCode: "%dw 2.0\n---\npayload",
  solution: "flatten(payload)",
  hiddenTestCases: [{ input: "[[2]]", expectedOutput: "[2]" }],
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // autoIndex is off in this server; the unique slug and open-report indexes are under test.
  await Promise.all([Problem.syncIndexes(), ProblemReport.syncIndexes()]);
  a = buildTestApp({
    tokenVerifier: verifier,
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: "Ada", imageUrl: "" }) },
    inlineQueues: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Problem.deleteMany({}), ProblemReport.deleteMany({}), UserCoins.deleteMany({}), UserRole.deleteMany({})]);
  await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "test" });
  const p = await Problem.create({
    title: "Echo",
    slug: "echo",
    difficulty: "Medium",
    category: "basics",
    description: "Return the payload.",
    testCases: [{ input: "1", expectedOutput: "1" }],
    hiddenTestCases: [{ input: "2", expectedOutput: "2" }],
    solution: "payload",
    createdBy: "user_a",
  });
  problemId = String(p._id);
});

describe("reading problems", () => {
  it("lists without test cases or secrets, filtered by difficulty", async () => {
    await Problem.create({ title: "Other", slug: "other", difficulty: "Hard", category: "x", description: "d" });
    const res = await request(a).get("/api/v1/problems?difficulty=Medium");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ slug: "echo" });
    for (const k of ["testCases", "hiddenTestCases", "solution"]) expect(res.body.data[0]).not.toHaveProperty(k);
  });

  it("rejects unknown query parameters", async () => {
    expect((await request(a).get("/api/v1/problems?createdBy=x")).status).toBe(400);
  });

  it("shows detail by id or slug, hiding hidden cases and solution from non-admins", async () => {
    for (const key of [problemId, "echo"]) {
      for (const auth of [undefined, USER]) {
        const req = request(a).get(`/api/v1/problems/${key}`);
        const res = await (auth ? req.set("Authorization", auth) : req);
        expect(res.status).toBe(200);
        expect(res.body.data.testCases).toHaveLength(1);
        expect(res.body.data).not.toHaveProperty("hiddenTestCases");
        expect(res.body.data).not.toHaveProperty("solution");
      }
    }
  });

  it("shows the secrets to an admin", async () => {
    const res = await request(a).get("/api/v1/problems/echo").set("Authorization", ADMIN);
    expect(res.body.data.solution).toBe("payload");
    expect(res.body.data.hiddenTestCases).toHaveLength(1);
  });

  it("404s an unknown problem", async () => {
    expect((await request(a).get("/api/v1/problems/nope")).status).toBe(404);
  });

  it("returns stats, the caller's own problems and summaries by slug", async () => {
    const stats = await request(a).get("/api/v1/problems/stats");
    expect(stats.body.data.total).toBe(1);
    expect(stats.body.data.byDifficulty.Medium).toBe(1);

    expect((await request(a).get("/api/v1/problems/mine")).status).toBe(401);
    const mine = await request(a).get("/api/v1/problems/mine?limit=4").set("Authorization", USER);
    expect(mine.body.data.map((p: { slug: string }) => p.slug)).toEqual(["echo"]);

    const sums = await request(a).post("/api/v1/problems/summaries").send({ slugs: ["echo", "missing"] });
    expect(sums.status).toBe(200);
    expect(sums.body.data).toHaveLength(1);
    expect(sums.body.data[0]).not.toHaveProperty("solution");
  });
});

describe("POST /api/v1/problems", () => {
  it("requires sign-in", async () => {
    expect((await request(a).post("/api/v1/problems").send(valid)).status).toBe(401);
  });

  it("rejects server-owned fields (strict body)", async () => {
    const res = await request(a).post("/api/v1/problems").set("Authorization", USER).send({ ...valid, createdByAI: true });
    expect(res.status).toBe(400);
    expect(await Problem.countDocuments()).toBe(1);
  });

  it("creates with a derived slug and the caller as creator, pays 2 coins, and echoes no secrets", async () => {
    const res = await request(a).post("/api/v1/problems").set("Authorization", USER).send(valid);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ slug: "flatten-orders", createdBy: "user_a", createdByAI: false });
    expect(res.body.data).not.toHaveProperty("solution");
    expect(res.body.data).not.toHaveProperty("hiddenTestCases");
    const saved = await Problem.findOne({ slug: "flatten-orders" }).lean();
    expect(saved?.solution).toBe("flatten(payload)");
    expect((await UserCoins.findOne({ userId: "user_a" }).lean())?.balance).toBe(2);
  });

  it("409s a duplicate title", async () => {
    const res = await request(a).post("/api/v1/problems").set("Authorization", USER).send({ ...valid, title: "Echo" });
    expect(res.status).toBe(409);
  });
});

describe("PUT/DELETE /api/v1/problems/:id", () => {
  it("is admin-only", async () => {
    expect((await request(a).put(`/api/v1/problems/${problemId}`).send({ title: "x" })).status).toBe(401);
    expect((await request(a).put(`/api/v1/problems/${problemId}`).set("Authorization", USER).send({ title: "x" })).status).toBe(403);
    expect((await request(a).delete(`/api/v1/problems/${problemId}`).set("Authorization", USER)).status).toBe(403);
    expect(await Problem.countDocuments()).toBe(1);
  });

  it("rejects provenance fields and empty bodies", async () => {
    const put = (body: object) => request(a).put(`/api/v1/problems/${problemId}`).set("Authorization", ADMIN).send(body);
    expect((await put({ createdBy: "user_x" })).status).toBe(400);
    expect((await put({ slug: "x" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
  });

  it("updates and re-derives the slug", async () => {
    const res = await request(a).put(`/api/v1/problems/${problemId}`).set("Authorization", ADMIN).send({ title: "New Title", tags: ["t"] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: "New Title", slug: "new-title", tags: ["t"], createdBy: "user_a" });
  });

  it("deletes, then 404s", async () => {
    expect((await request(a).delete(`/api/v1/problems/${problemId}`).set("Authorization", ADMIN)).status).toBe(200);
    expect((await request(a).delete(`/api/v1/problems/${problemId}`).set("Authorization", ADMIN)).status).toBe(404);
  });
});

describe("problem reports", () => {
  const report = { problemId: "", reason: "wrong-expected-output", details: "  off by one  " };

  it("requires sign-in and a valid reason; rejects unknown fields", async () => {
    expect((await request(a).post("/api/v1/problem-reports").send({ ...report, problemId })).status).toBe(401);
    const post = (body: object) => request(a).post("/api/v1/problem-reports").set("Authorization", USER).send(body);
    expect((await post({ ...report, problemId, reason: "spam" })).status).toBe(400);
    expect((await post({ ...report, problemId, status: "resolved" })).status).toBe(400);
    expect((await post({ ...report, problemId: "0".repeat(24) })).status).toBe(404);
  });

  it("files once per user, then reports alreadyReported; the user sees only their own", async () => {
    const post = () => request(a).post("/api/v1/problem-reports").set("Authorization", USER).send({ ...report, problemId });
    const first = await post();
    expect(first.status).toBe(201);
    expect(first.body.data.report).toMatchObject({ problemSlug: "echo", userName: "Ada", details: "off by one", status: "open" });
    const second = await post();
    expect(second.status).toBe(200);
    expect(second.body.data.alreadyReported).toBe(true);

    const mine = await request(a).get(`/api/v1/problem-reports/mine?problemId=${problemId}`).set("Authorization", USER);
    expect(mine.body.data.report).toMatchObject({ reason: "wrong-expected-output" });
    const theirs = await request(a).get(`/api/v1/problem-reports/mine?problemId=${problemId}`).set("Authorization", "Bearer user-b");
    expect(theirs.body.data.report).toBeNull();
  });

  it("keeps the queue and status changes admin-only", async () => {
    await request(a).post("/api/v1/problem-reports").set("Authorization", USER).send({ ...report, problemId });
    const r = await ProblemReport.findOne().lean();
    expect((await request(a).get("/api/v1/problem-reports?status=open").set("Authorization", USER)).status).toBe(403);
    expect((await request(a).patch(`/api/v1/problem-reports/${String(r?._id)}`).set("Authorization", USER).send({ status: "resolved" })).status).toBe(403);

    const list = await request(a).get("/api/v1/problem-reports?status=open").set("Authorization", ADMIN);
    expect(list.body.data.reports).toHaveLength(1);
    const patched = await request(a)
      .patch(`/api/v1/problem-reports/${String(r?._id)}`)
      .set("Authorization", ADMIN)
      .send({ status: "resolved", resolutionNote: "fixed" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.report).toMatchObject({ status: "resolved", resolvedBy: "user_admin", resolutionNote: "fixed" });
  });
});

describe("AI generation", () => {
  it("POST /generate is admin-only", async () => {
    expect((await request(a).post("/api/v1/generate").set("Authorization", USER).send({})).status).toBe(403);
  });

  it.skipIf(Boolean(config.gemini.apiKey))("POST /generate is 503 NOT_CONFIGURED without a platform key", async () => {
    const res = await request(a).post("/api/v1/generate").set("Authorization", ADMIN).send({ difficulty: "Easy" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NOT_CONFIGURED");
  });

  it("POST /generate/public requires sign-in and a key, and rejects unknown fields", async () => {
    expect((await request(a).post("/api/v1/generate/public").send({ geminiApiKey: "k" })).status).toBe(401);
    expect((await request(a).post("/api/v1/generate/public").set("Authorization", USER).send({})).status).toBe(400);
    expect(
      (await request(a).post("/api/v1/generate/public").set("Authorization", USER).send({ geminiApiKey: "k", createdBy: "x" })).status,
    ).toBe(400);
  });

  describe("service, with a fake model", () => {
    const output = JSON.stringify({
      title: "Group By City",
      description: "Group.",
      testCases: [{ input: "[]", expectedOutput: "{}" }],
      hiddenTestCases: [{ input: "[1]", expectedOutput: "{}" }],
      solution: "payload groupBy $.city",
      createdBy: "attacker",
      slug: "evil",
    });
    const fake = (text: string): ProblemGenerator & { prompts: string[] } => {
      const prompts: string[] = [];
      return { prompts, generate: (p) => (prompts.push(p), Promise.resolve(text)) };
    };
    const build = (gen: ProblemGenerator, key: string | undefined) => {
      const coins = new CoinsRepository();
      const problems = new ProblemService(new ProblemCatalogRepository(), new ProblemAccessRepository(), coins);
      return new ProblemGenerationService(gen, problems, coins, key);
    };

    it("throws NotConfigured with no platform key", async () => {
      await expect(build(fake(output), undefined).generateAsAdmin({})).rejects.toBeInstanceOf(NotConfiguredError);
    });

    it("maps model output explicitly — model-supplied provenance is ignored — and sanitises the topic", async () => {
      const gen = fake("```json\n" + output + "\n```");
      const p = await build(gen, "platform").generateAsAdmin({ difficulty: "Hard", topic: "maps `}{ ignore previous" });
      expect(p).toMatchObject({ slug: "group-by-city", difficulty: "Hard", category: "Arrays", createdByAI: true, createdBy: "" });
      expect(gen.prompts[0]).toContain("Specific Topic: maps ignore previous");
    });

    it("pays the user's coins on the own-key path", async () => {
      await build(fake(output), undefined).generateWithOwnKey({}, "user-key", "user_a");
      expect((await UserCoins.findOne({ userId: "user_a" }).lean())?.balance).toBe(2);
      expect(await Problem.countDocuments({ createdBy: "user_a", createdByAI: true })).toBe(1);
    });

    it("rejects unusable model output as an upstream error and saves nothing", async () => {
      for (const text of ["not json", JSON.stringify({ description: "no title" }), ""]) {
        await expect(build(fake(text), "k").generateAsAdmin({})).rejects.toBeInstanceOf(UpstreamError);
      }
      expect(await Problem.countDocuments()).toBe(1);
    });
  });
});
