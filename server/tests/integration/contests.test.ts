/**
 * Contests, end to end: HTTP → service → in-memory MongoDB. Identity, token and
 * clock are faked; everything else is real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { DIFFICULTIES } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { Contest } from "../../src/models/Contest.ts";
import { Problem } from "../../src/models/Problem.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import type { Clock, TokenVerifier } from "../../src/types/ports.ts";

let mongo: MongoMemoryServer;
let problemIds: string[] = [];
let nowMs = Date.UTC(2026, 9, 1, 12, 0, 0);
const clock: Clock = { now: () => new Date(nowMs), nowMs: () => nowMs };
const HOUR = 3_600_000;

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};

function app(): Application {
  return buildTestApp({
    clock,
    tokenVerifier: verifier,
    identityProvider: {
      getUser: (userId) => Promise.resolve({ userId, displayName: `Name ${userId}`, imageUrl: "https://img" }),
    },
  });
}

const auth = (u: string) => ({ Authorization: `Bearer user-${u}` });

async function seedContest(over: Partial<Record<string, unknown>> = {}) {
  const c = await Contest.create({
    title: "C",
    createdBy: "user_owner",
    createdByName: "Owner",
    problems: problemIds,
    problemSlugs: ["p0"],
    startTime: new Date(nowMs + HOUR),
    endTime: new Date(nowMs + 3 * HOUR),
    duration: 120,
    isPublic: true,
    maxParticipants: 100,
    participants: [],
    ...over,
  });
  return String(c._id);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Contest.createIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  nowMs = Date.UTC(2026, 9, 1, 12, 0, 0);
  await Promise.all([Contest.deleteMany({}), Problem.deleteMany({})]);
  const docs = await Problem.insertMany(
    [0, 1].map((i) => ({
      title: `P${i}`,
      slug: `p${i}`,
      difficulty: DIFFICULTIES[i % DIFFICULTIES.length],
      category: "basics",
      description: "d",
      tags: ["t"],
    })),
  );
  problemIds = docs.map((d) => String(d._id));
});

describe("POST /api/v1/contests (create)", () => {
  const body = () => ({
    title: "Friday",
    problemIds,
    startTime: new Date(nowMs + HOUR).toISOString(),
    duration: 60,
  });

  it("requires sign-in", async () => {
    expect((await request(app()).post("/api/v1/contests").send(body())).status).toBe(401);
  });

  it("creates with server-owned fields and identity from the token", async () => {
    const res = await request(app()).post("/api/v1/contests").set(auth("a")).send(body());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const saved = await Contest.findById(res.body.data._id).lean();
    expect(saved).toMatchObject({
      createdBy: "user_a",
      createdByName: "Name user_a",
      problemSlugs: ["p0", "p1"],
      duration: 60,
      status: "upcoming",
      isPublic: true,
      maxParticipants: 100,
      participants: [],
    });
    expect(saved?.endTime.getTime()).toBe(nowMs + 2 * HOUR);
    expect(saved?.inviteCode).toBeUndefined();
  });

  it("gives a private contest an invite code", async () => {
    const res = await request(app()).post("/api/v1/contests").set(auth("a")).send({ ...body(), isPublic: false });
    expect(res.status).toBe(201);
    expect(res.body.data.inviteCode).toMatch(/^[A-Z0-9_-]{8}$/);
  });

  it("rejects server-owned fields in the body (.strict)", async () => {
    for (const extra of [{ participants: [{ userId: "x" }] }, { createdBy: "user_z" }, { inviteCode: "AAAA" }]) {
      const res = await request(app()).post("/api/v1/contests").set(auth("a")).send({ ...body(), ...extra });
      expect(res.status).toBe(400);
    }
    expect(await Contest.countDocuments()).toBe(0);
  });

  it("rejects missing fields, unknown problems, and a cap above the weekly ceiling", async () => {
    const a = app();
    expect((await request(a).post("/api/v1/contests").set(auth("a")).send({ ...body(), problemIds: [] })).status).toBe(400);
    const ghost = new mongoose.Types.ObjectId().toHexString();
    expect((await request(a).post("/api/v1/contests").set(auth("a")).send({ ...body(), problemIds: [ghost] })).status).toBe(400);
    expect((await request(a).post("/api/v1/contests").set(auth("a")).send({ ...body(), maxParticipants: 501 })).status).toBe(400);
    expect(await Contest.countDocuments()).toBe(0);
  });
});

describe("GET /api/v1/contests (list) and /:id (detail)", () => {
  it("anonymous sees only public contests, without participants or invite codes", async () => {
    await seedContest({ participants: [{ userId: "user_b", userName: "B" }] });
    await seedContest({ isPublic: false, inviteCode: "SECRET01" });
    const res = await request(app()).get("/api/v1/contests");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ participantCount: 1, isParticipant: false, status: "upcoming" });
    expect(res.body.data[0].participants).toBeUndefined();
    expect(res.body.data[0].problems[0]).toMatchObject({ slug: "p0" });
  });

  it("creator sees their private contest and its invite code; others do not", async () => {
    await seedContest({ isPublic: false, inviteCode: "SECRET01" });
    const owner = await request(app()).get("/api/v1/contests").set(auth("owner"));
    expect(owner.body.data[0].inviteCode).toBe("SECRET01");
    const other = await request(app()).get("/api/v1/contests").set(auth("x"));
    expect(other.body.data).toHaveLength(0);
  });

  it("detail: 403 for a private contest to outsiders, 404 for unknown, computed status", async () => {
    const priv = await seedContest({ isPublic: false, inviteCode: "SECRET01" });
    expect((await request(app()).get(`/api/v1/contests/${priv}`).set(auth("x"))).status).toBe(403);
    const own = await request(app()).get(`/api/v1/contests/${priv}`).set(auth("owner"));
    expect(own.body.data).toMatchObject({ isCreator: true, inviteCode: "SECRET01" });
    expect((await request(app()).get(`/api/v1/contests/${new mongoose.Types.ObjectId().toHexString()}`)).status).toBe(404);
    expect((await request(app()).get("/api/v1/contests/not-an-id")).status).toBe(400);

    const pub = await seedContest({ startTime: new Date(nowMs - HOUR) });
    const d = await request(app()).get(`/api/v1/contests/${pub}`);
    expect(d.body.data).toMatchObject({ status: "active", isCreator: false, isParticipant: false });
    expect(d.body.data.inviteCode).toBeUndefined();
  });
});

describe("join / leave", () => {
  it("requires sign-in", async () => {
    const id = await seedContest();
    expect((await request(app()).post(`/api/v1/contests/${id}/join`)).status).toBe(401);
  });

  it("joins once; a second join is idempotent", async () => {
    const id = await seedContest();
    const a = app();
    const r1 = await request(a).post(`/api/v1/contests/${id}/join`).set(auth("a"));
    expect(r1.body.data).toEqual({ alreadyJoined: false });
    const r2 = await request(a).post(`/api/v1/contests/${id}/join`).set(auth("a"));
    expect(r2.body.data).toEqual({ alreadyJoined: true });
    const saved = await Contest.findById(id).lean();
    expect(saved?.participants).toHaveLength(1);
    expect(saved?.participants[0]).toMatchObject({ userId: "user_a", userName: "Name user_a", score: 0 });
  });

  it("concurrent joins by the same user record one participant", async () => {
    const id = await seedContest();
    const a = app();
    const res = await Promise.all(
      Array.from({ length: 10 }, () => request(a).post(`/api/v1/contests/${id}/join`).set(auth("a"))),
    );
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect((await Contest.findById(id).lean())?.participants).toHaveLength(1);
  });

  it("concurrent joins never exceed maxParticipants", async () => {
    const id = await seedContest({ maxParticipants: 3 });
    const a = app();
    const res = await Promise.all(
      Array.from({ length: 10 }, (_, i) => request(a).post(`/api/v1/contests/${id}/join`).set(auth(`u${i}`))),
    );
    expect(res.filter((r) => r.status === 200)).toHaveLength(3);
    expect(res.filter((r) => r.status === 409)).toHaveLength(7);
    expect((await Contest.findById(id).lean())?.participants).toHaveLength(3);
  });

  it("refuses to join after the end, and a private contest without the code", async () => {
    const ended = await seedContest({ startTime: new Date(nowMs - 3 * HOUR), endTime: new Date(nowMs - HOUR) });
    expect((await request(app()).post(`/api/v1/contests/${ended}/join`).set(auth("a"))).status).toBe(400);
    const priv = await seedContest({ isPublic: false, inviteCode: "SECRET01" });
    expect((await request(app()).post(`/api/v1/contests/${priv}/join`).set(auth("a"))).status).toBe(403);
    expect(await Contest.countDocuments({ "participants.0": { $exists: true } })).toBe(0);
  });

  it("allows joining while active (late join, as before)", async () => {
    const id = await seedContest({ startTime: new Date(nowMs - HOUR) });
    expect((await request(app()).post(`/api/v1/contests/${id}/join`).set(auth("a"))).status).toBe(200);
  });

  it("leave removes the caller only", async () => {
    const id = await seedContest({
      participants: [
        { userId: "user_a", userName: "A" },
        { userId: "user_b", userName: "B" },
      ],
    });
    expect((await request(app()).post(`/api/v1/contests/${id}/leave`).set(auth("a"))).status).toBe(204);
    expect((await Contest.findById(id).lean())?.participants.map((p) => p.userId)).toEqual(["user_b"]);
  });

  it("rejects a body on join (identity never from the body)", async () => {
    const id = await seedContest();
    const res = await request(app()).post(`/api/v1/contests/${id}/join`).set(auth("a")).send({ userId: "user_z" });
    expect(res.status).toBe(200);
    expect((await Contest.findById(id).lean())?.participants.map((p) => p.userId)).toEqual(["user_a"]);
  });
});

describe("POST /api/v1/contests/join-by-code", () => {
  it("joins a private contest by code, case-insensitively", async () => {
    const id = await seedContest({ isPublic: false, inviteCode: "SECRET01" });
    const res = await request(app()).post("/api/v1/contests/join-by-code").set(auth("a")).send({ inviteCode: " secret01 " });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ contestId: id, alreadyJoined: false });
  });

  it("404 for an unknown code or a public contest's code; 400 after end; 409 when full", async () => {
    const a = app();
    expect((await request(a).post("/api/v1/contests/join-by-code").set(auth("a")).send({ inviteCode: "NOPE" })).status).toBe(404);
    await seedContest({ inviteCode: "PUBLIC01" });
    expect((await request(a).post("/api/v1/contests/join-by-code").set(auth("a")).send({ inviteCode: "PUBLIC01" })).status).toBe(404);
    await seedContest({ isPublic: false, inviteCode: "ENDED001", startTime: new Date(nowMs - 3 * HOUR), endTime: new Date(nowMs - HOUR) });
    expect((await request(a).post("/api/v1/contests/join-by-code").set(auth("a")).send({ inviteCode: "ENDED001" })).status).toBe(400);
    await seedContest({ isPublic: false, inviteCode: "FULL0001", maxParticipants: 1, participants: [{ userId: "user_z", userName: "Z" }] });
    expect((await request(a).post("/api/v1/contests/join-by-code").set(auth("a")).send({ inviteCode: "FULL0001" })).status).toBe(409);
    expect((await request(a).post("/api/v1/contests/join-by-code").set(auth("a")).send({ inviteCode: "" })).status).toBe(400);
  });
});

describe("DELETE /api/v1/contests/:id", () => {
  it("only the creator can delete", async () => {
    const id = await seedContest();
    expect((await request(app()).delete(`/api/v1/contests/${id}`)).status).toBe(401);
    expect((await request(app()).delete(`/api/v1/contests/${id}`).set(auth("x"))).status).toBe(403);
    expect(await Contest.countDocuments()).toBe(1);
    expect((await request(app()).delete(`/api/v1/contests/${id}`).set(auth("owner"))).status).toBe(204);
    expect(await Contest.countDocuments()).toBe(0);
    expect((await request(app()).delete(`/api/v1/contests/${id}`).set(auth("owner"))).status).toBe(404);
  });
});
