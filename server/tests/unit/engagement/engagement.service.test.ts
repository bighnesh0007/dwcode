/** EngagementService on stub repositories: the daily bonus and what a solve unlocks. */
import { describe, expect, it, vi } from "vitest";
import { COIN_RULES, dailySlugFor, utcDay } from "@dwcode/shared";
import { EngagementService } from "../../../src/services/engagement/engagement.service.ts";
import type { SubmissionSummary } from "../../../src/repositories/submission.repository.ts";

const NOW = new Date("2026-11-22T12:00:00Z");
const TODAY = utcDay(NOW);
const CATALOG = ["alpha", "bravo", "charlie", "delta", "echo"].map((slug) => ({
  slug, title: slug, difficulty: "Easy", category: slug === "alpha" ? "Maps" : "Strings",
}));
const DAILY = dailySlugFor(TODAY, CATALOG.map((c) => c.slug))!;
const OTHER = CATALOG.find((c) => c.slug !== DAILY)?.slug ?? "";

function sub(id: string, slug: string, status: string, at: Date = NOW): SubmissionSummary {
  return { _id: id, problemId: "p", problemSlug: slug, status, executionTime: "1ms", createdAt: at, code: "x", output: "" };
}

function service(history: SubmissionSummary[], owned: string[] = []) {
  const award = vi.fn(() => Promise.resolve());
  const notify = vi.fn(() => Promise.resolve());
  const svc = new EngagementService(
    { list: () => Promise.resolve(CATALOG) } as never,
    { listByUser: (_u: string, _l: number, slug?: string) => Promise.resolve(slug ? history.filter((h) => h.problemSlug === slug) : history) } as never,
    { ownedItemIds: () => Promise.resolve(owned) } as never,
    { award } as never,
    { list: () => Promise.resolve([]) } as never,
    { now: () => NOW, nowMs: () => NOW.getTime() },
    { notify },
  );
  return { svc, award, notify };
}

describe("daily challenge", () => {
  it("is the same deterministic pick the shared rule makes", async () => {
    const { svc } = service([]);
    const view = await svc.daily(undefined);
    expect(view).toMatchObject({ day: TODAY, problem: { slug: DAILY }, bonus: COIN_RULES.dailyChallenge });
    expect(view.resetsAt).toBe("2026-11-23T00:00:00.000Z");
    expect(view).not.toHaveProperty("solved");
  });

  it("tells a signed-in user whether they solved it today", async () => {
    expect((await service([sub("1", DAILY, "Attempted")]).svc.daily("u")).solved).toBe(false);
    expect((await service([sub("1", DAILY, "Accepted")]).svc.daily("u")).solved).toBe(true);
  });
});

describe("rewards after an Accepted verdict", () => {
  it("pays the daily bonus on the first Accepted solve of today's challenge, and notifies", async () => {
    const { svc, award, notify } = service([sub("s1", DAILY, "Accepted")]);
    const rewards = await svc.rewardAccepted("u", DAILY, "s1");
    expect(rewards.dailyBonus).toBe(COIN_RULES.dailyChallenge);
    expect(award).toHaveBeenCalledWith("u", COIN_RULES.dailyChallenge, "daily_challenge", expect.any(String));
    expect(notify).toHaveBeenCalledWith("u", expect.objectContaining({ kind: "daily_bonus" }));
  });

  it("pays it once per day, not again for a second Accepted solve", async () => {
    const { svc, award } = service([sub("s2", DAILY, "Accepted"), sub("s1", DAILY, "Accepted")]);
    expect((await svc.rewardAccepted("u", DAILY, "s2")).dailyBonus).toBe(0);
    expect(award).not.toHaveBeenCalled();
  });

  it("pays nothing for a problem that is not today's challenge", async () => {
    const { svc, award } = service([sub("s1", OTHER, "Accepted")]);
    expect((await svc.rewardAccepted("u", OTHER, "s1")).dailyBonus).toBe(0);
    expect(award).not.toHaveBeenCalled();
  });

  it("reports the achievements this solve unlocked, and only those", async () => {
    const first = await service([sub("s1", OTHER, "Accepted")]).svc.rewardAccepted("u", OTHER, "s1");
    expect(first.unlocked.map((a) => a.id)).toContain("first-solve");

    const again = await service([sub("s2", OTHER, "Accepted"), sub("s1", OTHER, "Accepted", new Date("2026-11-21T09:00:00Z"))])
      .svc.rewardAccepted("u", OTHER, "s2");
    expect(again.unlocked.map((a) => a.id)).not.toContain("first-solve");
  });
});

describe("progress", () => {
  it("counts freezes bought in the store toward the streak", async () => {
    const days = [new Date("2026-11-19T10:00Z"), new Date("2026-11-20T10:00Z"), new Date("2026-11-22T10:00Z")];
    const history = days.map((d, i) => sub(String(i), OTHER, "Attempted", d));
    expect((await service(history).svc.progress("u")).streak.current).toBe(1);
    const withFreeze = await service(history, ["streak-freeze-1"]).svc.progress("u");
    expect(withFreeze).toMatchObject({ freezesOwned: 1, streak: { current: 3, freezesUsed: 1 } });
  });

  it("counts daily challenges solved on their own day", async () => {
    const p = await service([sub("1", DAILY, "Accepted")]).svc.progress("u");
    expect(p.dailyChallengesDone).toBe(1);
    expect(p.achievements.find((a) => a.id === "daily-1")?.earned).toBe(true);
  });
});
