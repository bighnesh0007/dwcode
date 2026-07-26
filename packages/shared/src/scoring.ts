/**
 * Scoring, coins and rank progression.
 *
 * Everything difficulty-dependent lives in ./difficulty.ts; this file holds the
 * rules that are NOT per-tier, plus the rank ladder derived from them.
 *
 * Provenance (do not change values without a migration plan — they affect
 * existing user history):
 *  - COIN_RULES was hardcoded in client/app/api/submissions/route.ts and
 *    restated in server/src/config/constants.ts.
 *  - RANK_TIERS was duplicated byte-for-byte in client/lib/ranks.ts,
 *    client/app/leaderboard/page.tsx and client/app/profile/page.tsx.
 */
import { coinRewardFor } from "./difficulty.js";

/** Coin awards that are not difficulty-dependent. */
export const COIN_RULES = {
  /** First time a given problem is solved by a user. */
  firstSolve: 10,
  comment: 1,
  blogPost: 2,
  problemCreated: 2,
} as const;

/**
 * Total coins for an accepted submission.
 *
 * Centralised so the client route and any future server-side grader cannot
 * drift — that drift is exactly what let the two sides disagree before REF-01.
 */
export function coinsForAcceptedSubmission(
  difficulty: string,
  isFirstSolve: boolean,
): number {
  return coinRewardFor(difficulty) + (isFirstSolve ? COIN_RULES.firstSolve : 0);
}

export interface RankTier {
  /** Minimum score, inclusive. */
  readonly min: number;
  readonly id: string;
  readonly label: string;
}

/**
 * Rank ladder, highest first — `getRankTier` returns the first match.
 *
 * NOTE when adding a difficulty tier: a higher `scoreWeight` raises the score
 * ceiling, so these thresholds get easier to reach. Review them alongside any
 * new tier rather than assuming they still separate players meaningfully.
 */
export const RANK_TIERS: readonly RankTier[] = [
  { min: 100, id: "grandmaster", label: "Grandmaster" },
  { min: 50, id: "master", label: "Master" },
  { min: 25, id: "expert", label: "Expert" },
  { min: 10, id: "specialist", label: "Specialist" },
  { min: 3, id: "apprentice", label: "Apprentice" },
  { min: 0, id: "novice", label: "Novice" },
] as const;

/** The tier a score falls into. Never returns undefined — the last tier is min 0. */
export function getRankTier(score: number): RankTier {
  const safe = Number.isFinite(score) ? score : 0;
  for (const tier of RANK_TIERS) {
    if (safe >= tier.min) return tier;
  }
  // Unreachable while a min-0 tier exists; kept so the return type is total.
  return RANK_TIERS[RANK_TIERS.length - 1] as RankTier;
}

/** Submission verdicts. The server decides these; clients never supply one. */
export const SUBMISSION_STATUSES = ["Accepted", "Attempted", "Error"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Mutable copy for Mongoose `enum`, which rejects readonly arrays. */
export const SUBMISSION_STATUS_ENUM: string[] = [...SUBMISSION_STATUSES];
