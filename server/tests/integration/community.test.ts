/**
 * Community domain end to end: HTTP → services → in-memory MongoDB.
 * Only Clerk (token verification, identity) is faked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { COIN_RULES, LIMITS } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Comment } from "../../src/models/Comment.ts";
import { Note } from "../../src/models/Note.ts";
import { Bookmark } from "../../src/models/Bookmark.ts";
import { Blog } from "../../src/models/Blog.ts";
import { BlogVote } from "../../src/models/BlogVote.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserRole } from "../../src/models/UserRole.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
let a: Application;
const PID = new mongoose.Types.ObjectId().toString();
const XSS = '<img src=x onerror="alert(1)"> [x](javascript:alert(1))';

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};

const as = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  a = buildTestApp({
    tokenVerifier: verifier,
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: `Name ${userId}`, imageUrl: "https://img" }) },
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(
    [Comment, Note, Bookmark, Blog, BlogVote, UserCoins, UserRole].map((m) => (m as mongoose.Model<unknown>).deleteMany({})),
  );
});

describe("comments", () => {
  it("requires sign-in to post", async () => {
    const r = await request(a).post("/api/v1/comments").send({ targetType: "blog", targetId: "p", content: "hi" });
    expect(r.status).toBe(401);
  });

  it("posts with identity from Clerk, dual-writes problemSlug, awards a coin, and lists newest first", async () => {
    const r1 = await request(a).post("/api/v1/comments").set(as("user-a")).send({ problemSlug: "echo", content: "  first " });
    expect(r1.status).toBe(201);
    expect(r1.body.data).toMatchObject({ targetType: "problem", targetId: "echo", problemSlug: "echo", content: "first", userName: "Name user_a" });
    await request(a).post("/api/v1/comments").set(as("user-a")).send({ targetType: "problem", targetId: "echo", content: "second" });
    // A legacy (pre-002) document without targetId is still found.
    await Comment.collection.insertOne({ problemSlug: "echo", userId: "u", userName: "x", content: "legacy", createdAt: new Date(0) });

    const list = await request(a).get("/api/v1/comments?problemSlug=echo");
    expect(list.status).toBe(200);
    expect(list.body.data.map((c: { content: string }) => c.content)).toEqual(["second", "first", "legacy"]);
    expect((await UserCoins.findOne({ userId: "user_a" }).lean())?.balance).toBe(COIN_RULES.comment * 2);
    const limited = await request(a).get("/api/v1/comments?targetType=problem&targetId=echo&limit=1");
    expect(limited.body.data).toHaveLength(1);
  });

  it("rejects forged identity fields and a missing target (strict)", async () => {
    const forged = await request(a)
      .post("/api/v1/comments")
      .set(as("user-a"))
      .send({ targetType: "blog", targetId: "p", content: "hi", userName: "Admin" });
    expect(forged.status).toBe(400);
    const noTarget = await request(a).post("/api/v1/comments").set(as("user-a")).send({ content: "hi" });
    expect(noTarget.status).toBe(400);
    expect((await request(a).get("/api/v1/comments")).status).toBe(400);
    expect(await Comment.countDocuments()).toBe(0);
  });

  it("rejects empty and over-long content", async () => {
    const empty = await request(a).post("/api/v1/comments").set(as("user-a")).send({ problemSlug: "e", content: "   " });
    expect(empty.status).toBe(400);
    const long = await request(a)
      .post("/api/v1/comments")
      .set(as("user-a"))
      .send({ problemSlug: "e", content: "x".repeat(LIMITS.comment.maxLength + 1) });
    expect(long.status).toBe(413);
  });

  it("stores markdown verbatim and returns it as JSON, never as HTML (H-1 sanitises at render)", async () => {
    await request(a).post("/api/v1/comments").set(as("user-a")).send({ targetType: "blog", targetId: "p", content: XSS });
    const r = await request(a).get("/api/v1/comments?targetType=blog&targetId=p");
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    expect(r.body.data[0].content).toBe(XSS);
  });

  it("only the author can delete", async () => {
    const r = await request(a).post("/api/v1/comments").set(as("user-a")).send({ problemSlug: "e", content: "mine" });
    const id = r.body.data._id as string;
    expect((await request(a).delete(`/api/v1/comments/${id}`)).status).toBe(401);
    expect((await request(a).delete(`/api/v1/comments/${id}`).set(as("user-b"))).status).toBe(403);
    expect((await request(a).delete("/api/v1/comments/not-an-id").set(as("user-a"))).status).toBe(400);
    expect((await request(a).delete(`/api/v1/comments/${id}`).set(as("user-a"))).status).toBe(204);
    expect((await request(a).delete(`/api/v1/comments/${id}`).set(as("user-a"))).status).toBe(404);
  });
});

describe("notes (audit C-3)", () => {
  it("requires sign-in", async () => {
    expect((await request(a).get(`/api/v1/notes?problemId=${PID}`)).status).toBe(401);
    expect((await request(a).put("/api/v1/notes").send({ problemId: PID, problemSlug: "e", content: "x" })).status).toBe(401);
  });

  it("is private per user and upserts", async () => {
    const empty = await request(a).get(`/api/v1/notes?problemId=${PID}`).set(as("user-a"));
    expect(empty.body.data).toEqual({ content: "" });
    await request(a).put("/api/v1/notes").set(as("user-a")).send({ problemId: PID, problemSlug: "e", content: "v1" });
    const saved = await request(a).put("/api/v1/notes").set(as("user-a")).send({ problemId: PID, problemSlug: "e", content: "v2" });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ content: "v2", userId: "user_a" });
    expect(await Note.countDocuments()).toBe(1);
    const other = await request(a).get(`/api/v1/notes?problemId=${PID}`).set(as("user-b"));
    expect(other.body.data).toEqual({ content: "" });
  });

  it("ignores no client userId: a userId field is rejected outright", async () => {
    const r = await request(a)
      .put("/api/v1/notes")
      .set(as("user-a"))
      .send({ problemId: PID, problemSlug: "e", content: "x", userId: "user_b" });
    expect(r.status).toBe(400);
    expect((await request(a).get(`/api/v1/notes?problemId=${PID}&userId=user_b`).set(as("user-a"))).status).toBe(400);
  });

  it("validates problemId and size", async () => {
    expect((await request(a).get("/api/v1/notes?problemId=nope").set(as("user-a"))).status).toBe(400);
    const big = await request(a)
      .put("/api/v1/notes")
      .set(as("user-a"))
      .send({ problemId: PID, problemSlug: "e", content: "x".repeat(LIMITS.note.maxLength + 1) });
    expect(big.status).toBe(413);
  });
});

describe("bookmarks", () => {
  it("returns [] anonymously and requires sign-in to toggle", async () => {
    const r = await request(a).get("/api/v1/bookmarks");
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
    expect((await request(a).post("/api/v1/bookmarks").send({ problemId: PID, problemSlug: "e" })).status).toBe(401);
  });

  it("toggles on and off, scoped to the user", async () => {
    const on = await request(a).post("/api/v1/bookmarks").set(as("user-a")).send({ problemId: PID, problemSlug: "e" });
    expect(on.body.data).toEqual({ bookmarked: true });
    expect((await request(a).get("/api/v1/bookmarks").set(as("user-a"))).body.data).toHaveLength(1);
    expect((await request(a).get("/api/v1/bookmarks").set(as("user-b"))).body.data).toHaveLength(0);
    const off = await request(a).post("/api/v1/bookmarks").set(as("user-a")).send({ problemId: PID, problemSlug: "e" });
    expect(off.body.data).toEqual({ bookmarked: false });
    expect(await Bookmark.countDocuments()).toBe(0);
  });

  it("rejects extra fields", async () => {
    const r = await request(a).post("/api/v1/bookmarks").set(as("user-a")).send({ problemId: PID, problemSlug: "e", userId: "x" });
    expect(r.status).toBe(400);
  });
});

describe("blog", () => {
  async function post(token: string, title = "Hello World", extra: Record<string, unknown> = {}) {
    return request(a).post("/api/v1/blog").set(as(token)).send({ title, content: "body", ...extra });
  }

  it("creates with a unique slug, comma tags, author from Clerk, and 2 coins", async () => {
    expect((await request(a).post("/api/v1/blog").send({ title: "t", content: "c" })).status).toBe(401);
    const r1 = await post("user-a", "Hello World", { tags: "a, b,," });
    expect(r1.status).toBe(201);
    expect(r1.body.data).toMatchObject({ slug: "hello-world", tags: ["a", "b"], authorId: "user_a", authorName: "Name user_a", published: true });
    const r2 = await post("user-a");
    expect(r2.body.data.slug).toBe("hello-world-1");
    expect((await UserCoins.findOne({ userId: "user_a" }).lean())?.balance).toBe(COIN_RULES.blogPost * 2);
    const list = await request(a).get("/api/v1/blog");
    expect(list.body.data.map((p: { slug: string }) => p.slug)).toEqual(["hello-world-1", "hello-world"]);
    expect((await request(a).get("/api/v1/blog/hello-world")).body.data.title).toBe("Hello World");
    expect((await request(a).get("/api/v1/blog/missing")).status).toBe(404);
  });

  it("rejects forged fields and blank title/content", async () => {
    expect((await post("user-a", "T", { upvotes: 99 })).status).toBe(400);
    expect((await post("user-a", "T", { authorId: "user_b" })).status).toBe(400);
    expect((await post("user-a", "   ")).status).toBe(400);
    expect(await Blog.countDocuments()).toBe(0);
  });

  it("stores raw markdown unchanged (H-1 is enforced by the renderer)", async () => {
    await request(a).post("/api/v1/blog").set(as("user-a")).send({ title: "X", content: XSS });
    expect((await request(a).get("/api/v1/blog/x")).body.data.content).toBe(XSS);
  });

  it("delete: author or admin only, and votes go with the post", async () => {
    await post("user-a");
    await request(a).post("/api/v1/blog/hello-world/vote").set(as("user-b")).send({ value: 1 });
    expect((await request(a).delete("/api/v1/blog/hello-world").set(as("user-b"))).status).toBe(403);
    await UserRole.create({ userId: "user_c", role: "admin", grantedBy: "test" });
    expect((await request(a).delete("/api/v1/blog/hello-world").set(as("user-c"))).status).toBe(204);
    expect(await BlogVote.countDocuments()).toBe(0);
    expect((await request(a).delete("/api/v1/blog/hello-world").set(as("user-a"))).status).toBe(404);
    await post("user-a");
    expect((await request(a).delete("/api/v1/blog/hello-world").set(as("user-a"))).status).toBe(204);
  });

  it("vote toggling: up, switch to down, retract; counters derived server-side", async () => {
    await post("user-a");
    const url = "/api/v1/blog/hello-world/vote";
    expect((await request(a).get(url)).body.data).toEqual({ upvotes: 0, downvotes: 0, score: 0, myVote: 0 });
    expect((await request(a).post(url).send({ value: 1 })).status).toBe(401);
    expect((await request(a).post(url).set(as("user-b")).send({ value: 2 })).status).toBe(400);
    expect((await request(a).post(url).set(as("user-b")).send({ value: 1, upvotes: 50 })).status).toBe(400);

    expect((await request(a).post(url).set(as("user-b")).send({ value: 1 })).body.data).toEqual({ upvotes: 1, downvotes: 0, score: 1, myVote: 1 });
    // Repeating the same vote is idempotent.
    expect((await request(a).post(url).set(as("user-b")).send({ value: 1 })).body.data.upvotes).toBe(1);
    expect((await request(a).post(url).set(as("user-b")).send({ value: -1 })).body.data).toEqual({ upvotes: 0, downvotes: 1, score: -1, myVote: -1 });
    expect((await request(a).get(url).set(as("user-b"))).body.data.myVote).toBe(-1);
    expect((await request(a).post(url).set(as("user-b")).send({ value: 0 })).body.data).toEqual({ upvotes: 0, downvotes: 0, score: 0, myVote: 0 });
    expect(await BlogVote.countDocuments()).toBe(0);
    expect((await request(a).post("/api/v1/blog/missing/vote").set(as("user-b")).send({ value: 1 })).status).toBe(404);
  });
});
