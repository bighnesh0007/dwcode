/**
 * Auto-schedules the public weekly contest.
 *
 * Every check finds the NEXT weekly slot (Saturday 15:00 UTC by default) and makes
 * sure a contest exists for it, sampling random problems per the configured
 * difficulty mix. Idempotency is the `seriesKey` unique index: the existence check
 * is a cheap fast path, and the duplicate-key error on create is the real guard
 * when several instances race.
 *
 * The scheduler mirrors UpstreamHealthService: started only from server.ts, timer
 * `unref()`d so it never keeps the process (or a test run) alive.
 */
import { WEEKLY_CONTEST, DIFFICULTIES, type Difficulty } from "../../config/constants.ts";
import { contextLogger, logEvent } from "../../lib/logger.ts";
import type { ContestRepository } from "../../repositories/contest.repository.ts";
import type { ProblemRepository, SampledProblem } from "../../repositories/problem.repository.ts";
import type { Clock } from "../../types/ports.ts";
import { systemClock } from "../../types/ports.ts";

/** WEEKLY_CONTEST's shape, widened so tests can pass a custom configuration. */
export interface WeeklyContestConfig {
  dayOfWeekUTC: number;
  hourUTC: number;
  durationMinutes: number;
  maxParticipants: number;
  problemMix: Readonly<Record<Difficulty, number>>;
  minProblems: number;
  checkIntervalMs: number;
}

export type EnsureUpcomingResult =
  | { created: true; seriesKey: string; startTime: Date; problemCount: number }
  | { created: false; reason: "exists" | "not_enough_problems" | "race_lost" };

/** Mongo duplicate-key error — a concurrent instance won the create race. */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000
  );
}

export class WeeklyContestService {
  private timer: NodeJS.Timeout | undefined;
  private indexesEnsured = false;

  constructor(
    private readonly contestRepo: ContestRepository,
    private readonly problemRepo: ProblemRepository,
    private readonly clock: Clock = systemClock,
    private readonly cfg: WeeklyContestConfig = WEEKLY_CONTEST,
  ) {}

  /**
   * The next occurrence of `dayOfWeekUTC` at `hourUTC`:00:00.000 UTC, STRICTLY
   * after `now`. Pure UTC math — no timezone libraries.
   */
  nextSlot(now: Date): Date {
    const daysUntil = (this.cfg.dayOfWeekUTC - now.getUTCDay() + 7) % 7;
    const candidate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntil,
        this.cfg.hourUTC,
        0,
        0,
        0,
      ),
    );
    if (candidate.getTime() <= now.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }
    return candidate;
  }

  /** Idempotency key for the slot, e.g. "weekly-2026-08-01". */
  seriesKeyFor(slot: Date): string {
    return `weekly-${slot.toISOString().slice(0, 10)}`;
  }

  /** Make sure the next weekly slot has a contest. Safe to call repeatedly. */
  async ensureUpcoming(): Promise<EnsureUpcomingResult> {
    const log = contextLogger();

    // The duplicate-key race guard only works if the seriesKey unique index
    // actually exists — and db/connection.ts disables autoIndex in production
    // (review finding: the guard was dead code on Render). Build it explicitly,
    // once per process, BEFORE any create can run. A failure here propagates:
    // scheduling without the guard is worse than retrying on the next tick.
    if (!this.indexesEnsured) {
      await this.contestRepo.ensureIndexes();
      this.indexesEnsured = true;
    }

    const slot = this.nextSlot(this.clock.now());
    const seriesKey = this.seriesKeyFor(slot);

    if (await this.contestRepo.existsBySeriesKey(seriesKey)) {
      log.debug({ seriesKey }, "[weekly-contest] already scheduled");
      return { created: false, reason: "exists" };
    }

    // Draw the ideal mix, then backfill short buckets from the whole pool.
    // Dedupe by _id: $sample draws independently per call, so overlaps happen.
    const picked: SampledProblem[] = [];
    const seen = new Set<string>();
    const addUnique = (problems: SampledProblem[]): void => {
      for (const problem of problems) {
        const id = String(problem._id);
        if (seen.has(id)) continue;
        seen.add(id);
        picked.push(problem);
      }
    };

    let targetTotal = 0;
    for (const difficulty of DIFFICULTIES) {
      const want = this.cfg.problemMix[difficulty];
      targetTotal += want;
      if (want > 0) addUnique(await this.problemRepo.sampleByDifficulty(difficulty, want));
    }
    if (picked.length < targetTotal) {
      addUnique(
        await this.problemRepo.sampleAny(
          targetTotal - picked.length,
          picked.map((problem) => problem._id),
        ),
      );
    }

    if (picked.length < this.cfg.minProblems) {
      logEvent(
        "contest.weekly_skipped",
        { seriesKey, problemCount: picked.length, minProblems: this.cfg.minProblems },
        "warn",
      );
      return { created: false, reason: "not_enough_problems" };
    }

    const dateLabel = slot.toISOString().slice(0, 10);
    const description =
      `Welcome to the DWCode weekly community contest! ` +
      `This round features ${picked.length} randomly selected problems — jump in and see how you rank. ` +
      `Scoring: Hard x5, Medium x3, Easy x1. Good luck!`;

    try {
      await this.contestRepo.create({
        seriesKey,
        title: `DWCode Weekly Contest — ${dateLabel}`,
        description,
        createdBy: "system:weekly",
        createdByName: "DWCode Weekly",
        problems: picked.map((problem) => problem._id),
        problemSlugs: picked.map((problem) => problem.slug),
        startTime: slot,
        endTime: new Date(slot.getTime() + this.cfg.durationMinutes * 60_000),
        duration: this.cfg.durationMinutes,
        status: "upcoming",
        isPublic: true,
        maxParticipants: this.cfg.maxParticipants,
        participants: [],
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        log.info({ seriesKey }, "[weekly-contest] lost the scheduling race to another instance");
        return { created: false, reason: "race_lost" };
      }
      throw err;
    }

    logEvent("contest.weekly_scheduled", {
      seriesKey,
      startTime: slot.toISOString(),
      problemCount: picked.length,
    });
    return { created: true, seriesKey, startTime: slot, problemCount: picked.length };
  }

  /** Begin periodic scheduling checks. Idempotent. */
  startScheduler(): void {
    if (this.timer) return;
    const check = (): void => {
      void this.ensureUpcoming().catch((err: unknown) => {
        contextLogger().error({ err }, "[weekly-contest] scheduling check failed");
      });
    };
    check();
    this.timer = setInterval(check, this.cfg.checkIntervalMs);
    // Never hold the event loop open.
    this.timer.unref();
  }

  stopScheduler(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
