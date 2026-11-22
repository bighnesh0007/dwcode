/**
 * Phase C competition end to end: standings, ratings, the contest events job,
 * teams and countries. Real app + Mongoose against an in-memory MongoDB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { CONTEST_PRIZES, DIFFICULTY_TIERS, INITIAL_RATING, TEAM_LIMITS, contestPointsFor } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { AppSetting } from "../../src/models/AppSetting.ts";
import { Contest } from "../../src/models/Contest.ts";
import { Notification } from "../../src/models/Notification.ts";
import { Problem } from "../../src/models/Problem.ts";
import { Submission } from "../../src/models/Submission.ts";
import { Team } from "../../src/models/Team.ts";
import { UserCoins } from "../../src/models/UserCoins.ts";
import { UserProfile } from "../../src/models/UserProfile.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import { buildCompetitionService } from "../../src/composition/competition.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
const EASY = DIFFICULTY_TIERS[0]?.id ?? "";
const HOUR = 60 * 60_000;

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-") ? Promise.resolve({ userId: token.replace("user-", "user_") }) : Promise.reject(new UnauthenticatedError("bad")),
};
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

function app(): Application {
  return buildTestApp({
    tokenVerifier: verifier,
    identityProvider: { getUser: (userId) => Promise.resolve({ userId, displayName: userId, imageUrl: "", primaryEmail: "" }) },
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Team.init(), AppSetting.init(), UserProfile.init()]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([Problem, Submission, Contest, Notification, AppSetting, Team, UserCoins, UserProfile].map((m) => (m as typeof Problem).deleteMany({})));
});

async function problem(slug: string) {
  return Problem.create({ title: slug, slug, difficulty: EASY, category: "basics", description: "d", testCases: [{ input: "{}", expectedOutput: "{}" }] });
}

async function contest(opts: { start: Date; end: Date; slugs: string[]; users: string[]; isPublic?: boolean }) {
  const ps = await Problem.find({ slug: { $in: opts.slugs } });
  return Contest.create({
    title: "Weekly 1", createdBy: "user_owner", createdByName: "owner",
    problems: ps.map((p) => p._id), problemSlugs: opts.slugs,
    startTime: opts.start, endTime: opts.end, duration: 60, isPublic: opts.isPublic ?? true,
    participants: opts.users.map((u) => ({ userId: u, userName: u })),
  });
}

async function sub(userId: string, slug: string, status: string, at: Date) {
  const p = await Problem.findOne({ slug }).orFail();
  return Submission.create({ problemId: p._id, problemSlug: slug, userId, userName: userId, code: "x", status, createdAt: at });
}

describe("standings", () => {
  it("ranks participants from submissions inside the window", async () => {
    await problem("p1");
    const start = new Date(Date.now() - HOUR);
    const c = await contest({ start, end: new Date(Date.now() + HOUR), slugs: ["p1"], users: ["user_a", "user_b"] });
    await sub("user_b", "p1", "Attempted", new Date(start.getTime() + 60_000));
    await sub("user_b", "p1", "Accepted", new Date(start.getTime() + 120_000));
    await sub("user_a", "p1", "Accepted", new Date(start.getTime() - 60_000)); // before the contest

    const res = await request(app()).get(`/api/v1/contests/${String(c._id)}/standings`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
    expect(res.body.data.rows[0]).toMatchObject({ userId: "user_b", rank: 1, points: contestPointsFor(EASY), solved: 1 });
    expect(res.body.data.rows[1]).toMatchObject({ userId: "user_a", solved: 0 });
  });

  it("hides a private contest's standings from outsiders", async () => {
    await problem("p1");
    const c = await contest({ start: new Date(), end: new Date(Date.now() + HOUR), slugs: ["p1"], users: ["user_a"], isPublic: false });
    expect((await request(app()).get(`/api/v1/contests/${String(c._id)}/standings`).set(as("user-x"))).status).toBe(403);
    expect((await request(app()).get(`/api/v1/contests/${String(c._id)}/standings`).set(as("user-a"))).status).toBe(200);
  });
});

describe("contest events and ratings", () => {
  it("pays the top three once, notifies every entrant, and rates them", async () => {
    await problem("p1");
    const start = new Date(Date.now() - 3 * HOUR);
    const c = await contest({ start, end: new Date(Date.now() - HOUR), slugs: ["p1"], users: ["user_a", "user_b", "user_c"] });
    await sub("user_a", "p1", "Accepted", new Date(start.getTime() + 5 * 60_000));
    await sub("user_b", "p1", "Accepted", new Date(start.getTime() + 9 * 60_000));
    await sub("user_c", "p1", "Attempted", new Date(start.getTime() + 9 * 60_000));

    const events = buildCompetitionService({ now: () => new Date(), nowMs: () => Date.now() });
    expect(await events.runEvents()).toMatchObject({ finalized: 1 });
    expect(await events.runEvents()).toMatchObject({ finalized: 0 });

    const coins = async (u: string) => (await UserCoins.findOne({ userId: u }).lean())?.balance ?? 0;
    expect(await coins("user_a")).toBe(CONTEST_PRIZES[0]);
    expect(await coins("user_b")).toBe(CONTEST_PRIZES[1]);
    expect(await coins("user_c")).toBe(0); // solved nothing: no prize
    expect(await Notification.countDocuments({ kind: "contest_result" })).toBe(3);

    const ratings = await request(app()).get("/api/v1/ratings");
    const rows = ratings.body.data.rows as { userId: string; rating: number }[];
    expect(rows[0]?.userId).toBe("user_a");
    expect(rows.find((r) => r.userId === "user_a")?.rating).toBeGreaterThan(INITIAL_RATING);
    expect(rows.find((r) => r.userId === "user_c")?.rating).toBeLessThan(INITIAL_RATING);
    expect((await request(app()).get("/api/v1/ratings/me").set(as("user-a"))).body.data.history).toHaveLength(1);
    expect(String(c._id)).toBeTruthy();
  });

  it("reminds participants once, shortly before a contest starts", async () => {
    await problem("p1");
    await contest({ start: new Date(Date.now() + 10 * 60_000), end: new Date(Date.now() + HOUR), slugs: ["p1"], users: ["user_a"] });
    const events = buildCompetitionService({ now: () => new Date(), nowMs: () => Date.now() });
    expect(await events.runEvents()).toMatchObject({ reminded: 1 });
    expect(await events.runEvents()).toMatchObject({ reminded: 0 });
    expect(await Notification.countDocuments({ userId: "user_a", kind: "contest_reminder" })).toBe(1);
  });
});

describe("teams", () => {
  it("creates, joins by code, enforces one team per user, and leaves", async () => {
    const a = app();
    const created = await request(a).post("/api/v1/teams").set(as("user-a")).send({ name: "Mule Masters" });
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({ slug: "mule-masters", isOwner: true });
    const code: string = created.body.data.inviteCode;

    expect((await request(a).get("/api/v1/teams/mule-masters").set(as("user-b"))).body.data).not.toHaveProperty("inviteCode");
    expect((await request(a).post("/api/v1/teams/join").set(as("user-b")).send({ code })).status).toBe(200);
    expect((await request(a).post("/api/v1/teams").set(as("user-b")).send({ name: "Another" })).status).toBe(409);
    expect((await request(a).post("/api/v1/teams/join").set(as("user-b")).send({ code })).status).toBe(409);

    // The owner cannot leave while others remain; a member can.
    expect((await request(a).post("/api/v1/teams/mule-masters/leave").set(as("user-a"))).status).toBe(400);
    expect((await request(a).post("/api/v1/teams/mule-masters/leave").set(as("user-b"))).body.data).toMatchObject({ deleted: false });
    expect((await request(a).post("/api/v1/teams/mule-masters/leave").set(as("user-a"))).body.data).toMatchObject({ deleted: true });
    expect(await Team.countDocuments()).toBe(0);
  });

  it("caps team size", async () => {
    const a = app();
    const { body } = await request(a).post("/api/v1/teams").set(as("user-owner")).send({ name: "Big Team" });
    for (let i = 1; i < TEAM_LIMITS.maxMembers; i++) {
      expect((await request(a).post("/api/v1/teams/join").set(as(`user-m${i}`)).send({ code: body.data.inviteCode })).status).toBe(200);
    }
    expect((await request(a).post("/api/v1/teams/join").set(as("user-late")).send({ code: body.data.inviteCode })).status).toBe(409);
  });

  it("only lets the owner remove members or unlist the team, and hides unlisted teams", async () => {
    const a = app();
    const { body } = await request(a).post("/api/v1/teams").set(as("user-a")).send({ name: "Quiet Crew", listed: false });
    await request(a).post("/api/v1/teams/join").set(as("user-b")).send({ code: body.data.inviteCode });
    expect((await request(a).get("/api/v1/teams/quiet-crew")).status).toBe(404);
    expect((await request(a).get("/api/v1/teams")).body.data.teams).toEqual([]);
    expect((await request(a).post("/api/v1/teams/quiet-crew/remove").set(as("user-b")).send({ userId: "user_a" })).status).toBe(403);
    expect((await request(a).post("/api/v1/teams/quiet-crew/remove").set(as("user-a")).send({ userId: "user_b" })).body.data.members).toHaveLength(1);
  });
});

describe("team and country leaderboards", () => {
  it("sums members' scores by team and by country", async () => {
    await problem("p1");
    await UserProfile.create({ userId: "user_a", username: "ada" });
    await UserProfile.create({ userId: "user_b", username: "bob" });
    await sub("user_a", "p1", "Accepted", new Date());
    const a = app();
    expect((await request(a).put("/api/v1/profile-country").set(as("user-a")).send({ country: "IN" })).status).toBe(200);
    expect((await request(a).put("/api/v1/profile-country").set(as("user-b")).send({ country: "ZZ" })).status).toBe(400);
    await request(a).post("/api/v1/teams").set(as("user-a")).send({ name: "Solo Team" });

    const countries = await request(a).get("/api/v1/leaderboards/countries");
    expect(countries.body.data.rows[0]).toMatchObject({ key: "IN", members: 1 });
    expect(countries.body.data.rows[0].score).toBeGreaterThan(0);
    const teams = await request(a).get("/api/v1/leaderboards/teams");
    expect(teams.body.data.rows[0]).toMatchObject({ key: "solo-team", members: 1 });
  });
});
