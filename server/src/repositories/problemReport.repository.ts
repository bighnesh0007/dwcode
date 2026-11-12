/** Problem-report persistence. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import type { ReportReason, ReportStatus } from "../models/ProblemReport.ts";
import * as reports from "../data/repositories/reports.ts";

export class ProblemReportRepository {
  listByStatus(status: ReportStatus, limit: number) {
    return reports.listByStatus(status, limit);
  }

  findOpenFor(problemId: string, userId: string) {
    return reports.findOwnOpen(userId, problemId);
  }

  /** "duplicate" when the user already has an open report for the problem. */
  create(data: {
    problemId: string;
    problemSlug: string;
    userId: string;
    userName: string;
    reason: ReportReason;
    details: string;
  }) {
    return reports.create(data);
  }

  setStatus(
    id: string,
    update: { status: ReportStatus; resolutionNote: string; resolvedBy: string; resolvedAt: Date | null },
  ) {
    return reports.updateById(id, update);
  }
}
