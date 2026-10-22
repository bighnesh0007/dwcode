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
  async listByUser(userId: string, limit: number): Promise<SubmissionSummary[]> {
    const rows = await Submission.find({ userId })
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
}
