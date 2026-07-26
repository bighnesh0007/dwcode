/**
 * THE difficulty registry — the single source of truth for every difficulty
 * tier and everything derived from one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDING A NEW TIER (e.g. Master, Legendary)
 *
 * Append one entry to DIFFICULTY_TIERS below. That is the whole change.
 *
 * Everything else derives from this array: the Mongoose enum, API validation,
 * the leaderboard score weights, coin rewards, UI filters, badge colours,
 * progress breakdowns, the AI generator's prompt vocabulary, and per-tier
 * counts on the profile and home pages.
 *
 * Before this registry existed the same information was duplicated across 17
 * files with four independently-maintained copies of the scoring tables — see
 * docs/audit/03-backlog.md (REF-01).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TWO RULES:
 *
 *  1. `id` IS THE PERSISTED VALUE. It is written into `problems.difficulty` in
 *     MongoDB and appears in submission history and GitHub export paths.
 *     Renaming an id is a data migration, not a config change. Adding one is
 *     purely additive and safe.
 *
 *  2. `className` values must be COMPLETE, LITERAL Tailwind classes. Tailwind
 *     scans source text — a constructed string like `text-${colour}-500` is
 *     never generated. `client/app/globals.css` has an `@source` directive
 *     pointing at this package so these are picked up.
 */

export interface DifficultyTier {
  /** Persisted value. Also the display label unless `label` overrides it. */
  readonly id: string;
  /** Human-facing label. */
  readonly label: string;
  /** Progression order, ascending. Drives sorting and the filter-bar order. */
  readonly order: number;
  /** Leaderboard points awarded per UNIQUELY solved problem in this tier. */
  readonly scoreWeight: number;
  /** Coins awarded on an accepted submission in this tier. */
  readonly coinReward: number;
  /** One-line description, used in tooltips and the AI generator prompt. */
  readonly description: string;
  /** Complete, literal Tailwind classes. See rule 2 above. */
  readonly className: {
    /** Difficulty label text. */
    readonly text: string;
    /** Left-accent bar on unsolved rows (a `before:` utility). */
    readonly accent: string;
    /** Badge/pill treatment. */
    readonly badge: string;
  };
}

/**
 * Ordered easiest → hardest.
 *
 * Score weights are super-linear on purpose: solving one Hard should be worth
 * more than several Easies, or the leaderboard rewards grinding volume over
 * genuine skill.
 */
export const DIFFICULTY_TIERS: readonly DifficultyTier[] = [
  {
    id: "Easy",
    label: "Easy",
    order: 1,
    scoreWeight: 1,
    coinReward: 5,
    description: "Single-concept warm-ups — one operator, small payload.",
    className: {
      text: "text-green-500",
      accent: "before:bg-green-500",
      badge: "text-green-500 border-green-500/40 bg-green-500/10",
    },
  },
  {
    id: "Medium",
    label: "Medium",
    order: 2,
    scoreWeight: 3,
    coinReward: 10,
    description: "Combines several operators or a non-trivial data shape.",
    className: {
      text: "text-yellow-500",
      accent: "before:bg-yellow-500",
      badge: "text-yellow-500 border-yellow-500/40 bg-yellow-500/10",
    },
  },
  {
    id: "Hard",
    label: "Hard",
    order: 3,
    scoreWeight: 5,
    coinReward: 20,
    description: "Multi-step transformations, edge cases and awkward inputs.",
    className: {
      text: "text-red-500",
      accent: "before:bg-red-500",
      badge: "text-red-500 border-red-500/40 bg-red-500/10",
    },
  },
  {
    id: "Expert",
    label: "Expert",
    order: 4,
    scoreWeight: 8,
    coinReward: 35,
    description:
      "Real integration scenarios — namespaced XML, recursion, streaming, " +
      "multi-format pipelines and precision-sensitive arithmetic.",
    className: {
      // Violet: distinct from the green/amber/red progression, so Expert reads
      // as a different KIND of problem rather than "even more red".
      text: "text-violet-400",
      accent: "before:bg-violet-500",
      badge: "text-violet-400 border-violet-500/40 bg-violet-500/10",
    },
  },
] as const;

// ── Derived values. Nothing below should need editing to add a tier. ─────────

/** Every tier id, easiest → hardest. Use for enums, filters and validation. */
export const DIFFICULTIES: readonly string[] = DIFFICULTY_TIERS.map((t) => t.id);

/**
 * Mongoose/Zod-friendly mutable copy.
 *
 * Mongoose's `enum` option and several validators expect a mutable `string[]`
 * and reject a `readonly` one, so hand them this rather than casting at every
 * call site.
 */
export const DIFFICULTY_ENUM: string[] = [...DIFFICULTIES];

const TIER_BY_ID = new Map(DIFFICULTY_TIERS.map((t) => [t.id, t]));

/** Type guard for untrusted input (request bodies, query params, AI output). */
export function isDifficulty(value: unknown): value is string {
  return typeof value === "string" && TIER_BY_ID.has(value);
}

/** Look up a tier, or `undefined` for an unknown id. */
export function getDifficultyTier(id: string): DifficultyTier | undefined {
  return TIER_BY_ID.get(id);
}

/**
 * The tier to assume when a value is missing or unrecognised.
 *
 * The MIDDLE tier, not the easiest: a problem whose difficulty failed to
 * validate should not silently become the cheapest thing on the leaderboard.
 */
export const DEFAULT_DIFFICULTY: string =
  DIFFICULTY_TIERS[Math.floor((DIFFICULTY_TIERS.length - 1) / 2)]?.id ?? "Medium";

/** Leaderboard points for a solve. Unknown tiers score the minimum, never more. */
export function scoreWeightFor(id: string): number {
  return TIER_BY_ID.get(id)?.scoreWeight ?? Math.min(...DIFFICULTY_TIERS.map((t) => t.scoreWeight));
}

/** Coins for an accepted solve. Unknown tiers pay the minimum, never more. */
export function coinRewardFor(id: string): number {
  return TIER_BY_ID.get(id)?.coinReward ?? Math.min(...DIFFICULTY_TIERS.map((t) => t.coinReward));
}

/** Tailwind classes for a tier, falling back to neutral styling. */
export function difficultyClassName(id: string): DifficultyTier["className"] {
  return (
    TIER_BY_ID.get(id)?.className ?? {
      text: "text-muted-foreground",
      accent: "before:bg-muted-foreground",
      badge: "text-muted-foreground border-border bg-muted",
    }
  );
}

/** Score → coin lookup maps, for code that prefers a record to a function. */
export const SCORE_WEIGHTS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(DIFFICULTY_TIERS.map((t) => [t.id, t.scoreWeight])),
);

export const COIN_REWARDS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(DIFFICULTY_TIERS.map((t) => [t.id, t.coinReward])),
);

/** Highest score currently achievable per solve — used to sanity-check ranks. */
export const MAX_SCORE_WEIGHT: number = Math.max(
  ...DIFFICULTY_TIERS.map((t) => t.scoreWeight),
);
