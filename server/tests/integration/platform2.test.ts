/**
 * Phase F2 end to end: email notifications honour preferences and the daily
 * cap, the admin email test, and the store editor (price changes and items
 * taken off sale). Real app + in-memory MongoDB, with a fake mailer.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { EMAIL_CATEGORIES } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { AppSetting } from "../../src/models/AppSetting.ts";
import { AuditEntry } from "../../src/models/Ops.ts";
import { ProfileDetail } from "../../src/models/ProfileDetail.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserProfile } from "../../src/models/UserProfile.ts";
import { UserRole } from "../../src/models/UserRole.ts";
import { StorePurchase } from "../../src/models/StorePurchase.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import { configureEmail, type EmailMessage, type Mailer } from "../../src/services/notifications/email.ts";
import { invalidateStoreOverrides } from "../../src/services/users/store.service.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
let sent: EmailMessage[] = [];
const mailer: Mailer = { send: (m) => { sent.push(m); return Promise.resolve(); } };

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
    mailer,
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: userId, imageUrl: "", primaryEmail: `${userId}@example.test` }) },
  });
}

/** Emails go out in the background; give them a moment. */
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  configureEmail(null);
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  sent = [];
  invalidateStoreOverrides();
  await Promise.all([AppSetting.deleteMany({}), AuditEntry.deleteMany({}), ProfileDetail.deleteMany({}), UserCoins.deleteMany({}), UserProfile.deleteMany({}), UserRole.deleteMany({}), StorePurchase.deleteMany({})]);
  await UserProfile.create({ userId: "user_a", username: "ada" });
  await UserProfile.create({ userId: "user_b", username: "bob" });
  await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "test" });
});

afterEach(() => invalidateStoreOverrides());

describe("email notifications", () => {
  it("emails default-on kinds, not opt-in ones, and follows saved preferences", async () => {
    const a = app();
    const prefs = await request(a).get("/api/v1/profile-details/email").set(as("user-b"));
    expect(prefs.body.data.configured).toBe(true);
    expect(prefs.body.data.categories.map((c: { id: string }) => c.id)).toEqual(EMAIL_CATEGORIES.map((c) => c.id));

    // Mentoring requests are on by default.
    await request(a).put("/api/v1/profile-details/mentor").set(as("user-b")).send({ active: true, topics: ["XML"] });
    await request(a).post("/api/v1/mentors/bob/ask").set(as("user-a")).send({ message: "Could you look at my XML mapping?" });
    await settle();
    expect(sent.map((m) => m.to)).toEqual(["user_b@example.test"]);
    expect(sent[0]?.subject).toContain("ada asked you for mentoring");
    expect(sent[0]?.html).not.toContain("<script");

    // Followers are opt-in: nothing until switched on.
    sent = [];
    await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "bob" });
    await settle();
    expect(sent).toEqual([]);

    await request(a).put("/api/v1/profile-details/email").set(as("user-b")).send({ prefs: { community: true, mentoring: false } });
    await request(a).post("/api/v1/mentors/bob/ask").set(as("user-a")).send({ message: "A second question for you." });
    await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "bob" }); // unfollow
    await request(a).post("/api/v1/profile/follow").set(as("user-a")).send({ targetUsername: "bob" }); // follow again
    await settle();
    expect(sent.map((m) => m.subject).some((s) => s.includes("mentoring"))).toBe(false);
    expect(sent.length).toBeGreaterThan(0);
  });

  it("sends an admin test email to the admin's own address, and audits it", async () => {
    const a = app();
    expect((await request(a).post("/api/v1/admin/ops/email-test").set(as("user-a"))).status).toBe(403);
    const res = await request(a).post("/api/v1/admin/ops/email-test").set(as("user-admin"));
    expect(res.body.data).toEqual({ sent: true, to: "user_admin@example.test" });
    expect(sent.at(-1)?.subject).toBe("DWCode email test");
    expect(await AuditEntry.countDocuments({ action: "email.test" })).toBe(1);
  });
});

describe("store editor", () => {
  it("changes prices and takes items off sale, keeping owned items listed", async () => {
    const a = app();
    const items = await request(a).get("/api/v1/admin/ops/store").set(as("user-admin"));
    const frame = items.body.data.items.find((i: { id: string }) => i.id === "frame-silver");
    expect(frame).toMatchObject({ kind: "cosmetic", override: null });

    expect((await request(a).put("/api/v1/admin/ops/store").set(as("user-admin")).send({ overrides: { "frame-none": { cost: 5 } } })).status).toBe(400);
    expect((await request(a).put("/api/v1/admin/ops/store").set(as("user-admin")).send({ overrides: { nope: { cost: 5 } } })).status).toBe(400);
    const saved = await request(a).put("/api/v1/admin/ops/store").set(as("user-admin"))
      .send({ overrides: { "frame-silver": { cost: 7 }, "frame-gold": { disabled: true } } });
    expect(saved.status).toBe(200);

    const catalogue = await request(a).get("/api/v1/store").set(as("user-a"));
    const cosmetics = catalogue.body.data.cosmetics as { id: string; cost: number }[];
    expect(cosmetics.find((c) => c.id === "frame-silver")?.cost).toBe(7);
    expect(cosmetics.some((c) => c.id === "frame-gold")).toBe(false);

    await UserCoins.create({ userId: "user_a", balance: 10 });
    const bought = await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: "frame-silver" });
    expect(bought.body.data).toMatchObject({ success: true, balance: 3 });
    expect((await request(a).post("/api/v1/store").set(as("user-a")).send({ itemId: "frame-gold" })).status).toBe(404);
    expect(await AuditEntry.countDocuments({ action: "store.edit" })).toBe(1);
  });
});
