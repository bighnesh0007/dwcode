/**
 * Rank tier PRESENTATION.
 *
 * The rules — thresholds, ids, labels, score weights — live in
 * `@dwcode/shared` so the client and server cannot disagree (REF-01). This file
 * adds only the things the browser needs and the server does not: colours and
 * icons.
 *
 * Score weights used to be declared here as `{ Easy: 1, Medium: 3, Hard: 5 }`,
 * duplicating server/src/config/constants.ts. They are now re-exported from the
 * registry, so a new difficulty tier is picked up automatically.
 */
import {
    DIFFICULTY_TIERS,
    RANK_TIERS as SHARED_RANK_TIERS,
    SCORE_WEIGHTS,
    getRankTier,
    scoreWeightFor,
    type RankTier as SharedRankTier,
} from "@dwcode/shared";

export { SCORE_WEIGHTS, scoreWeightFor };

export interface RankTier extends SharedRankTier {
    /** Tailwind text colour class. */
    color: string;
    /** Tailwind badge background + border classes. */
    bg: string;
    /** Emoji icon. */
    icon: string;
}

/**
 * Presentation per rank id.
 *
 * Keyed by id rather than positional, so reordering or inserting a rank in the
 * shared registry cannot silently shift every colour by one.
 */
const PRESENTATION: Record<string, Pick<RankTier, "color" | "bg" | "icon">> = {
    grandmaster: { color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", icon: "🏆" },
    master: { color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30", icon: "💎" },
    expert: { color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", icon: "🔵" },
    specialist: { color: "text-cyan-500", bg: "bg-cyan-500/10 border-cyan-500/30", icon: "⭐" },
    apprentice: { color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: "🌱" },
    novice: { color: "text-muted-foreground", bg: "bg-muted/40 border-border", icon: "🐣" },
};

const FALLBACK_PRESENTATION = {
    color: "text-muted-foreground",
    bg: "bg-muted/40 border-border",
    icon: "🐣",
} as const;

/** Descending by `min`, mirroring the shared registry's ordering. */
export const RANK_TIERS: RankTier[] = SHARED_RANK_TIERS.map((tier) => ({
    ...tier,
    ...(PRESENTATION[tier.id] ?? FALLBACK_PRESENTATION),
}));

const BY_ID = new Map(RANK_TIERS.map((tier) => [tier.id, tier]));

/** The presentation-enriched tier for a score. */
export function getTier(score: number): RankTier {
    const base = getRankTier(score);
    return (
        BY_ID.get(base.id) ?? {
            ...base,
            ...FALLBACK_PRESENTATION,
        }
    );
}

/**
 * Leaderboard score from per-difficulty solve counts.
 *
 * Takes a map keyed by difficulty id rather than fixed `{easy, medium, hard}`
 * parameters, so a new tier contributes to the score with no change here.
 * Unknown keys are ignored rather than silently scoring the minimum.
 */
export function computeScore(countsByDifficulty: Readonly<Record<string, number>>): number {
    let total = 0;
    for (const tier of DIFFICULTY_TIERS) {
        total += (countsByDifficulty[tier.id] ?? 0) * tier.scoreWeight;
    }
    return total;
}
