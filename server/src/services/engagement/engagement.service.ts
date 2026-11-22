/**
 * Daily challenge, streaks, streak freezes and achievements (SFCode parity,
 * Phase A). Computed on read from submissions and store purchases with the
 * pure rules in @dwcode/shared, so nothing is stored and nothing needs a
 * backfill. The one write is the daily bonus, paid after an Accepted verdict.
 */
import {
  COIN_RULES,
  achievementsFor,
  dailySlugFor,
  freezesOwned,
  newlyEarned,
  streaks,
  utcDay,
  type AcceptedRewards,
  type Achievement,
  type SolvedProblem,
  type StreakView,
} from "@dwcode/shared";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { ContestQueryRepository } from "../../repositories/contest.repository.ts";
import type { ProblemCatalogRepository } from "../../repositories/problemCatalog.repository.ts";
import type { StorePurchaseRepository } from "../../repositories/storePurchase.repository.ts";
import type { SubmissionRepository, SubmissionSummary } from "../../repositories/submission.repository.ts";
import type { Clock } from "../../types/ports.ts";
import type { Notifier } from "../notifications/notification.service.ts";

/** Enough history for every streak and achievement rule. */
const HISTORY_LIMIT = 5000;
/** The catalogue changes rarely; one read a minute is plenty. */
const CATALOG_TTL_MS = 60_000;

interface CatalogEntry {
  slug: string;
  title: string;
  difficulty: string;
  category: string;
}

export interface DailyView {
  day: string;
  /** When the next daily challenge starts (UTC midnight). */
  resetsAt: string;
  problem: CatalogEntry | null;
  bonus: number;
  /** Signed-in only: whether this user has already solved today's challenge. */
  solved?: boolean;
}

export interface ProgressView {
  streak: StreakView;
  freezesOwned: number;
  dailyChallengesDone: number;
  achievements: Achievement[];
}

export type { AcceptedRewards } from "@dwcode/shared";

export class EngagementService {
  private catalogCache: { at: number; entries: CatalogEntry[] } | null = null;

  constructor(
    private readonly catalog: ProblemCatalogRepository,
    private readonly submissions: SubmissionRepository,
    private readonly purchases: StorePurchaseRepository,
    private readonly coins: CoinsRepository,
    private readonly contests: ContestQueryRepository,
    private readonly clock: Clock,
    private readonly notifier?: Notifier,
  ) {}

  private async entries(): Promise<CatalogEntry[]> {
    const now = this.clock.nowMs();
    if (this.catalogCache && now - this.catalogCache.at < CATALOG_TTL_MS) return this.catalogCache.entries;
    const rows = (await this.catalog.list({})) as unknown as Partial<CatalogEntry>[];
    const entries = rows
      .filter((r): r is CatalogEntry => typeof r.slug === "string")
      .map((r) => ({ slug: r.slug, title: r.title ?? r.slug, difficulty: r.difficulty ?? "", category: r.category ?? "" }));
    this.catalogCache = { at: now, entries };
    return entries;
  }

  async daily(userId: string | undefined): Promise<DailyView> {
    const now = this.clock.now();
    const day = utcDay(now);
    const entries = await this.entries();
    const slug = dailySlugFor(day, entries.map((e) => e.slug));
    const problem = entries.find((e) => e.slug === slug) ?? null;
    const resetsAt = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString();
    const view: DailyView = { day, resetsAt, problem, bonus: COIN_RULES.dailyChallenge };
    if (userId && problem) {
      const mine = await this.submissions.listByUser(userId, HISTORY_LIMIT, problem.slug);
      view.solved = mine.some((s) => s.status === "Accepted" && utcDay(s.createdAt) === day);
    }
    return view;
  }

  async progress(userId: string): Promise<ProgressView> {
    const [history, owned, entries, entered] = await Promise.all([
      this.submissions.listByUser(userId, HISTORY_LIMIT),
      this.purchases.ownedItemIds(userId),
      this.entries(),
      this.contestsEntered(userId),
    ]);
    return this.compute(history, freezesOwned(owned), entries, entered);
  }

  /**
   * After an Accepted verdict has been recorded: pay the daily bonus if this
   * is the user's first Accepted solve of today's challenge, and report what
   * the solve unlocked. Two concurrent first solves can each see the other and
   * both skip the bonus — under-paying, never paying twice.
   */
  async rewardAccepted(userId: string, problemSlug: string, submissionId: string): Promise<AcceptedRewards> {
    const [history, owned, entries, entered] = await Promise.all([
      this.submissions.listByUser(userId, HISTORY_LIMIT),
      this.purchases.ownedItemIds(userId),
      this.entries(),
      this.contestsEntered(userId),
    ]);
    const day = utcDay(this.clock.now());
    let dailyBonus = 0;
    if (dailySlugFor(day, entries.map((e) => e.slug)) === problemSlug) {
      const acceptedToday = history.filter(
        (s) => s.problemSlug === problemSlug && s.status === "Accepted" && utcDay(s.createdAt) === day,
      );
      if (acceptedToday.length === 1 && acceptedToday[0]?._id === submissionId) {
        await this.coins.award(userId, COIN_RULES.dailyChallenge, "daily_challenge", `Daily challenge: ${problemSlug}`);
        dailyBonus = COIN_RULES.dailyChallenge;
      }
    }
    const freezes = freezesOwned(owned);
    const before = this.compute(history.filter((s) => s._id !== submissionId), freezes, entries, entered);
    const after = this.compute(history, freezes, entries, entered);
    const unlocked = newlyEarned(before.achievements, after.achievements);
    if (this.notifier) {
      if (dailyBonus > 0) {
        await this.notifier.notify(userId, {
          kind: "daily_bonus",
          title: `Daily challenge solved: +${dailyBonus} coins`,
          link: `/problems/${encodeURIComponent(problemSlug)}`,
        });
      }
      for (const a of unlocked) {
        await this.notifier.notify(userId, { kind: "achievement", title: `Achievement unlocked: ${a.title}`, body: a.description, link: "/profile" });
      }
    }
    return { dailyBonus, unlocked };
  }

  private async contestsEntered(userId: string): Promise<number> {
    const visible = await this.contests.list(userId);
    return visible.filter((c) => {
      const participants = (c as { participants?: { userId?: string }[] }).participants ?? [];
      return participants.some((p) => p.userId === userId);
    }).length;
  }

  private compute(history: SubmissionSummary[], freezes: number, entries: CatalogEntry[], contestsEntered: number): ProgressView {
    const bySlug = new Map(entries.map((e) => [e.slug, e]));
    const slugs = entries.map((e) => e.slug);
    const activeDays = new Set(history.map((s) => utcDay(s.createdAt)));
    const solved = new Map<string, SolvedProblem>();
    const dailyDays = new Set<string>();
    for (const s of history) {
      if (s.status !== "Accepted") continue;
      const entry = bySlug.get(s.problemSlug);
      solved.set(s.problemSlug, { slug: s.problemSlug, difficulty: entry?.difficulty ?? "", category: entry?.category ?? "" });
      const day = utcDay(s.createdAt);
      if (dailySlugFor(day, slugs) === s.problemSlug) dailyDays.add(day);
    }
    const streak = streaks(activeDays, utcDay(this.clock.now()), freezes);
    return {
      streak,
      freezesOwned: freezes,
      dailyChallengesDone: dailyDays.size,
      achievements: achievementsFor({
        solved: [...solved.values()],
        longestStreak: streak.longest,
        dailyChallengesDone: dailyDays.size,
        contestsEntered,
      }),
    };
  }
}
