/**
 * Server-only business constants.
 *
 * Everything shared with the client — the difficulty registry, scoring weights,
 * coin rules, rank tiers, submission statuses and limits — now lives in
 * `@dwcode/shared` and is RE-EXPORTED here so existing server imports keep
 * working unchanged (REF-01).
 *
 * These were previously declared here AND separately in the client, with four
 * independently-maintained copies of the scoring tables. Add a difficulty tier
 * in packages/shared/src/difficulty.ts and every consumer picks it up.
 *
 * Only genuinely server-side values are declared below.
 */
export {
  DIFFICULTIES,
  DIFFICULTY_ENUM,
  DIFFICULTY_TIERS,
  SCORE_WEIGHTS,
  COIN_REWARDS,
  COIN_RULES,
  RANK_TIERS,
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_ENUM,
  LIMITS,
  coinRewardFor,
  scoreWeightFor,
  getRankTier,
  getDifficultyTier,
  isDifficulty,
  DEFAULT_DIFFICULTY,
} from "@dwcode/shared";
export type { DifficultyTier, RankTier, SubmissionStatus } from "@dwcode/shared";

/**
 * Rate-limit policies. `keyBy: "user"` falls back to IP for anonymous callers.
 * Memory-backed today; swapping in Redis is a store change, not a policy change.
 */
export const RATE_LIMIT_POLICIES = {
  global: { windowMs: 60_000, limit: 300, keyBy: "ip" },
  legacy: { windowMs: 60_000, limit: 120, keyBy: "ip" },
  auth: { windowMs: 60_000, limit: 30, keyBy: "ip" },
  submission: { windowMs: 60_000, limit: 12, keyBy: "user" },
  compiler: { windowMs: 60_000, limit: 60, keyBy: "user" },
  ai: { windowMs: 60_000, limit: 8, keyBy: "user" },
  aiDaily: { windowMs: 24 * 60 * 60 * 1000, limit: 100, keyBy: "user" },
  generation: { windowMs: 60_000, limit: 4, keyBy: "user" },
  write: { windowMs: 60_000, limit: 60, keyBy: "user" },
} as const satisfies Record<
  string,
  { windowMs: number; limit: number; keyBy: "ip" | "user" }
>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

/** In-memory abuse-detection thresholds. */
export const ABUSE_RULES = {
  duplicateRequest: { windowMs: 10_000, maxCacheEntries: 5000 },
  repeatedSubmission: { windowMs: 30_000, maxCacheEntries: 5000 },
  rapidAi: { windowMs: 10_000, maxCacheEntries: 2000 },
} as const;

/** Attempts expire after this long, via a Mongo TTL index. */
export const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The auto-scheduled public weekly contest: Saturday 15:00 UTC, two hours.
 * `problemMix` is the ideal draw per difficulty; short buckets are backfilled
 * from the whole pool, and the contest is skipped below `minProblems`.
 */
export const WEEKLY_CONTEST = {
  dayOfWeekUTC: 6, // Saturday
  hourUTC: 15,
  durationMinutes: 120,
  maxParticipants: 500,
  problemMix: { Easy: 1, Medium: 2, Hard: 1 },
  minProblems: 2,
  checkIntervalMs: 60 * 60 * 1000,
} as const;
