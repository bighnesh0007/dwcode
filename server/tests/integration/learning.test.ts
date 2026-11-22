/**
 * Phase D learning paths end to end: onboarding, placement, roadmap progress
 * and quizzes, mock exams, spaced review and readiness. Real app + Mongoose
 * against an in-memory MongoDB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { DIFFICULTY_TIERS } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { LearnerState } from "../../src/models/LearnerState.ts";
import { Problem } from "../../src/models/Problem.ts";
import { Submission } from "../../src/models/Submission.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import { MemoryKeyValueStore } from "../../src/lib/store/memoryStore.ts";
import { CERT_QUESTIONS, PLACEMENT, ROADMAPS } from "../../src/services/learning/content.ts";
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

function app(): Application {
  return buildTestApp({
    tokenVerifier: verifier,
    store: new MemoryKeyValueStore(),
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: userId, imageUrl: "", primaryEmail: "" }) },
  });
}

const right = (qs: readonly { id: string; answer: number }[]) => Object.fromEntries(qs.map((q) => [q.id, q.answer]));
const wrong = (qs: readonly { id: string; answer: number }[]) => Object.fromEntries(qs.map((q) => [q.id, (q.answer + 1) % 4]));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Problem.deleteMany({}), Submission.deleteMany({}), LearnerState.deleteMany({})]);
});

describe("onboarding and placement", () => {
  it("needs onboarding until it is saved, then recommends a roadmap", async () => {
    const a = app();
    const before = await request(a).get("/api/v1/learning/me").set(as("user-a"));
    expect(before.body.data.needsOnboarding).toBe(true);

    const saved = await request(a).put("/api/v1/learning/onboarding").set(as("user-a"))
      .send({ role: "developer", level: "new", goal: "learn-dataweave", hours: "1-2" });
    expect(saved.status).toBe(200);
    expect(saved.body.data.needsOnboarding).toBe(false);
    expect(saved.body.data.roadmapId).toBe("beginner");

    const bad = await request(a).put("/api/v1/learning/onboarding").set(as("user-a"))
      .send({ role: "developer", level: "wizard", goal: "learn-dataweave", hours: "1-2" });
    expect(bad.status).toBe(400);
  });

  it("serves the placement quiz without answers and grades it on the server", async () => {
    const a = app();
    const quiz = await request(a).get("/api/v1/learning/placement");
    expect(quiz.body.data.questions).toHaveLength(PLACEMENT.length);
    expect(JSON.stringify(quiz.body.data)).not.toContain("explanation");
    expect(quiz.body.data.questions[0].answer).toBeUndefined();

    const anon = await request(a).post("/api/v1/learning/placement").send({ answers: wrong(PLACEMENT) });
    expect(anon.body.data.level).toBe("new");

    const all = await request(a).post("/api/v1/learning/placement").set(as("user-a")).send({ answers: right(PLACEMENT) });
    expect(all.body.data.level).toBe("expert");
    expect(all.body.data.correct).toBe(PLACEMENT.length);
    const me = await request(a).get("/api/v1/learning/me").set(as("user-a"));
    expect(me.body.data.placement.level).toBe("expert");
  });
});

describe("roadmaps", () => {
  const beginner = ROADMAPS.find((r) => r.id === "beginner");
  const first = beginner?.steps[0];

  it("tracks solves per step and completes it once the quiz is passed", async () => {
    if (!beginner || !first) throw new Error("content");
    const category = first.categories[0] ?? "";
    const p = await Problem.create({ title: "T", slug: "t-1", difficulty: EASY, category, description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
    await Submission.create({ problemId: p._id, problemSlug: "t-1", userId: "user_a", userName: "a", code: "x", status: "Accepted" });
    const a = app();

    const view = await request(a).get("/api/v1/learning/roadmaps/beginner").set(as("user-a"));
    const step = view.body.data.steps[0];
    expect(step.solved).toBe(Math.min(1, first.solveCount));
    expect(step.problems[0]).toMatchObject({ slug: "t-1", solved: true });
    expect(step.quiz[0].answer).toBeUndefined();
    expect(step.complete).toBe(false);
    expect(view.body.data.weekly[0]).toBe(first.id);

    const failed = await request(a).post(`/api/v1/learning/roadmaps/beginner/steps/${first.id}/quiz`).set(as("user-a")).send({ answers: wrong(first.quiz) });
    expect(failed.body.data.passed).toBe(false);
    const passed = await request(a).post(`/api/v1/learning/roadmaps/beginner/steps/${first.id}/quiz`).set(as("user-a")).send({ answers: right(first.quiz) });
    expect(passed.body.data.passed).toBe(true);

    const after = await request(a).get("/api/v1/learning/roadmaps/beginner").set(as("user-a"));
    expect(after.body.data.steps[0].complete).toBe(true);
    expect(after.body.data.weekly).not.toContain(first.id);
  });

  it("is public without progress, and 404s an unknown roadmap", async () => {
    const a = app();
    expect((await request(a).get("/api/v1/learning/roadmaps")).body.data.roadmaps).toHaveLength(ROADMAPS.length);
    expect((await request(a).get("/api/v1/learning/roadmaps/beginner")).body.data.completed).toBe(0);
    expect((await request(a).get("/api/v1/learning/roadmaps/nope")).status).toBe(404);
    expect((await request(a).post("/api/v1/learning/roadmaps/beginner/steps/b-first/quiz").send({ answers: {} })).status).toBe(401);
  });
});

describe("certification prep", () => {
  it("grades a mock from its seed, queues misses for review and moves readiness", async () => {
    const a = app();
    const mock = await request(a).post("/api/v1/certification/mock").set(as("user-a"));
    expect(mock.status).toBe(200);
    const ids: string[] = mock.body.data.questions.map((q: { id: string }) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mock.body.data.questions[0].answer).toBeUndefined();

    // Everything right except the first question.
    const bank = new Map(CERT_QUESTIONS.map((q) => [q.id, q]));
    const qs = ids.map((id) => bank.get(id)).filter((q) => q !== undefined);
    const answers = { ...right(qs), ...wrong(qs.slice(0, 1)) };
    const graded = await request(a).post("/api/v1/certification/mock/grade").set(as("user-a")).send({ seed: mock.body.data.seed, answers });
    expect(graded.body.data.score).toBe(Math.round(((ids.length - 1) / ids.length) * 100));
    expect(graded.body.data.results[0].correct).toBe(false);

    const review = await request(a).get("/api/v1/certification/review").set(as("user-a"));
    expect(review.body.data.due.map((q: { id: string }) => q.id)).toEqual([ids[0]]);

    const missed = bank.get(ids[0] ?? "");
    const answered = await request(a).post(`/api/v1/certification/review/${ids[0]}`).set(as("user-a")).send({ answer: missed?.answer });
    expect(answered.body.data).toMatchObject({ correct: true, graduated: false });
    expect((await request(a).get("/api/v1/certification/review").set(as("user-a"))).body.data.due).toHaveLength(0);

    const ready = await request(a).get("/api/v1/certification/readiness").set(as("user-a"));
    expect(ready.body.data.mocks).toHaveLength(1);
    expect(ready.body.data.openReview).toBe(1);
    expect(ready.body.data.readiness).toBe(Math.round(graded.body.data.score - 2));
  });

  it("outlines the exam publicly and refuses review answers for questions not in review", async () => {
    const a = app();
    const exam = await request(a).get("/api/v1/certification");
    expect(exam.body.data.bank).toBe(CERT_QUESTIONS.length);
    expect(exam.body.data.sections.every((s: { questions: number }) => s.questions > 0)).toBe(true);
    const q = CERT_QUESTIONS[0];
    expect((await request(a).post(`/api/v1/certification/review/${q?.id}`).set(as("user-a")).send({ answer: 0 })).status).toBe(400);
    expect((await request(a).post("/api/v1/certification/mock")).status).toBe(401);
  });
});
