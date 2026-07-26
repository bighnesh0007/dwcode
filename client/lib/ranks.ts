/**
 * Single source of truth for rank tiers.
 *
 * Score = 1pt per unique Easy, 3pts per Medium, 5pts per Hard problem solved
 * (must match /api/leaderboard's scoring).
 */

export interface RankTier {
    /** Stable identifier, e.g. "grandmaster" — used by RankAvatar effects. */
    id: string;
    label: string;
    /** Minimum score (inclusive) to hold this tier. */
    min: number;
    /** Tailwind text color class. */
    color: string;
    /** Tailwind badge background + border classes. */
    bg: string;
    /** Emoji icon. */
    icon: string;
}

/** Descending by `min` — getTier relies on this ordering. */
export const RANK_TIERS: RankTier[] = [
    { id: "grandmaster", label: "Grandmaster", min: 100, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30", icon: "🏆" },
    { id: "master", label: "Master", min: 50, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30", icon: "💎" },
    { id: "expert", label: "Expert", min: 25, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", icon: "🔵" },
    { id: "specialist", label: "Specialist", min: 10, color: "text-cyan-500", bg: "bg-cyan-500/10 border-cyan-500/30", icon: "⭐" },
    { id: "apprentice", label: "Apprentice", min: 3, color: "text-green-500", bg: "bg-green-500/10 border-green-500/30", icon: "🌱" },
    { id: "novice", label: "Novice", min: 0, color: "text-muted-foreground", bg: "bg-muted/40 border-border", icon: "🐣" },
];

const NOVICE: RankTier = RANK_TIERS[RANK_TIERS.length - 1];

export function getTier(score: number): RankTier {
    return RANK_TIERS.find((tier) => score >= tier.min) ?? NOVICE;
}

export const SCORE_WEIGHTS = { Easy: 1, Medium: 3, Hard: 5 } as const;

export function computeScore(counts: { easy: number; medium: number; hard: number }): number {
    return (
        counts.easy * SCORE_WEIGHTS.Easy +
        counts.medium * SCORE_WEIGHTS.Medium +
        counts.hard * SCORE_WEIGHTS.Hard
    );
}
