/**
 * Read-only queries behind profiles and the leaderboard: submissions, problems,
 * bookmarks and the GitHub link. Mongoose only — no business rules.
 */
import { Bookmark } from "../models/Bookmark.ts";
import { GitHubIntegration } from "../models/GitHubIntegration.ts";
import { Problem } from "../models/Problem.ts";
import { Submission } from "../models/Submission.ts";

export interface SubmissionLite {
  problemSlug: string;
  status: string;
  executionTime: string;
  createdAt: Date;
  userImageUrl: string;
}

/** Per-user totals from the submissions collection, computed in MongoDB. */
export interface UserSubmissionAggregate {
  userId: string;
  totalSubmissions: number;
  accepted: number;
  solvedSlugs: string[];
  /** Earliest submission (by _id) carrying a real, non-placeholder name. */
  firstReal: { name: string; imageUrl: string } | null;
  /** Earliest submission (by _id) of any kind. */
  firstAny: { imageUrl: string };
}

export class UserStatsRepository {
  /** All of a user's submissions, newest first. Served by { userId, createdAt }. */
  async submissionsFor(userId: string): Promise<SubmissionLite[]> {
    const rows = await Submission.find({ userId })
      .sort({ createdAt: -1 })
      .select("problemSlug status executionTime createdAt userImageUrl")
      .lean();
    return rows.map((r) => ({
      problemSlug: r.problemSlug,
      status: r.status ?? "Attempted",
      executionTime: r.executionTime ?? "0ms",
      createdAt: r.createdAt,
      userImageUrl: r.userImageUrl ?? "",
    }));
  }

  async countProblems(): Promise<number> {
    return Problem.countDocuments();
  }

  async countProblemsByOrigin(): Promise<{ ai: number; manual: number }> {
    const [ai, manual] = await Promise.all([
      Problem.countDocuments({ createdByAI: true }),
      Problem.countDocuments({ createdByAI: false }),
    ]);
    return { ai, manual };
  }

  /** difficulty id → number of problems. */
  async countProblemsByDifficulty(): Promise<Record<string, number>> {
    const rows = await Problem.aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$difficulty", n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }

  /** slug → difficulty for the given slugs, or for every problem when omitted. */
  async difficultyBySlug(slugs?: string[]): Promise<Map<string, string>> {
    const filter = slugs ? { slug: { $in: slugs } } : {};
    const rows = await Problem.find(filter).select("slug difficulty").lean();
    return new Map(rows.map((r) => [r.slug, r.difficulty]));
  }

  async countBookmarks(userId: string): Promise<number> {
    return Bookmark.countDocuments({ userId });
  }

  async githubUsername(userId: string): Promise<string | null> {
    const doc = await GitHubIntegration.findOne({ userId }).select("githubUsername").lean();
    return doc?.githubUsername ?? null;
  }

  /**
   * PERF-01: the Next.js route loaded every submission into the app and grouped
   * it in JS. This groups in MongoDB and returns one row per user.
   *
   * `placeholderNames` are names written by system code ("Migrated", …); the
   * earliest real name wins over them (issue #43). `$min` over a document
   * compares field by field, so leading with `_id` picks the earliest match,
   * and `$min` ignores the nulls produced for placeholder rows.
   */
  async aggregatePerUser(placeholderNames: readonly string[]): Promise<UserSubmissionAggregate[]> {
    const rows = await Submission.aggregate<{
      _id: string;
      totalSubmissions: number;
      accepted: number;
      solvedSlugs: string[];
      firstReal: { id: unknown; name: string; imageUrl: string } | null;
      firstAny: { id: unknown; imageUrl: string };
    }>([
      { $match: { userId: { $nin: [null, ""] } } },
      {
        $addFields: {
          _isAccepted: { $eq: ["$status", "Accepted"] },
          _isReal: { $not: [{ $in: [{ $ifNull: ["$userName", ""] }, [...placeholderNames]] }] },
        },
      },
      {
        $group: {
          _id: "$userId",
          totalSubmissions: { $sum: 1 },
          accepted: { $sum: { $cond: ["$_isAccepted", 1, 0] } },
          solvedSlugs: { $addToSet: { $cond: ["$_isAccepted", "$problemSlug", "$$REMOVE"] } },
          firstReal: {
            $min: {
              $cond: [
                "$_isReal",
                { id: "$_id", name: "$userName", imageUrl: { $ifNull: ["$userImageUrl", ""] } },
                null,
              ],
            },
          },
          firstAny: { $min: { id: "$_id", imageUrl: { $ifNull: ["$userImageUrl", ""] } } },
        },
      },
    ]).allowDiskUse(true);

    return rows.map((r) => ({
      userId: r._id,
      totalSubmissions: r.totalSubmissions,
      accepted: r.accepted,
      solvedSlugs: r.solvedSlugs,
      firstReal: r.firstReal ? { name: r.firstReal.name, imageUrl: r.firstReal.imageUrl } : null,
      firstAny: { imageUrl: r.firstAny.imageUrl },
    }));
  }
}
