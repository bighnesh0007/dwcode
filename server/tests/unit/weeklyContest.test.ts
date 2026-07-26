/**
 * WeeklyContestService: slot math, idempotency and problem sampling — pure unit
 * tests with fake repositories and a fixed clock, no database.
 */
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import type { ContestCreateInput } from "../../src/repositories/contest.repository.ts";
import type { SampledProblem } from "../../src/repositories/problem.repository.ts";
import { WeeklyContestService } from "../../src/services/contest/weeklyContest.service.ts";
import type { Clock } from "../../src/types/ports.ts";

// Verified against a calendar: 2026-07-22 is a Wednesday; 2026-07-25,
// 2026-08-01 and 2026-08-08 are Saturdays.

function fixedClock(at: Date): Clock {
  return { now: () => at, nowMs: () => at.getTime() };
}

function problem(difficulty: string, slug: string): SampledProblem {
  return { _id: new mongoose.Types.ObjectId(), slug, difficulty };
}

class FakeContestRepository {
  readonly created: ContestCreateInput[] = [];
  readonly existingKeys = new Set<string>();
  failCreateWith: Error | undefined;
  ensureIndexesCalls = 0;

  ensureIndexes(): Promise<void> {
    this.ensureIndexesCalls += 1;
    return Promise.resolve();
  }

  existsBySeriesKey(key: string): Promise<boolean> {
    return Promise.resolve(this.existingKeys.has(key));
  }

  create(doc: ContestCreateInput): Promise<void> {
    if (this.failCreateWith) return Promise.reject(this.failCreateWith);
    this.created.push(doc);
    this.existingKeys.add(doc.seriesKey);
    return Promise.resolve();
  }
}

class FakeProblemRepository {
  constructor(readonly pool: SampledProblem[] = []) {}

  sampleByDifficulty(difficulty: string, n: number): Promise<SampledProblem[]> {
    return Promise.resolve(
      this.pool.filter((p) => p.difficulty === difficulty).slice(0, n),
    );
  }

  sampleAny(n: number, excludeIds: mongoose.Types.ObjectId[]): Promise<SampledProblem[]> {
    const excluded = new Set(excludeIds.map(String));
    return Promise.resolve(
      this.pool.filter((p) => !excluded.has(String(p._id))).slice(0, n),
    );
  }
}

function build(opts: {
  now: Date;
  pool?: SampledProblem[];
  contestRepo?: FakeContestRepository;
}): { service: WeeklyContestService; contestRepo: FakeContestRepository } {
  const contestRepo = opts.contestRepo ?? new FakeContestRepository();
  const service = new WeeklyContestService(
    contestRepo,
    new FakeProblemRepository(opts.pool ?? []),
    fixedClock(opts.now),
  );
  return { service, contestRepo };
}

const fullPool = [
  problem("Easy", "easy-1"),
  problem("Medium", "medium-1"),
  problem("Medium", "medium-2"),
  problem("Hard", "hard-1"),
];

describe("nextSlot", () => {
  it("from a Wednesday returns that week's Saturday 15:00 UTC", () => {
    const now = new Date("2026-07-22T10:30:00.000Z");
    const { service } = build({ now });
    expect(service.nextSlot(now).toISOString()).toBe("2026-07-25T15:00:00.000Z");
  });

  it("from Saturday 14:59 UTC returns the same day at 15:00", () => {
    const now = new Date("2026-07-25T14:59:00.000Z");
    const { service } = build({ now });
    expect(service.nextSlot(now).toISOString()).toBe("2026-07-25T15:00:00.000Z");
  });

  it("from EXACTLY Saturday 15:00:00.000 returns NEXT week's slot (strictly after)", () => {
    const now = new Date("2026-07-25T15:00:00.000Z");
    const { service } = build({ now });
    expect(service.nextSlot(now).toISOString()).toBe("2026-08-01T15:00:00.000Z");
  });

  it("from Saturday 16:00 UTC returns next week's Saturday 15:00", () => {
    const now = new Date("2026-07-25T16:00:00.000Z");
    const { service } = build({ now });
    expect(service.nextSlot(now).toISOString()).toBe("2026-08-01T15:00:00.000Z");
  });
});

describe("seriesKeyFor", () => {
  it("is weekly-YYYY-MM-DD of the slot's UTC date", () => {
    const { service } = build({ now: new Date("2026-07-22T00:00:00.000Z") });
    expect(service.seriesKeyFor(new Date("2026-08-01T15:00:00.000Z"))).toBe(
      "weekly-2026-08-01",
    );
  });
});

