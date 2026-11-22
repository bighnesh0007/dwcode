/**
 * Phase F1 end to end: telemetry (errors grouped, CSP reports, page views),
 * the error inbox, moderation (hide posts and comments, suspend users), the
 * audit log and analytics. Real app + in-memory MongoDB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Blog } from "../../src/models/Blog.ts";
import { Comment } from "../../src/models/Comment.ts";
import { AuditEntry, ClientError, Moderation, PageView } from "../../src/models/Ops.ts";
import { UserRole } from "../../src/models/UserRole.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import { invalidateHidden } from "../../src/services/admin/hiddenContent.ts";
import { invalidateSuspensions } from "../../src/middleware/suspension.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;

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
  await Promise.all([Blog.deleteMany({}), Comment.deleteMany({}), AuditEntry.deleteMany({}), ClientError.deleteMany({}), Moderation.deleteMany({}), PageView.deleteMany({}), UserRole.deleteMany({})]);
  await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "test" });
  invalidateHidden();
  invalidateSuspensions();
});

describe("telemetry and the error inbox", () => {
  it("groups errors by fingerprint, strips query strings, and resolves/reopens", async () => {
    const a = app();
    for (const n of [1, 2]) {
      const res = await request(a).post("/api/v1/telemetry/error")
        .send({ message: `Cannot read properties of undefined (reading 'x') at line ${n}`, source: "https://dwcode.app/_next/app.js?v=3", url: "/problems/echo?token=secret" });
      expect(res.status).toBe(204);
    }
    const inbox = await request(a).get("/api/v1/admin/ops/errors").set(as("user-admin"));
    expect(inbox.body.data.errors).toHaveLength(1);
    const err = inbox.body.data.errors[0];
    expect(err).toMatchObject({ count: 2, kind: "error", source: "https://dwcode.app/_next/app.js" });
    expect(err.sample.url).toBe("/problems/echo");
    expect(JSON.stringify(err)).not.toContain("secret");

    expect((await request(a).get("/api/v1/admin/ops/errors").set(as("user-a"))).status).toBe(403);
    await request(a).post(`/api/v1/admin/ops/errors/${err.fingerprint}/resolve`).set(as("user-admin"));
    expect((await request(a).get("/api/v1/admin/ops/errors").set(as("user-admin"))).body.data.errors).toHaveLength(0);
    // Happens again: back in the inbox.
    await request(a).post("/api/v1/telemetry/error").send({ message: "Cannot read properties of undefined (reading 'x') at line 9", source: "https://dwcode.app/_next/app.js" });
    expect((await request(a).get("/api/v1/admin/ops/errors").set(as("user-admin"))).body.data.errors[0].count).toBe(3);
  });

  it("accepts CSP reports and counts page views into analytics", async () => {
    const a = app();
    const csp = await request(a).post("/api/v1/telemetry/csp").set("Content-Type", "application/csp-report")
      .send(JSON.stringify({ "csp-report": { "document-uri": "https://dwcode.app/blog?x=1", "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js" } }));
    expect(csp.status).toBe(204);
    expect(await ClientError.countDocuments({ kind: "csp" })).toBe(1);

    await request(a).post("/api/v1/telemetry/pageview").send({ path: "/problems?difficulty=x" });
    await request(a).post("/api/v1/telemetry/pageview").send({ path: "/problems" });
    await request(a).post("/api/v1/telemetry/pageview").send({ path: "https://elsewhere.example/" });
    const analytics = await request(a).get("/api/v1/admin/ops/analytics").set(as("user-admin"));
    expect(analytics.status).toBe(200);
    expect(analytics.body.data.topPaths).toEqual([{ path: "/problems", count: 2 }]);
    expect(analytics.body.data.daily).toHaveLength(30);
    expect(analytics.body.data.daily.at(-1).views).toBe(2);
    expect(analytics.body.data.openErrors).toBe(1);
  });
});

describe("moderation and the audit log", () => {
  it("hides a blog post and a comment from readers, and audits it", async () => {
    await Blog.create({ title: "Spam", slug: "spam", content: "buy now", authorId: "user_b", published: true });
    const comment = await Comment.create({ targetType: "blog", targetId: "spam", userId: "user_b", userName: "b", content: "rude" });
    const a = app();
    expect((await request(a).get("/api/v1/blog/spam")).status).toBe(200);
    expect((await request(a).get("/api/v1/comments?targetType=blog&targetId=spam")).body.data).toHaveLength(1);

    await request(a).put("/api/v1/admin/ops/moderation").set(as("user-admin")).send({ kind: "blog", ref: "spam", reason: "spam" });
    await request(a).put("/api/v1/admin/ops/moderation").set(as("user-admin")).send({ kind: "comment", ref: String(comment._id), reason: "rude" });
    expect((await request(a).get("/api/v1/blog/spam")).status).toBe(404);
    expect((await request(a).get("/api/v1/blog")).body.data.map((p: { slug: string }) => p.slug)).not.toContain("spam");
    const comments = await request(a).get("/api/v1/comments?targetType=blog&targetId=spam");
    expect(comments.body.data).toEqual([]);

    await request(a).delete("/api/v1/admin/ops/moderation/blog/spam").set(as("user-admin"));
    expect((await request(a).get("/api/v1/blog/spam")).status).toBe(200);

    const audit = await request(a).get("/api/v1/admin/ops/audit").set(as("user-admin"));
    expect(audit.body.data.entries.map((e: { action: string }) => e.action)).toEqual(["blog.unhide", "comment.hide", "blog.hide"]);
  });

  it("suspends a user from writing until unsuspended, and never an admin", async () => {
    const a = app();
    expect((await request(a).put("/api/v1/admin/ops/moderation").set(as("user-admin")).send({ kind: "user", ref: "user_admin" })).status).toBe(400);
    const s = await request(a).put("/api/v1/admin/ops/moderation").set(as("user-admin")).send({ kind: "user", ref: "user_b", reason: "abuse", days: 7 });
    expect(s.status).toBe(200);
    const write = await request(a).post("/api/v1/blog").set(as("user-b")).send({ title: "Hello there", content: "A post that should be refused." });
    expect(write.status).toBe(403);
    expect(write.body.error.message).toContain("suspended");
    // Reading still works.
    expect((await request(a).get("/api/v1/notifications").set(as("user-b"))).status).toBe(200);
    await request(a).delete("/api/v1/admin/ops/moderation/user/user_b").set(as("user-admin"));
    expect((await request(a).post("/api/v1/blog").set(as("user-b")).send({ title: "Hello there", content: "A post that is now allowed." })).status).not.toBe(403);
  });
});
