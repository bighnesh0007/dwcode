/**
 * Users domain end to end: profiles, follows, coins, store, leaderboard,
 * guest-progress. Real app + Mongoose against an in-memory MongoDB; only
 * identity is faked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { DIFFICULTY_TIERS, scoreWeightFor } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Problem } from "../../src/models/Problem.ts";
import { Submission } from "../../src/models/Submission.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserProfile } from "../../src/models/UserProfile.ts";
import { StorePurchase } from "../../src/models/StorePurchase.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import { THEME_SKINS } from "../../src/services/users/storeCatalog.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};

function app(): Application {
  return buildTestApp({
    tokenVerifier: verifier,
    identityProvider: {
      getUser: (userId) =>
        Promise.resolve({ userId, displayName: "Ada", imageUrl: "https://img", primaryEmail: `ada.${userId}@example.com` }),
    },
  });
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([UserProfile.init(), StorePurchase.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    Problem.deleteMany({}),
    Submission.deleteMany({}),
    UserCoins.deleteMany({}),
    UserProfile.deleteMany({}),
    StorePurchase.deleteMany({}),
  ]);
});

async function problem(slug: string, difficulty: string) {
  return Problem.create({
    title: slug,
    slug,
    difficulty,
    category: "basics",
    description: "d",
    testCases: [{ input: "{}", expectedOutput: "{}" }],
  });
}

async function submit(userId: string, slug: string, status: string, userName = "Ada") {
  const p = await Problem.findOne({ slug });
  return Submission.create({ problemId: p!._id, problemSlug: slug, userId, userName, code: "x", status });
}

describe("auth", () => {
  it.each([
    ["get", "/api/v1/profile"],
    ["get", "/api/v1/coins"],
    ["post", "/api/v1/profile/setup"],
    ["put", "/api/v1/profile/username"],
    ["post", "/api/v1/profile/follow"],
    ["post", "/api/v1/store"],
  ] as const)("%s %s requires sign-in", async (method, path) => {
    const res = await request(app())[method](path).send({});
    expect(res.status).toBe(401);
  });

  it("store catalogue and leaderboard are public", async () => {
    const a = app();
    const store = await request(a).get("/api/v1/store");
    expect(store.status).toBe(200);
    expect(store.body.data).toMatchObject({ signedIn: false, balance: 0, owned: ["default"] });
    expect((await request(a).get("/api/v1/leaderboard")).status).toBe(200);
  });
});

describe("profile setup and username", () => {
  it("creates a profile from the email local part, uniquely, and is idempotent", async () => {
    await UserProfile.create({ userId: "user_x", username: "ada.user_a" });
    const a = app();
    const first = await request(a).post("/api/v1/profile/setup").set(as("user-a"));
    expect(first.status).toBe(200);
    expect(first.body.data.profile.username).toBe("ada.user_a1");
    const again = await request(a).post("/api/v1/profile/setup").set(as("user-a"));
    expect(again.body.data.message).toBe("Profile already exists");
    expect(await UserProfile.countDocuments({ userId: "user_a" })).toBe(1);
  });

  it.each(["ab", "a".repeat(21), "bad name", "bad-name", "ünï"])("rejects invalid username %j", async (username) => {
    const res = await request(app()).put("/api/v1/profile/username").set(as("user-a")).send({ username });
    expect(res.status).toBe(400);
  });

  it("rejects unknown body fields (strict)", async () => {
    const res = await request(app())
      .put("/api/v1/profile/username")
      .set(as("user-a"))
      .send({ username: "ada_1", userId: "user_b" });
    expect(res.status).toBe(400);
  });

  it("enforces case-insensitive uniqueness and lets a user keep their own name", async () => {
    await UserProfile.create({ userId: "user_b", username: "Taken" });
    const a = app();
    const clash = await request(a).put("/api/v1/profile/username").set(as("user-a")).send({ username: "taken" });
    expect(clash.status).toBe(409);
    const own = await request(a).put("/api/v1/profile/username").set(as("user-b")).send({ username: "taken", bio: "hi" });
    expect(own.status).toBe(200);
    expect(own.body.data.profile).toEqual({ username: "taken", bio: "hi", followers: 0, following: 0 });
  });

  it("upserts a profile when none exists", async () => {
    const res = await request(app()).put("/api/v1/profile/username").set(as("user-a")).send({ username: "ada_1" });
    expect(res.status).toBe(200);
    expect((await UserProfile.findOne({ userId: "user_a" }).lean())?.username).toBe("ada_1");
  });
});

describe("follow / unfollow", () => {
  beforeEach(async () => {
    await UserProfile.create([
      { userId: "user_a", username: "alice" },
      { userId: "user_b", username: "bob" },
    ]);
  });

  it("toggles both sides of the edge", async () => {
    const a = app();
    const f = await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "bob" });
    expect(f.body.data).toEqual({ message: "Followed successfully", following: true });
    expect((await UserProfile.findOne({ userId: "user_b" }).lean())?.followers).toEqual(["user_a"]);
    expect((await UserProfile.findOne({ userId: "user_a" }).lean())?.following).toEqual(["user_b"]);

    const u = await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "bob" });
    expect(u.body.data.following).toBe(false);
    expect((await UserProfile.findOne({ userId: "user_b" }).lean())?.followers).toEqual([]);
  });

  it("refuses self-follow, unknown targets and a missing own profile", async () => {
    const a = app();
    expect((await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "alice" })).status).toBe(400);
    expect((await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "nobody" })).status).toBe(404);
    expect((await request(a).post("/api/v1/profile/follow").set(as("user-c")).send({ targetUsername: "bob" })).status).toBe(404);
    expect((await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({})).status).toBe(400);
  });
});

describe("public profile privacy", () => {
  it("returns public fields only and computes viewer state server-side", async () => {
    await UserProfile.create([
      { userId: "user_a", username: "alice", bio: "hello", followers: ["user_b"] },
      { userId: "user_b", username: "bob", following: ["user_a"] },
    ]);
    await problem("p1", "Hard");
    await submit("user_a", "p1", "Accepted");

    const a = app();
    const res = await request(a).get("/api/v1/profile/u/ALICE").set(as("user-b"));
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("user_a");
    expect(body).not.toContain("user_b");
    expect(body).not.toContain("@example.com");
    expect(res.body.data).toMatchObject({
      username: "alice",
      bio: "hello",
      followers: 1,
      following: 0,
      isFollowing: true,
      isOwnProfile: false,
      score: scoreWeightFor("Hard"),
      solved: { total: 1, byDifficulty: { Hard: 1 } },
    });
    expect(Object.keys(res.body.data.recentLog[0]).sort()).toEqual(["createdAt", "executionTime", "problemSlug", "status"]);

    expect((await request(a).get("/api/v1/profile/u/alice").set(as("user-a"))).body.data.isOwnProfile).toBe(true);
    expect((await request(a).get("/api/v1/profile/u/alice")).body.data.isFollowing).toBe(false);
    expect((await request(a).get("/api/v1/profile/u/a.*")).status).toBe(404);
  });

  it("dashboard is the caller's own data", async () => {
    await UserProfile.create({ userId: "user_a", username: "alice", followers: ["user_b"] });
    await problem("p1", "Easy");
    await submit("user_a", "p1", "Attempted");
    await submit("user_a", "p1", "Accepted");
    await submit("user_b", "p1", "Accepted");
    const res = await request(app()).get("/api/v1/profile").set(as("user-a"));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      username: "alice",
      followers: 1,
      submissions: { total: 2, accepted: 1, acceptanceRate: 50 },
      solved: { total: 1, easy: 1 },
      attempted: 0,
      githubConnected: false,
      streak: 1,
    });
    expect(res.body.data.activityData).toHaveLength(30);
  });
});

describe("coins", () => {
  it("returns balance and the newest 20 transactions", async () => {
    await UserCoins.create({
      userId: "user_a",
      balance: 42,
      transactions: Array.from({ length: 25 }, (_, i) => ({ type: "t", amount: i })),
    });
    const res = await request(app()).get("/api/v1/coins").set(as("user-a"));
    expect(res.body.data.balance).toBe(42);
    expect(res.body.data.transactions).toHaveLength(20);
    expect((await request(app()).get("/api/v1/coins").set(as("user-z"))).body.data).toEqual({ balance: 0, transactions: [] });
  });
});

describe("store", () => {
  const paid = THEME_SKINS.find((s) => s.cost > 0)!;

  it("debits, records ownership, and is idempotent", async () => {
    await UserCoins.create({ userId: "user_a", balance: paid.cost + 5 });
    const a = app();
    const buy = await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: paid.id });
    expect(buy.status).toBe(200);
    expect(buy.body.data).toEqual({ success: true, itemId: paid.id, balance: 5 });
    const again = await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: paid.id });
    expect(again.body.data).toMatchObject({ alreadyOwned: true, balance: 5 });
    const cat = await request(a).get("/api/v1/store").set(as("user-a"));
    expect(cat.body.data.owned).toEqual(["default", paid.id]);
  });

  it("402 when short, with price and balance; nothing charged", async () => {
    await UserCoins.create({ userId: "user_a", balance: paid.cost - 1 });
    const res = await request(app()).post("/api/v1/store").set(as("user-a")).send({ itemId: paid.id });
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ required: paid.cost, balance: paid.cost - 1 });
    expect(await StorePurchase.countDocuments()).toBe(0);
  });

  it("rejects unknown and free items, and a client-sent price", async () => {
    const a = app();
    expect((await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: "nope" })).status).toBe(404);
    expect((await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: "default" })).status).toBe(400);
    expect((await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: paid.id, cost: 0 })).status).toBe(400);
  });

  it("concurrent purchases of different items cannot overspend", async () => {
    const items = THEME_SKINS.filter((s) => s.cost > 0);
    const cheapest = Math.min(...items.map((s) => s.cost));
    // Enough for exactly one of anything, not two of anything.
    await UserCoins.create({ userId: "user_a", balance: cheapest * 2 - 1 });
    const a = app();
    const results = await Promise.all(
      items.map((s) => request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: s.id })),
    );
    const wins = results.filter((r) => r.status === 200);
    const spent = (await StorePurchase.find({ userId: "user_a" }).lean()).reduce((n, p) => n + p.cost, 0);
    const balance = (await UserCoins.findOne({ userId: "user_a" }).lean())!.balance;
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(spent + balance).toBe(cheapest * 2 - 1);
    expect(wins.length).toBeLessThanOrEqual(1);
  });

  it("concurrent purchases of the same item charge once", async () => {
    await UserCoins.create({ userId: "user_a", balance: paid.cost * 5 });
    const a = app();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: paid.id })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await StorePurchase.countDocuments({ userId: "user_a" })).toBe(1);
    expect((await UserCoins.findOne({ userId: "user_a" }).lean())!.balance).toBe(paid.cost * 4);
  });
});

describe("leaderboard", () => {
  beforeEach(async () => {
    for (const tier of DIFFICULTY_TIERS) await problem(`p-${tier.id}`, tier.id);
  });

  it("scores with the shared weights, ranks canonically, and keeps rank under other sorts", async () => {
    const hardest = DIFFICULTY_TIERS.reduce((m, t) => (t.scoreWeight > m.scoreWeight ? t : m));
    const easiest = DIFFICULTY_TIERS.reduce((m, t) => (t.scoreWeight < m.scoreWeight ? t : m));
    // a: one hardest solve. b: two easiest solves + a failure. c: only failures.
    await submit("user_a", `p-${hardest.id}`, "Accepted", "Migrated");
    await submit("user_a", `p-${hardest.id}`, "Accepted", "Alice");
    await submit("user_b", `p-${easiest.id}`, "Accepted");
    await submit("user_b", `p-${DIFFICULTY_TIERS[1]!.id}`, "Error");
    await submit("user_c", `p-${easiest.id}`, "Attempted");
    await UserProfile.create({ userId: "user_a", username: "alice" });

    const a = app();
    const res = await request(a).get("/api/v1/leaderboard").set(as("user-b"));
    const rows = res.body.data.leaderboard as { userId: string; score: number; rank: number; userName: string; username: string | null; acceptanceRate: number }[];
    expect(rows.map((r) => r.userId)).toEqual(["user_a", "user_b", "user_c"]);
    expect(rows[0]).toMatchObject({ score: hardest.scoreWeight, rank: 1, userName: "Alice", username: "alice", acceptanceRate: 100 });
    expect(rows[1]).toMatchObject({ score: easiest.scoreWeight, rank: 2, username: null, acceptanceRate: 50 });
    expect(res.body.data.me).toMatchObject({ userId: "user_b", rank: 2 });
    expect(res.body.data.meta.totalProblems).toBe(DIFFICULTY_TIERS.length);

    const bySolved = await request(a).get("/api/v1/leaderboard?sort=acceptance&limit=5");
    expect(bySolved.body.data.leaderboard.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3]);
    expect(bySolved.body.data.me).toBeNull();
  });

  it("paginates and clamps bad query values", async () => {
    for (let i = 0; i < 7; i++) await submit(`user_${i}`, `p-${DIFFICULTY_TIERS[0]!.id}`, "Accepted");
    const res = await request(app()).get("/api/v1/leaderboard?limit=1&page=99&sort=bogus");
    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toEqual({ page: 2, limit: 5, totalUsers: 7, totalPages: 2, sort: "score" });
    expect(res.body.data.leaderboard).toHaveLength(2);
  });
});

describe("guest-progress", () => {
  it("is disabled: 503 NOT_CONFIGURED and writes nothing", async () => {
    await problem("p1", "Easy");
    const res = await request(app()).post("/api/v1/guest-progress").set(as("user-a")).send({ slugs: ["p1"] });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NOT_CONFIGURED");
    expect(await Submission.countDocuments()).toBe(0);
  });
});
