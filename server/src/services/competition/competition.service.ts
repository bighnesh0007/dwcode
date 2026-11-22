/**
 * Contest standings, ratings, and the contest events job (SFCode parity,
 * Phase C).
 *
 * Standings are computed on read from the submissions inside a contest's
 * window, ratings are replayed from ended public contests, and the events job
 * sends reminders and pays the top three once per contest, guarded by a
 * claim so several instances or a restart can never pay twice.
 */
import {
  CONTEST_PRIZES,
  contestStandings,
  ratingTierFor,
  replayRatings,
  type ContestPlacing,
  type RatingPoint,
  type StandingRow,
} from "@dwcode/shared";
import { ForbiddenError, NotFoundError } from "../../errors/AppError.ts";
import { contextLogger, logEvent } from "../../lib/logger.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { CompetitionRepository, ContestSnapshot } from "../../repositories/competition.repository.ts";
import type { Clock } from "../../types/ports.ts";
import type { Notifier } from "../notifications/notification.service.ts";

const RATING_TTL_MS = 5 * 60_000;
const REMIND_BEFORE_MS = 30 * 60_000;
/** Ended contests older than this are not finalized retroactively. */
const FINALIZE_WINDOW_MS = 7 * 24 * 60 * 60_000;
const EVENTS_INTERVAL_MS = 5 * 60_000;

export interface StandingsView {
  contestId: string;
  title: string;
  status: "upcoming" | "active" | "ended";
  startTime: string;
  endTime: string;
  problems: { slug: string; title: string; difficulty: string }[];
  rows: (StandingRow & { userName: string; userImageUrl: string })[];
}

export interface RatingRow {
  rank: number;
  userId: string;
  userName: string;
  rating: number;
  tier: string;
  contests: number;
}

