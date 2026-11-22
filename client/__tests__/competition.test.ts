import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_TIERS,
  INITIAL_RATING,
  RATING_TIERS,
  WRONG_ATTEMPT_PENALTY_MIN,
  contestPointsFor,
  contestStandings,
  ratingTierFor,
  replayRatings,
} from "@dwcode/shared";

const EASY = DIFFICULTY_TIERS[0]?.id ?? "";
const HARD = DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1]?.id ?? "";
const start = new Date("2026-11-22T10:00:00Z");
const end = new Date("2026-11-22T11:30:00Z");
const at = (m: number) => new Date(start.getTime() + m * 60_000);
const problems = [{ slug: "a", difficulty: EASY }, { slug: "b", difficulty: HARD }];

describe("contest standings", () => {
  it("scores points from the registry, with time plus wrong-attempt penalty", () => {
    const rows = contestStandings(["u1", "u2"], problems, [
      { userId: "u1", problemSlug: "a", status: "Attempted", createdAt: at(3) },
      { userId: "u1", problemSlug: "a", status: "Accepted", createdAt: at(10) },
      { userId: "u2", problemSlug: "b", status: "Accepted", createdAt: at(40) },
    ], start, end);
    expect(rows.map((r) => r.userId)).toEqual(contestPointsFor(HARD) > contestPointsFor(EASY) ? ["u2", "u1"] : ["u1", "u2"]);
    const u1 = rows.find((r) => r.userId === "u1");
    expect(u1).toMatchObject({ solved: 1, points: contestPointsFor(EASY), penalty: 10 + WRONG_ATTEMPT_PENALTY_MIN });
    expect(u1?.problems.a).toEqual({ solvedAt: 10, wrong: 1 });
  });

  it("ignores submissions outside the window, from non-participants, compiler errors, and repeats", () => {
    const rows = contestStandings(["u1"], problems, [
      { userId: "u1", problemSlug: "a", status: "Accepted", createdAt: at(-1) },
      { userId: "u1", problemSlug: "a", status: "Error", createdAt: at(1) },
      { userId: "u1", problemSlug: "a", status: "Accepted", createdAt: at(5) },
      { userId: "u1", problemSlug: "a", status: "Accepted", createdAt: at(6) },
      { userId: "u1", problemSlug: "b", status: "Accepted", createdAt: at(200) },
      { userId: "x", problemSlug: "a", status: "Accepted", createdAt: at(1) },
    ], start, end);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ solved: 1, penalty: 5, problems: { a: { solvedAt: 5, wrong: 0 } } });
  });

  it("gives equal rows the same rank, and lists entrants who solved nothing", () => {
    const rows = contestStandings(["u1", "u2", "u3"], problems, [
      { userId: "u1", problemSlug: "a", status: "Accepted", createdAt: at(10) },
      { userId: "u2", problemSlug: "a", status: "Accepted", createdAt: at(10) },
    ], start, end);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });
});

describe("rating", () => {
  const placing = (id: string, day: number, ranks: [string, number][]) => ({
    contestId: id, endedAt: new Date(Date.UTC(2026, 0, day)), ranks: new Map(ranks),
  });

  it("starts everyone at the initial rating and moves the winner up, the loser down, by at most K", () => {
    const h = replayRatings([placing("c1", 1, [["a", 1], ["b", 2]])]);
    const a = h.get("a")?.[0];
    const b = h.get("b")?.[0];
    expect(a && a.rating > INITIAL_RATING).toBe(true);
    expect(b && b.rating < INITIAL_RATING).toBe(true);
    expect(Math.abs(a?.delta ?? 0)).toBeLessThanOrEqual(32);
  });

  it("replays in time order, and skips contests with a single entrant", () => {
    const h = replayRatings([
      placing("late", 5, [["a", 2], ["b", 1]]),
      placing("solo", 3, [["a", 1]]),
      placing("early", 1, [["a", 1], ["b", 2]]),
    ]);
    expect(h.get("a")?.map((p) => p.contestId)).toEqual(["early", "late"]);
  });

  it("treats a tie as half a win", () => {
    const h = replayRatings([placing("c", 1, [["a", 1], ["b", 1]])]);
    expect(h.get("a")?.[0]?.delta).toBe(0);
  });

  it("maps ratings to tiers, highest first", () => {
    expect(ratingTierFor(INITIAL_RATING).id).toBe("specialist");
    expect(ratingTierFor(9999).id).toBe(RATING_TIERS[0]?.id);
    expect(ratingTierFor(0).id).toBe("newcomer");
  });
});
