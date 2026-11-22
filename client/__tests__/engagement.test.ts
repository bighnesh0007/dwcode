import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  DIFFICULTY_TIERS,
  STREAK_FREEZES,
  achievementsFor,
  dailySlugFor,
  freezesOwned,
  newlyEarned,
  streaks,
  utcDay,
} from "@dwcode/shared";

describe("daily challenge pick", () => {
  const slugs = ["a", "b", "c", "d", "e", "f", "g"];

  it("is the same for everyone on a day, whatever order the slugs arrive in", () => {
    const day = "2026-11-22";
    expect(dailySlugFor(day, slugs)).toBe(dailySlugFor(day, [...slugs].reverse()));
  });

  it("moves between days and stays within the catalogue", () => {
    const picks = new Set<string | null>();
    for (let d = 1; d <= 28; d++) picks.add(dailySlugFor(`2026-02-${String(d).padStart(2, "0")}`, slugs));
    expect(picks.size).toBeGreaterThan(3);
    for (const p of picks) expect(slugs).toContain(p);
  });

  it("has no pick for an empty catalogue", () => {
    expect(dailySlugFor("2026-11-22", [])).toBeNull();
  });

  it("uses UTC day boundaries", () => {
    expect(utcDay(new Date("2026-11-22T23:59:59Z"))).toBe("2026-11-22");
    expect(utcDay(new Date("2026-11-23T00:00:00Z"))).toBe("2026-11-23");
  });
});

describe("streaks", () => {
  it("counts a run ending today, and keeps it alive before today's first submission", () => {
    expect(streaks(["2026-11-20", "2026-11-21", "2026-11-22"], "2026-11-22").current).toBe(3);
    expect(streaks(["2026-11-20", "2026-11-21"], "2026-11-22").current).toBe(2);
  });

  it("breaks after a full missed day, but remembers the longest run", () => {
    const s = streaks(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-20"], "2026-11-22");
    expect(s.current).toBe(0);
    expect(s.longest).toBe(3);
  });

  it("bridges one missed day per owned freeze, without counting it", () => {
    const days = ["2026-11-18", "2026-11-19", "2026-11-21", "2026-11-22"];
    expect(streaks(days, "2026-11-22", 0)).toMatchObject({ current: 2, freezesUsed: 0 });
    expect(streaks(days, "2026-11-22", 1)).toMatchObject({ current: 4, freezesUsed: 1 });
  });

  it("never spends a freeze to start a streak that does not exist", () => {
    expect(streaks(["2026-11-19"], "2026-11-22", 2)).toMatchObject({ current: 0, freezesUsed: 0 });
  });
});

describe("streak freezes in the store", () => {
  it("counts only freeze items among owned ids", () => {
    expect(freezesOwned(["midnight-mule", STREAK_FREEZES[0].id])).toBe(1);
    expect(freezesOwned(STREAK_FREEZES.map((f) => f.id))).toBe(STREAK_FREEZES.length);
  });
});

describe("achievements", () => {
  const empty = { solved: [], longestStreak: 0, dailyChallengesDone: 0, contestsEntered: 0 };

  it("has unique ids, and one tier achievement per difficulty in the registry", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tier of DIFFICULTY_TIERS) expect(ids).toContain(`tier-${tier.id.toLowerCase()}`);
  });

  it("earns nothing at zero and reports progress capped at the target", () => {
    const list = achievementsFor({ ...empty, longestStreak: 40 });
    expect(list.find((a) => a.id === "first-solve")?.earned).toBe(false);
    expect(list.find((a) => a.id === "streak-30")).toMatchObject({ earned: true, progress: { current: 30, target: 30 } });
  });

  it("reports what a solve newly unlocked", () => {
    const tier = DIFFICULTY_TIERS[0].id;
    const before = achievementsFor(empty);
    const after = achievementsFor({ ...empty, solved: [{ slug: "x", difficulty: tier, category: "Maps" }] });
    expect(newlyEarned(before, after).map((a) => a.id)).toEqual(["first-solve", `tier-${tier.toLowerCase()}`]);
  });
});
