/**
 * Pure helpers shared by the own-profile and public-profile views. Ported
 * unchanged from the Next.js routes (UTC day keys, 30-day window).
 */
import { DIFFICULTY_TIERS } from "@dwcode/shared";

export interface ActivityDay {
  date: string;
  count: number;
}

const dayKey = (d: Date): string => d.toISOString().split("T")[0] ?? "";

/** "YYYY-MM-DD" → submission count. */
export function activityMapOf(dates: Date[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const date of dates) {
    const key = dayKey(new Date(date));
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

/** The last 30 days, oldest first, with no gaps. */
export function last30Days(map: Record<string, number>, now: Date): ActivityDay[] {
  const out: ActivityDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    out.push({ date: key, count: map[key] ?? 0 });
  }
  return out;
}

/** Consecutive active days ending today (today may be inactive without breaking it). */
export function streakOf(map: Record<string, number>, now: Date): number {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (map[dayKey(d)]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

/** Per-difficulty counts keyed by tier id, plus the lowercase legacy keys (easy, medium, …). */
export function withLegacyKeys(byDifficulty: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tier of DIFFICULTY_TIERS) out[tier.id.toLowerCase()] = byDifficulty[tier.id] ?? 0;
  return out;
}

/** Leaderboard score from per-difficulty solve counts; weights from the shared registry. */
export function scoreOf(byDifficulty: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const tier of DIFFICULTY_TIERS) total += (byDifficulty[tier.id] ?? 0) * tier.scoreWeight;
  return total;
}

export function countBy(values: Iterable<string | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) if (v) out[v] = (out[v] ?? 0) + 1;
  return out;
}
