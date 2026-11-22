/**
 * Phase A engagement end to end: daily challenge, progress, streak freezes,
 * notifications and the announcement banner. Real app + Mongoose against an
 * in-memory MongoDB; only identity is faked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { DIFFICULTY_TIERS, STREAK_FREEZES, dailySlugFor, utcDay } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { AppSetting } from "../../src/models/AppSetting.ts";
import { Blog } from "../../src/models/Blog.ts";
import { Comment } from "../../src/models/Comment.ts";
import { Notification } from "../../src/models/Notification.ts";
import { Problem } from "../../src/models/Problem.ts";
import { StorePurchase } from "../../src/models/StorePurchase.ts";
import { Submission } from "../../src/models/Submission.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserProfile } from "../../src/models/UserProfile.ts";
import { UserRole } from "../../src/models/UserRole.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
const EASY = DIFFICULTY_TIERS[0]?.id ?? "";

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
      getUser: (userId) => Promise.resolve({ userId, displayName: `Name ${userId}`, imageUrl: "", primaryEmail: `${userId}@example.com` }),
    },
  });
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([UserProfile.init(), StorePurchase.init(), AppSetting.init()]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    Problem.deleteMany({}), Submission.deleteMany({}), UserCoins.deleteMany({}), UserProfile.deleteMany({}),
    StorePurchase.deleteMany({}), Notification.deleteMany({}), AppSetting.deleteMany({}), UserRole.deleteMany({}),
    Blog.deleteMany({}), Comment.deleteMany({}),
  ]);
});

async function seedProblems(slugs: string[]) {
  for (const slug of slugs) {
    await Problem.create({ title: slug, slug, difficulty: EASY, category: "basics", description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
  }
}

describe("daily challenge", () => {
  it("serves today's deterministic pick to everyone, and `solved` to a signed-in user", async () => {
    const slugs = ["p-one", "p-two", "p-three"];
    await seedProblems(slugs);
    const a = app();
    const daily = dailySlugFor(utcDay(new Date()), slugs) ?? "";

    const anon = await request(a).get("/api/v1/daily");
    expect(anon.status).toBe(200);
    expect(anon.body.data.problem.slug).toBe(daily);
    expect(anon.body.data).not.toHaveProperty("solved");

    const before = await request(a).get("/api/v1/daily").set(as("user-a"));
    expect(before.body.data.solved).toBe(false);

    const p = await Problem.findOne({ slug: daily }).orFail();
    await Submission.create({ problemId: p._id, problemSlug: daily, userId: "user_a", userName: "A", code: "x", status: "Accepted" });
    const after = await request(a).get("/api/v1/daily").set(as("user-a"));
    expect(after.body.data.solved).toBe(true);
  });
});

describe("progress", () => {
  it("needs a session", async () => {
    expect((await request(app()).get("/api/v1/engagement/me")).status).toBe(401);
  });

  it("reports streak, freezes and achievements from submissions and store purchases", async () => {
    await seedProblems(["p-one"]);
    const p = await Problem.findOne({ slug: "p-one" }).orFail();
    await Submission.create({ problemId: p._id, problemSlug: "p-one", userId: "user_a", userName: "A", code: "x", status: "Accepted" });
    const a = app();

    const res = await request(a).get("/api/v1/engagement/me").set(as("user-a"));
    expect(res.status).toBe(200);
    expect(res.body.data.streak.current).toBe(1);
    expect(res.body.data.freezesOwned).toBe(0);
    expect(res.body.data.achievements.find((x: { id: string }) => x.id === "first-solve").earned).toBe(true);
  });

  it("sells a streak freeze through the store, priced by the server", async () => {
    const freeze = STREAK_FREEZES[0];
    if (!freeze) throw new Error("no freeze item");
    await UserCoins.create({ userId: "user_a", balance: freeze.cost + 5, transactions: [] });
    const a = app();

    const store = await request(a).get("/api/v1/store").set(as("user-a"));
    expect(store.body.data.freezes.map((f: { id: string }) => f.id)).toContain(freeze.id);

    const buy = await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: freeze.id });
    expect(buy.status).toBe(200);
    expect(buy.body.data.balance).toBe(5);
    const progress = await request(a).get("/api/v1/engagement/me").set(as("user-a"));
    expect(progress.body.data.freezesOwned).toBe(1);
  });
});

describe("notifications", () => {
  it("tells a user they were followed, and marks notifications read", async () => {
    await UserProfile.create({ userId: "user_a", username: "ada" });
    await UserProfile.create({ userId: "user_b", username: "bob" });
    const a = app();

    expect((await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "bob" })).status).toBe(200);

    const unread = await request(a).get("/api/v1/notifications/unread").set(as("user-b"));
    expect(unread.body.data.unread).toBe(1);
    const list = await request(a).get("/api/v1/notifications").set(as("user-b"));
    expect(list.body.data.items[0]).toMatchObject({ kind: "follower", title: "ada followed you", link: "/profile/ada", read: false });

    // Another user's ids are ignored: notifications are always scoped to the session.
    await request(a).post("/api/v1/notifications/read").set(as("user-a")).send({ ids: [list.body.data.items[0].id] });
    expect((await request(a).get("/api/v1/notifications/unread").set(as("user-b"))).body.data.unread).toBe(1);

    const read = await request(a).post("/api/v1/notifications/read").set(as("user-b")).send({});
    expect(read.body.data.unread).toBe(0);
  });

  it("tells a blog post's author about a comment, but not about their own", async () => {
    await Blog.create({ title: "Post", slug: "post", content: "c", authorId: "user_author" });
    const a = app();
    await request(a).post("/api/v1/comments").set(as("user-author")).send({ targetType: "blog", targetId: "post", content: "mine" });
    expect(await Notification.countDocuments({ userId: "user_author" })).toBe(0);
    await request(a).post("/api/v1/comments").set(as("user-reader")).send({ targetType: "blog", targetId: "post", content: "Nice post" });
    const n = await Notification.findOne({ userId: "user_author" }).lean();
    expect(n).toMatchObject({ kind: "comment", link: "/blog/post", body: "Nice post" });
  });

  it("needs a session", async () => {
    expect((await request(app()).get("/api/v1/notifications")).status).toBe(401);
  });
});

describe("announcement banner", () => {
  it("is set by admins only, read by anyone, and cleared by an empty message", async () => {
    await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "user_super" });
    const a = app();

    const denied = await request(a).put("/api/v1/announcement").set(as("user-eve")).send({ message: "hi" });
    expect(denied.status).toBe(403);

    const set = await request(a).put("/api/v1/announcement").set(as("user-admin"))
      .send({ message: "Weekly contest Sunday", level: "info", link: "https://evil.example" });
    expect(set.status).toBe(200);
    expect(set.body.data.announcement.link).toBe("");

    const read = await request(a).get("/api/v1/announcement");
    expect(read.body.data.announcement).toMatchObject({ message: "Weekly contest Sunday", level: "info" });

    await request(a).put("/api/v1/announcement").set(as("user-admin")).send({ message: "" });
    expect((await request(a).get("/api/v1/announcement")).body.data.announcement).toBeNull();
  });

  it("stops showing once expired", async () => {
    await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "user_super" });
    const a = app();
    await request(a).put("/api/v1/announcement").set(as("user-admin"))
      .send({ message: "old", expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await request(a).get("/api/v1/announcement")).body.data.announcement).toBeNull();
  });
});
