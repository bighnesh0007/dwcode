/**
 * Read-only queries behind profiles and the leaderboard: submissions, problems,
 * bookmarks and the GitHub link — no business rules. Delegates to
 * data/repositories, where DATA_BACKEND picks the database.
 */
import * as bookmarks from "../data/repositories/bookmarks.ts";
import * as github from "../data/repositories/githubIntegrations.ts";
import * as problems from "../data/repositories/problems.ts";
import * as submissions from "../data/repositories/submissions.ts";

export interface SubmissionLite {
  problemSlug: string;
  status: string;
  executionTime: string;
  createdAt: Date;
  userImageUrl: string;
}

/** Per-user totals, computed in the database. */
export type UserSubmissionAggregate = submissions.LeaderboardRow;

export class UserStatsRepository {
  /** All of a user's submissions, newest first. */
  async submissionsFor(userId: string): Promise<SubmissionLite[]> {
    const rows = await submissions.listByUser(userId);
    return rows.map((r) => ({
      problemSlug: r.problemSlug,
      status: r.status ?? "Attempted",
      executionTime: r.executionTime ?? "0ms",
      createdAt: r.createdAt,
      userImageUrl: r.userImageUrl ?? "",
    }));
  }

  countProblems(): Promise<number> {
    return problems.count();
  }

  async countProblemsByOrigin(): Promise<{ ai: number; manual: number }> {
    const [ai, manual] = await Promise.all([problems.count({ createdByAI: true }), problems.count({ createdByAI: false })]);
    return { ai, manual };
  }

  /** difficulty id → number of problems. */
  countProblemsByDifficulty(): Promise<Record<string, number>> {
    return problems.countByDifficulty();
  }

  /** slug → difficulty for the given slugs, or for every problem when omitted. */
  async difficultyBySlug(slugs?: string[]): Promise<Map<string, string>> {
    const all = Object.entries(await problems.difficultyBySlug());
    if (!slugs) return new Map(all);
    const wanted = new Set(slugs);
    return new Map(all.filter(([slug]) => wanted.has(slug)));
  }

  countBookmarks(userId: string): Promise<number> {
    return bookmarks.countByUser(userId);
  }

  async githubUsername(userId: string): Promise<string | null> {
    return (await github.findSettings(userId))?.githubUsername ?? null;
  }

  /**
   * PERF-01: one row per user, grouped in the database rather than by loading
   * every submission into the app. The earliest real name wins over
   * `placeholderNames` (issue #43).
   */
  aggregatePerUser(placeholderNames: readonly string[]): Promise<UserSubmissionAggregate[]> {
    return submissions.leaderboardRows(placeholderNames);
  }
}
