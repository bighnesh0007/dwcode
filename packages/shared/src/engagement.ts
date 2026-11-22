/**
 * Engagement rules — daily challenge, streaks, streak freezes and achievements.
 *
 * Everything here is computed on read from a user's submissions, so there is
 * nothing to backfill and nothing to keep in sync: change a rule and every
 * profile reflects it on the next request. Pure functions, shared by the
 * server (which pays the daily bonus) and the client (which renders progress).
 */
import { DIFFICULTY_TIERS } from "./difficulty.js";

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" for a moment, in UTC — the one day boundary everything uses. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** 32-bit FNV-1a: small, stable across runtimes, well spread for short keys. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The daily challenge for a UTC day: the same problem for everyone, picked
 * deterministically from the catalogue, so it needs no storage and any past
 * day's pick can be recomputed (achievements rely on that). Slugs are sorted
 * first, so the order they arrive in does not matter. Adding problems can move
 * future picks; a day already past is only recomputed for achievements.
 */
export function dailySlugFor(day: string, slugs: readonly string[]): string | null {
  if (slugs.length === 0) return null;
  const sorted = [...slugs].sort();
  return sorted[fnv1a(`dwcode-daily:${day}`) % sorted.length] ?? null;
}

export interface StreakView {
  /** Consecutive active days ending today or yesterday. */
  current: number;
  longest: number;
  /** Freezes the current streak is using to bridge missed days. */
  freezesUsed: number;
}

/**
 * Current and longest runs of consecutive UTC days with any submission. The
 * current streak survives until the end of the day after the last active day
 * (today may not have activity yet). Each owned freeze bridges one missed day
 * inside the current streak; a bridged day does not add to the count.
 */
export function streaks(activeDays: Iterable<string>, today: string, freezes = 0): StreakView {
  const days = new Set(activeDays);
  const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  let longest = 0;
  for (const d of days) {
    if (days.has(iso(toMs(d) - DAY_MS))) continue; // not the start of a run
    let len = 1;
    while (days.has(iso(toMs(d) + len * DAY_MS))) len++;
    longest = Math.max(longest, len);
  }

  const todayMs = toMs(today);
  let cursor = days.has(today) ? todayMs : todayMs - DAY_MS;
  let current = 0;
  let left = Math.max(0, Math.floor(freezes));
  for (;;) {
    if (days.has(iso(cursor))) {
      current++;
      cursor -= DAY_MS;
    } else if (current > 0 && left > 0 && days.has(iso(cursor - DAY_MS))) {
      left--;
      cursor -= DAY_MS;
    } else {
      break;
    }
  }
  return { current, longest: Math.max(longest, current), freezesUsed: Math.max(0, Math.floor(freezes)) - left };
}

/** Streak freezes sold in the store. Each one owned bridges one missed day. */
export interface StreakFreezeItem {
  id: string;
  name: string;
  description: string;
  cost: number;
}

export const STREAK_FREEZES: readonly StreakFreezeItem[] = [
  { id: "streak-freeze-1", name: "Streak Freeze", description: "Bridges one missed day in your streak.", cost: 60 },
  { id: "streak-freeze-2", name: "Second Streak Freeze", description: "Bridges a second missed day.", cost: 120 },
];

export function findStreakFreeze(id: string): StreakFreezeItem | undefined {
  return STREAK_FREEZES.find((f) => f.id === id);
}

/** How many freezes a set of owned store item ids grants. */
export function freezesOwned(ownedItemIds: readonly string[]): number {
  const owned = new Set(ownedItemIds);
  return STREAK_FREEZES.filter((f) => owned.has(f.id)).length;
}

export interface SolvedProblem {
  slug: string;
  difficulty: string;
  category: string;
}

export interface AchievementInput {
  solved: readonly SolvedProblem[];
  longestStreak: number;
  /** Days on which the user solved that day's daily challenge. */
  dailyChallengesDone: number;
  contestsEntered: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Icon token; the client maps it to an icon. */
  icon: string;
  earned: boolean;
  progress: { current: number; target: number };
}

interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  measure: (input: AchievementInput) => number;
}

/** One "solve a <tier> problem" achievement per difficulty tier, from the registry. */
const TIER_ACHIEVEMENTS: AchievementDef[] = DIFFICULTY_TIERS.map((tier) => ({
  id: `tier-${tier.id.toLowerCase()}`,
  title: `${tier.label} Cleared`,
  description: `Solve a ${tier.label} problem.`,
  icon: "mountain",
  target: 1,
  measure: (i: AchievementInput) => i.solved.filter((s) => s.difficulty === tier.id).length,
}));

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "first-solve", title: "Hello, DataWeave", description: "Solve your first problem.", icon: "sparkles", target: 1, measure: (i) => i.solved.length },
  { id: "solved-10", title: "Getting Fluent", description: "Solve 10 problems.", icon: "code", target: 10, measure: (i) => i.solved.length },
  { id: "solved-25", title: "Transformer", description: "Solve 25 problems.", icon: "shuffle", target: 25, measure: (i) => i.solved.length },
  { id: "solved-50", title: "Payload Whisperer", description: "Solve 50 problems.", icon: "trophy", target: 50, measure: (i) => i.solved.length },
  ...TIER_ACHIEVEMENTS,
  {
    id: "explorer",
    title: "Explorer",
    description: "Solve problems in 5 different categories.",
    icon: "compass",
    target: 5,
    measure: (i) => new Set(i.solved.map((s) => s.category)).size,
  },
  { id: "daily-1", title: "Daily Habit", description: "Solve a daily challenge on its day.", icon: "calendar", target: 1, measure: (i) => i.dailyChallengesDone },
  { id: "daily-7", title: "Regular", description: "Solve 7 daily challenges on their day.", icon: "calendar", target: 7, measure: (i) => i.dailyChallengesDone },
  { id: "streak-7", title: "On Fire", description: "Practise 7 days in a row.", icon: "flame", target: 7, measure: (i) => i.longestStreak },
  { id: "streak-30", title: "Unstoppable", description: "Practise 30 days in a row.", icon: "flame", target: 30, measure: (i) => i.longestStreak },
  { id: "contestant", title: "Contestant", description: "Enter a contest.", icon: "swords", target: 1, measure: (i) => i.contestsEntered },
];

export function achievementsFor(input: AchievementInput): Achievement[] {
  return ACHIEVEMENTS.map((d) => {
    const current = Math.min(d.target, Math.max(0, Math.floor(d.measure(input))));
    return {
      id: d.id,
      title: d.title,
      description: d.description,
      icon: d.icon,
      earned: current >= d.target,
      progress: { current, target: d.target },
    };
  });
}

/** What an Accepted solve earned beyond its normal coins; returned with the verdict. */
export interface AcceptedRewards {
  /** Coins paid for solving the daily challenge on its day; 0 when not. */
  dailyBonus: number;
  /** Achievements this solve unlocked. */
  unlocked: Achievement[];
}

/** Achievements earned in `after` that were not earned in `before`. */
export function newlyEarned(before: readonly Achievement[], after: readonly Achievement[]): Achievement[] {
  const had = new Set(before.filter((a) => a.earned).map((a) => a.id));
  return after.filter((a) => a.earned && !had.has(a.id));
}