export class CompetitionService {
  private ratingCache: { at: number; history: Map<string, RatingPoint[]>; names: Map<string, string> } | null = null;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repo: CompetitionRepository,
    private readonly coins: CoinsRepository,
    private readonly clock: Clock,
    private readonly notifier?: Notifier,
  ) {}

  private status(c: ContestSnapshot): StandingsView["status"] {
    const now = this.clock.nowMs();
    if (now < c.startTime.getTime()) return "upcoming";
    if (now > c.endTime.getTime()) return "ended";
    return "active";
  }

  private async compute(c: ContestSnapshot): Promise<StandingsView["rows"]> {
    const end = new Date(Math.min(c.endTime.getTime(), this.clock.nowMs()));
    if (end.getTime() < c.startTime.getTime()) return [];
    const subs = await this.repo.submissionsInWindow(c.problems.map((p) => p.slug), c.startTime, end);
    const byUser = new Map(c.participants.map((p) => [p.userId, p]));
    return contestStandings(c.participants.map((p) => p.userId), c.problems, subs, c.startTime, end).map((row) => ({
      ...row,
      userName: byUser.get(row.userId)?.userName ?? "",
      userImageUrl: byUser.get(row.userId)?.userImageUrl ?? "",
    }));
  }

  /** Live standings; a private contest only for its creator and participants. */
  async standings(contestId: string, viewerId: string | undefined): Promise<StandingsView> {
    const c = await this.repo.contest(contestId);
    if (!c) throw new NotFoundError("Contest not found.");
    if (!c.isPublic && c.createdBy !== viewerId && !c.participants.some((p) => p.userId === viewerId)) {
      throw new ForbiddenError("Invite required.");
    }
    return {
      contestId: c.id,
      title: c.title,
      status: this.status(c),
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
      problems: c.problems,
      rows: await this.compute(c),
    };
  }

  private async ratings() {
    const now = this.clock.nowMs();
    if (this.ratingCache && now - this.ratingCache.at < RATING_TTL_MS) return this.ratingCache;
    const ended = (await this.repo.publicContests()).filter((c) => c.endTime.getTime() < now);
    const placings: ContestPlacing[] = [];
    const names = new Map<string, string>();
    for (const c of ended) {
      // Only entrants who submitted something are rated: joining and leaving is not a result.
      const rows = (await this.compute(c)).filter((r) => Object.keys(r.problems).length > 0);
      for (const r of rows) if (r.userName) names.set(r.userId, r.userName);
      placings.push({ contestId: c.id, endedAt: c.endTime, ranks: new Map(rows.map((r) => [r.userId, r.rank])) });
    }
    this.ratingCache = { at: now, history: replayRatings(placings), names };
    return this.ratingCache;
  }

  async ratingLeaderboard(limit = 100): Promise<RatingRow[]> {
    const { history, names } = await this.ratings();
    return [...history.entries()]
      .map(([userId, points]) => ({ userId, rating: points[points.length - 1]?.rating ?? 0, contests: points.length }))
      .sort((a, b) => b.rating - a.rating || b.contests - a.contests || a.userId.localeCompare(b.userId))
      .slice(0, limit)
      .map((r, i) => ({ rank: i + 1, userId: r.userId, userName: names.get(r.userId) ?? "", rating: r.rating, tier: ratingTierFor(r.rating).id, contests: r.contests }));
  }

  async ratingFor(userId: string): Promise<{ rating: number | null; tier: string | null; history: RatingPoint[] }> {
    const points = (await this.ratings()).history.get(userId) ?? [];
    const last = points[points.length - 1];
    return { rating: last?.rating ?? null, tier: last ? ratingTierFor(last.rating).id : null, history: points };
  }

  /** One pass of the events job: reminders for contests about to start, results for ended ones. */
  async runEvents(): Promise<{ reminded: number; finalized: number }> {
    const now = this.clock.nowMs();
    let reminded = 0;
    let finalized = 0;
    for (const c of await this.repo.publicContests()) {
      const start = c.startTime.getTime();
      const end = c.endTime.getTime();
      if (start > now && start - now <= REMIND_BEFORE_MS && (await this.repo.claim(`contest-reminder:${c.id}`))) {
        reminded++;
        for (const p of c.participants) {
          await this.notifier?.notify(p.userId, {
            kind: "contest_reminder",
            title: `${c.title} starts in ${Math.max(1, Math.round((start - now) / 60_000))} minutes`,
            link: `/contests/${c.id}`,
          });
        }
      }
      if (end < now && now - end <= FINALIZE_WINDOW_MS && (await this.repo.claim(`contest-final:${c.id}`))) {
        finalized++;
        await this.finalize(c);
      }
    }
    return { reminded, finalized };
  }

  private async finalize(c: ContestSnapshot): Promise<void> {
    const rows = await this.compute(c);
    for (const row of rows) {
      const prize = row.solved > 0 ? (CONTEST_PRIZES[row.rank - 1] ?? 0) : 0;
      if (prize > 0) {
        try {
          await this.coins.award(row.userId, prize, "contest_prize", `${c.title}: #${row.rank}`);
        } catch (err) {
          contextLogger().error({ err, contestId: c.id, userId: row.userId }, "[contests] prize award failed");
        }
      }
      await this.notifier?.notify(row.userId, {
        kind: "contest_result",
        title: `${c.title}: you finished #${row.rank} of ${rows.length}`,
        body: prize > 0 ? `+${prize} coins` : `${row.solved} solved`,
        link: `/contests/${c.id}`,
      });
    }
    this.ratingCache = null;
    logEvent("contest.finalized", { contestId: c.id, entrants: rows.length });
  }

  startScheduler(): void {
    if (this.timer) return;
    const tick = () => {
      this.runEvents().catch((err: unknown) => contextLogger().warn({ err }, "[contests] events tick failed"));
    };
    tick();
    this.timer = setInterval(tick, EVENTS_INTERVAL_MS);
    this.timer.unref();
  }

  stopScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
