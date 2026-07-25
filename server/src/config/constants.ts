/**
 * Business constants — the single source of truth for rules that were previously
 * duplicated across the frontend.
 *
 * Provenance (do not change values without a migration plan, they affect history):
 *  - SCORE_WEIGHTS  was hardcoded in client/app/api/leaderboard/route.ts (hard*5+medium*3+easy)
 *                   and restated as prose in client/app/leaderboard/page.tsx.
 *  - COIN_RULES     was hardcoded in client/app/api/submissions/route.ts (10 first solve,
 *                   {Easy:5,Medium:10,Hard:20} bonus) and in comments/blog/problem routes.
 *  - RANK_TIERS     was duplicated byte-for-byte in client/app/leaderboard/page.tsx and
 *                   client/app/profile/page.tsx. Only the id/label/min live here; colours,
 *                   icons and Tailwind classes stay in the frontend.
 */

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SUBMISSION_STATUSES = ["Accepted", "Attempted", "Error"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Points per uniquely solved problem, by difficulty. */
export const SCORE_WEIGHTS: Record<Difficulty, number> = {
  Easy: 1,
  Medium: 3,
  Hard: 5,
};

export const COIN_RULES = {
  firstSolve: 10,
  difficultyBonus: { Easy: 5, Medium: 10, Hard: 20 } satisfies Record<Difficulty, number>,
  comment: 1,
  blogPost: 2,
  problemCreated: 2,
} as const;

export const RANK_TIERS = [
  { min: 100, id: "grandmaster", label: "Grandmaster" },
  { min: 50, id: "master", label: "Master" },
  { min: 25, id: "expert", label: "Expert" },
  { min: 10, id: "specialist", label: "Specialist" },
  { min: 3, id: "apprentice", label: "Apprentice" },
  { min: 0, id: "novice", label: "Novice" },
] as const;

export type RankTierId = (typeof RANK_TIERS)[number]["id"];

/** Hard limits enforced by validation and services. */
export const LIMITS = {
  body: {
    legacy: "5mb",
    default: "1mb",
    text: "256kb",
  },
  grading: {
    /** Never run more than this many test cases for one submission. */
    maxTests: 24,
    /** Total wall-clock budget across all test-case executions. */
    totalBudgetMs: 25_000,
    /** Concurrent compiler calls per submission. */
    concurrency: 3,
  },
  code: {
    maxLength: 50_000,
  },
  playground: {
    maxScriptLength: 50_000,
    maxFiles: 12,
    maxFileLength: 100_000,
    maxTestCases: 20,
  },
  comment: {
    maxLength: 2000,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
} as const;

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