describe("ensureUpcoming", () => {
  const wednesday = new Date("2026-07-22T10:30:00.000Z");

  it("creates the next weekly contest when it does not exist", async () => {
    const { service, contestRepo } = build({ now: wednesday, pool: fullPool });

    const result = await service.ensureUpcoming();

    expect(result).toEqual({
      created: true,
      seriesKey: "weekly-2026-07-25",
      startTime: new Date("2026-07-25T15:00:00.000Z"),
      problemCount: 4,
    });

    expect(contestRepo.created).toHaveLength(1);
    const doc = contestRepo.created[0]!;
    expect(doc.seriesKey).toBe("weekly-2026-07-25");
    expect(doc.title).toBe("DWCode Weekly Contest — 2026-07-25");
    expect(doc.createdBy).toBe("system:weekly");
    expect(doc.createdByName).toBe("DWCode Weekly");
    expect(doc.isPublic).toBe(true);
    expect(doc.status).toBe("upcoming");
    expect(doc.maxParticipants).toBe(500);
    expect(doc.participants).toEqual([]);
    expect(doc.problems).toHaveLength(4);
    expect(doc.problemSlugs).toHaveLength(4);
    expect(new Set(doc.problemSlugs)).toEqual(
      new Set(["easy-1", "medium-1", "medium-2", "hard-1"]),
    );
    expect(doc.startTime.toISOString()).toBe("2026-07-25T15:00:00.000Z");
    expect(doc.duration).toBe(120);
    expect(doc.endTime.getTime() - doc.startTime.getTime()).toBe(120 * 60 * 1000);
  });

  it("returns { created: false, reason: 'exists' } when the slot is already scheduled", async () => {
    const { service, contestRepo } = build({ now: wednesday, pool: fullPool });

    await service.ensureUpcoming();
    const second = await service.ensureUpcoming();

    expect(second).toEqual({ created: false, reason: "exists" });
    expect(contestRepo.created).toHaveLength(1);
  });

  it("backfills short difficulty buckets from the whole pool", async () => {
    // No Hard problems at all — the mix wants 4, so one extra Medium backfills.
    const pool = [
      problem("Easy", "easy-1"),
      problem("Medium", "medium-1"),
      problem("Medium", "medium-2"),
      problem("Medium", "medium-3"),
    ];
    const { service, contestRepo } = build({ now: wednesday, pool });

    const result = await service.ensureUpcoming();

    expect(result.created).toBe(true);
    const doc = contestRepo.created[0]!;
    expect(doc.problemSlugs).toHaveLength(4);
    // Dedupe holds even though sampleAny sees the already-picked ids.
    expect(new Set(doc.problemSlugs).size).toBe(4);
  });

  it("skips (and never calls create) when there are not enough problems", async () => {
    const { service, contestRepo } = build({
      now: wednesday,
      pool: [problem("Easy", "lonely-easy")], // below minProblems = 2
    });

    const result = await service.ensureUpcoming();

    expect(result).toEqual({ created: false, reason: "not_enough_problems" });
    expect(contestRepo.created).toHaveLength(0);
  });

  it("treats a duplicate-key error from create as losing the race, without throwing", async () => {
    const contestRepo = new FakeContestRepository();
    contestRepo.failCreateWith = Object.assign(
      new Error("E11000 duplicate key error collection: contests index: seriesKey_1"),
      { code: 11000 },
    );
    const { service } = build({ now: wednesday, pool: fullPool, contestRepo });

    const result = await service.ensureUpcoming();

    expect(result).toEqual({ created: false, reason: "race_lost" });
  });

  it("rethrows non-duplicate-key errors from create", async () => {
    const contestRepo = new FakeContestRepository();
    contestRepo.failCreateWith = new Error("connection reset");
    const { service } = build({ now: wednesday, pool: fullPool, contestRepo });

    await expect(service.ensureUpcoming()).rejects.toThrow("connection reset");
  });

  it("provisions indexes exactly once across repeated checks, before any create", async () => {
    // Regression: db/connection.ts disables autoIndex in production, so the
    // seriesKey unique index — the duplicate-creation race guard — must be
    // built deliberately. Without ensureIndexes the guard was dead code in prod.
    const contestRepo = new FakeContestRepository();
    const { service } = build({ now: wednesday, pool: fullPool, contestRepo });

    await service.ensureUpcoming();
    await service.ensureUpcoming();
    await service.ensureUpcoming();

    expect(contestRepo.ensureIndexesCalls).toBe(1);
    expect(contestRepo.created).toHaveLength(1);
  });

  it("does not create a contest when index provisioning fails", async () => {
    const contestRepo = new FakeContestRepository();
    contestRepo.ensureIndexes = () => Promise.reject(new Error("index build failed"));
    const { service } = build({ now: wednesday, pool: fullPool, contestRepo });

    await expect(service.ensureUpcoming()).rejects.toThrow("index build failed");
    expect(contestRepo.created).toHaveLength(0);
  });
});
