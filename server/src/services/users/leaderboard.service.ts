/**
 * Leaderboard. Same semantics as the Next.js GET /api/leaderboard:
 *  - `rank` is ALWAYS the canonical rank (score desc, solved as the tiebreak);
 *    other sorts reorder rows without renumbering them
 *  - `me` is the caller's own row regardless of the page requested
 *
 * The per-user grouping now runs in MongoDB (PERF-01); scoring stays here,
 * weighted by the shared difficulty registry.
 */
import type { UserProfileRepository } from "../../repositories/userProfile.repository.ts";
import type { UserStatsRepository } from "../../repositories/userStats.repository.ts";
import { countBy, scoreOf, withLegacyKeys } from "./activity.ts";

export type LeaderboardSort = "score" | "solved" | "acceptance";

/** Names written by system code; a real name from any submission wins (issue #43). */
export const PLACEHOLDER_NAMES = ["", "Anonymous", "Migrated"] as const;

export interface LeaderboardQuery {
  page: number;
  limit: number;
  sort: LeaderboardSort;
}

export class LeaderboardService {
  constructor(
    private readonly stats: UserStatsRepository,
    private readonly profiles: UserProfileRepository,
  ) {}

  async get(query: LeaderboardQuery, viewerId: string | undefined) {
    const [perUser, difficulty, problemCounts, totalProblems] = await Promise.all([
      this.stats.aggregatePerUser(PLACEHOLDER_NAMES),
      this.stats.difficultyBySlug(),
      this.stats.countProblemsByDifficulty(),
      this.stats.countProblems(),
    ]);
    const usernames = await this.profiles.usernamesFor(perUser.map((u) => u.userId));

    const rows = perUser.map((u) => {
      const byDifficulty = countBy(u.solvedSlugs.map((slug) => difficulty.get(slug)));
      return {
        userId: u.userId,
        userName: u.firstReal?.name ?? "Anonymous",
        userImageUrl: u.firstReal?.imageUrl || u.firstAny.imageUrl,
        username: usernames.get(u.userId) ?? null, // null = no public profile
        totalSolved: u.solvedSlugs.length,
        byDifficulty,
        ...withLegacyKeys(byDifficulty),
        score: scoreOf(byDifficulty),
        totalSubmissions: u.totalSubmissions,
        acceptanceRate: u.totalSubmissions > 0 ? Math.round((u.accepted / u.totalSubmissions) * 100) : 0,
        rank: 0,
      };
    });

    // Canonical ranking first. userId breaks remaining ties so the order is
    // deterministic (the old route depended on collection scan order).
    rows.sort((a, b) => b.score - a.score || b.totalSolved - a.totalSolved || a.userId.localeCompare(b.userId));
    rows.forEach((row, i) => {
      row.rank = i + 1;
    });
    const me = viewerId ? (rows.find((r) => r.userId === viewerId) ?? null) : null;

    if (query.sort === "solved") rows.sort((a, b) => b.totalSolved - a.totalSolved || b.score - a.score || a.rank - b.rank);
    else if (query.sort === "acceptance") rows.sort((a, b) => b.acceptanceRate - a.acceptanceRate || b.score - a.score || a.rank - b.rank);

    const totalUsers = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / query.limit));
    const page = Math.min(query.page, totalPages);
    const start = (page - 1) * query.limit;

    const counts = withLegacyKeys(problemCounts);
    return {
      leaderboard: rows.slice(start, start + query.limit),
      me,
      pagination: { page, limit: query.limit, totalUsers, totalPages, sort: query.sort },
      meta: {
        totalProblems,
        ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [`${k}Count`, v])),
        byDifficulty: problemCounts,
      },
    };
  }
}
