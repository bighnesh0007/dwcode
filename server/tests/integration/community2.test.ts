/**
 * Phase E2 end to end: profile about and links, cosmetics (buy and equip),
 * the skill radar, the activity feed, mentors and the jobs board. Real app +
 * in-memory MongoDB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { COSMETICS, DIFFICULTY_TIERS, MENTOR_ASKS_PER_DAY } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Blog } from "../../src/models/Blog.ts";
import { Contribution } from "../../src/models/Contribution.ts";
import { Notification } from "../../src/models/Notification.ts";
import { Problem } from "../../src/models/Problem.ts";
import { ProfileDetail } from "../../src/models/ProfileDetail.ts";
import { StorePurchase } from "../../src/models/StorePurchase.ts";
import { Submission } from "../../src/models/Submission.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserProfile } from "../../src/models/UserProfile.ts";
import { UserRole } from "../../src/models/UserRole.ts";
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
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: userId, imageUrl: "" }) },
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
  await Promise.all([
    Blog.deleteMany({}), Contribution.deleteMany({}), Notification.deleteMany({}), Problem.deleteMany({}), ProfileDetail.deleteMany({}),
    StorePurchase.deleteMany({}), Submission.deleteMany({}), UserCoins.deleteMany({}), UserProfile.deleteMany({}), UserRole.deleteMany({}),
  ]);
  await UserProfile.create({ userId: "user_a", username: "ada", following: ["user_b"] });
  await UserProfile.create({ userId: "user_b", username: "bob", followers: ["user_a"] });
});

describe("about and cosmetics", () => {
  it("saves about and links, and equips only free or owned items", async () => {
    const a = app();
    const saved = await request(a).put("/api/v1/profile-details/me").set(as("user-a"))
      .send({ headline: "Integration dev", about: "I map payloads.", links: { github: "https://github.com/ada" } });
    expect(saved.body.data).toMatchObject({ headline: "Integration dev", links: { github: "https://github.com/ada" } });
    expect((await request(a).put("/api/v1/profile-details/me").set(as("user-a")).send({ links: { github: "javascript:alert(1)" } })).status).toBe(400);

    const gold = COSMETICS.find((c) => c.id === "frame-gold");
    if (!gold) throw new Error("catalogue");
    expect((await request(a).put("/api/v1/profile-details/equip").set(as("user-a")).send({ slot: "frame", itemId: gold.id })).status).toBe(403);
    expect((await request(a).put("/api/v1/profile-details/equip").set(as("user-a")).send({ slot: "badge", itemId: gold.id })).status).toBe(404);

    await UserCoins.create({ userId: "user_a", balance: gold.cost });
    const bought = await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: gold.id });
    expect(bought.body.data).toMatchObject({ success: true, balance: 0 });
    const equipped = await request(a).put("/api/v1/profile-details/equip").set(as("user-a")).send({ slot: "frame", itemId: gold.id });
    expect(equipped.body.data.equippedItems.frame.token).toBe(gold.token);
    expect((await request(a).put("/api/v1/profile-details/equip").set(as("user-a")).send({ slot: "badge", itemId: "badge-none" })).status).toBe(200);

    const catalogue = await request(a).get("/api/v1/store").set(as("user-a"));
    expect(catalogue.body.data.cosmetics.length).toBe(COSMETICS.length);
    expect(catalogue.body.data.owned).toContain(gold.id);
  });

  it("shows a public view with a skill radar by category", async () => {
    const p1 = await Problem.create({ title: "One", slug: "one", difficulty: EASY, category: "Arrays", description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
    await Problem.create({ title: "Two", slug: "two", difficulty: EASY, category: "Arrays", description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
    await Problem.create({ title: "Three", slug: "three", difficulty: EASY, category: "Strings", description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
    await Submission.create({ problemId: p1._id, problemSlug: "one", userId: "user_b", userName: "bob", code: "x", status: "Accepted" });
    const view = await request(app()).get("/api/v1/profile-details/u/bob");
    expect(view.status).toBe(200);
    expect(view.body.data.skills).toEqual([{ category: "Arrays", solved: 1, total: 2 }, { category: "Strings", solved: 0, total: 1 }]);
    expect((await request(app()).get("/api/v1/profile-details/u/nobody")).status).toBe(404);
  });
});

describe("feed, mentors and jobs", () => {
  it("lists solves and posts by people you follow", async () => {
    const p = await Problem.create({ title: "Echo", slug: "echo", difficulty: EASY, category: "Basics", description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
    await Submission.create({ problemId: p._id, problemSlug: "echo", userId: "user_b", userName: "bob", code: "x", status: "Accepted", createdAt: new Date(Date.now() - 60_000) });
    await Submission.create({ problemId: p._id, problemSlug: "echo", userId: "user_b", userName: "bob", code: "y", status: "Accepted" });
    await Submission.create({ problemId: p._id, problemSlug: "echo", userId: "user_c", userName: "cy", code: "x", status: "Accepted" });
    await Blog.create({ title: "My post", slug: "my-post", content: "hi", authorId: "user_b", published: true });
    const feed = await request(app()).get("/api/v1/feed").set(as("user-a"));
    expect(feed.body.data.following).toBe(1);
    expect(feed.body.data.items.map((i: { type: string; username: string; title: string }) => [i.type, i.username, i.title]))
      .toEqual(expect.arrayContaining([["solve", "bob", "Echo"], ["post", "bob", "My post"]]));
    expect(feed.body.data.items).toHaveLength(2); // one solve entry per problem, nothing from user_c
    expect((await request(app()).get("/api/v1/feed").set(as("user-b"))).body.data.items).toEqual([]);
  });

  it("lists mentors and caps how often a learner can ask", async () => {
    const store = new MemoryKeyValueStore();
    const a = app(store);
    expect((await request(a).put("/api/v1/profile-details/mentor").set(as("user-b")).send({ active: true, topics: [] })).status).toBe(400);
    await request(a).put("/api/v1/profile-details/mentor").set(as("user-b")).send({ active: true, topics: ["XML", "APIkit"], note: "Weekends" });
    const mentors = await request(a).get("/api/v1/mentors");
    expect(mentors.body.data.mentors).toEqual([{ username: "bob", headline: "", topics: ["XML", "APIkit"], note: "Weekends" }]);

    for (let i = 0; i < MENTOR_ASKS_PER_DAY; i++) {
      expect((await request(a).post("/api/v1/mentors/bob/ask").set(as("user-a")).send({ message: "Could you review my XML mapping?" })).status).toBe(200);
    }
    expect((await request(a).post("/api/v1/mentors/bob/ask").set(as("user-a")).send({ message: "One more question please." })).status).toBe(429);
    expect(await Notification.countDocuments({ userId: "user_b", kind: "mentor" })).toBe(MENTOR_ASKS_PER_DAY);
    expect((await request(a).post("/api/v1/mentors/ada/ask").set(as("user-b")).send({ message: "Ada is not a mentor." })).status).toBe(404);
  });

  it("lists job posts once an admin approves them", async () => {
    await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "test" });
    const a = app();
    const job = { title: "DataWeave developer", company: "Acme", location: "Pune", remote: true, url: "https://acme.example/jobs/1", description: "Build integrations with Mule 4 and DataWeave 2." };
    const id = (await request(a).post("/api/v1/contributions").set(as("user-a")).send({ kind: "job", payload: job })).body.data.id as string;
    expect((await request(a).get("/api/v1/jobs")).body.data.jobs).toEqual([]);
    await request(a).post(`/api/v1/contributions/${id}/submit`).set(as("user-a"));
    await request(a).post(`/api/v1/admin/contributions/${id}/approve`).set(as("user-admin")).send({});
    const jobs = await request(a).get("/api/v1/jobs");
    expect(jobs.body.data.jobs).toHaveLength(1);
    expect(jobs.body.data.jobs[0]).toMatchObject({ title: "DataWeave developer", company: "Acme", remote: true });
  });
});
