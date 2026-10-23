/** Problem-report persistence. Mongoose queries only. */
import { ProblemReport, type ReportReason, type ReportStatus } from "../models/ProblemReport.ts";

export class ProblemReportRepository {
  async listByStatus(status: ReportStatus, limit: number) {
    return ProblemReport.find({ status }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async findOpenFor(problemId: string, userId: string) {
    return ProblemReport.findOne({ problemId, userId, status: "open" }).select("reason details status createdAt").lean();
  }

  /** Throws a duplicate-key error when the user already has an open report. */
  async create(data: {
    problemId: string;
    problemSlug: string;
    userId: string;
    userName: string;
    reason: ReportReason;
    details: string;
  }) {
    const doc = await ProblemReport.create({ ...data, status: "open" });
    return doc.toObject();
  }

  async setStatus(
    id: string,
    update: { status: ReportStatus; resolutionNote: string; resolvedBy: string; resolvedAt: Date | null },
  ) {
    return ProblemReport.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after", runValidators: true }).lean();
  }
}
