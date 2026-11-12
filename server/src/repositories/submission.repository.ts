/** Submission persistence. Mongoose queries only — no business rules. */
import mongoose from "mongoose";
import { Submission } from "../models/Submission.ts";

export interface NewSubmission {
  problemId: string;
  problemSlug: string;
  userId: string;
  userName: string;
  userImageUrl: string;
  code: string;
  input: string;
  output: string;
  status: string;
  executionTime: string;
}

export interface SubmissionSummary {
  _id: string;
  problemId: string;
  problemSlug: string;
  status: string;
  executionTime: string;
  createdAt: Date;
  code: string;
  output: string;
}

export class SubmissionRepository {
  async create(data: NewSubmission): Promise<{ id: string; createdAt: Date }> {
    const doc = await Submission.create({ ...data, problemId: new mongoose.Types.ObjectId(data.problemId) });
    return { id: String(doc._id), createdAt: doc.createdAt };
  }

  /** Accepted submissions for (user, problem), excluding one — the first-solve check. */
  countAcceptedExcept(userId: string, problemId: string, excludeId: string): Promise<number> {
    return Submission.countDocuments({
      userId,
      problemId: new mongoose.Types.ObjectId(problemId),
      status: "Accepted",
      _id: { $ne: new mongoose.Types.ObjectId(excludeId) },
    });
  }

  /** Newest first. Served by the { userId, createdAt } index. */
  async listByUser(userId: string, limit: number, problemSlug?: string): Promise<SubmissionSummary[]> {
    const rows = await Submission.find(problemSlug ? { userId, problemSlug } : { userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("problemId problemSlug status executionTime createdAt code output")
      .lean();
    return rows.map((r) => ({
      _id: String(r._id),
      problemId: String(r.problemId),
      problemSlug: r.problemSlug,
      status: r.status ?? "Attempted",
      executionTime: r.executionTime ?? "0ms",
      createdAt: r.createdAt,
      code: r.code,
      output: r.output ?? "",
    }));
  }

  /** Distinct slugs this user has solved, in first-seen order. */
  async acceptedSlugs(userId: string): Promise<string[]> {
    const rows = await Submission.find({ userId, status: "Accepted" }).select("problemSlug").lean();
    return [...new Set(rows.map((r) => r.problemSlug))];
  }

  /**
   * Solved and attempted problem slugs for one user, computed in the database
   * so the problem list's status marks are right however many submissions a
   * user has (a paged history would silently drop the oldest).
   */
  async progress(userId: string): Promise<{ solved: string[]; attempted: string[] }> {
    const rows = await Submission.aggregate<{ _id: string; accepted: boolean }>([
      { $match: { userId } },
      { $group: { _id: "$problemSlug", accepted: { $max: { $eq: ["$status", "Accepted"] } } } },
    ]);
    return {
      solved: rows.filter((r) => r.accepted).map((r) => r._id),
      attempted: rows.filter((r) => !r.accepted).map((r) => r._id),
    };
  }

  /** Dashboard numbers for one user, computed in the database. `daily` covers the last 365 days (UTC dates). */
  async stats(userId: string, now: Date): Promise<{ total: number; accepted: number; daily: Record<string, number> }> {
    const since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const [totals] = await Submission.aggregate<{ total: number; accepted: number }>([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ["$status", "Accepted"] }, 1, 0] } } } },
    ]);
    const days = await Submission.aggregate<{ _id: string; n: number }>([
      { $match: { userId, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
    ]);
    return {
      total: totals?.total ?? 0,
      accepted: totals?.accepted ?? 0,
      daily: Object.fromEntries(days.map((d) => [d._id, d.n])),
    };
  }
}
