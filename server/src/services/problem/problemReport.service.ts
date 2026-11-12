/**
 * Problem reports, ported from the Next.js /api/problems/report route. A user
 * sees only their own open report; the queue and status changes are admin-only
 * (enforced by the routes).
 */
import { NotFoundError } from "../../errors/AppError.ts";
import type { ReportStatus } from "../../models/ProblemReport.ts";
import type { ProblemCatalogRepository } from "../../repositories/problemCatalog.repository.ts";
import type { ProblemReportRepository } from "../../repositories/problemReport.repository.ts";
import type { IdentityProvider } from "../../types/ports.ts";
import type { CreateReportInput, UpdateReportInput } from "../../validation/problem.schema.ts";

const ADMIN_LIST_LIMIT = 200;

export class ProblemReportService {
  constructor(
    private readonly reports: ProblemReportRepository,
    private readonly problems: ProblemCatalogRepository,
    private readonly identity: IdentityProvider,
  ) {}

  listByStatus(status: ReportStatus) {
    return this.reports.listByStatus(status, ADMIN_LIST_LIMIT);
  }

  async mine(problemId: string, userId: string) {
    return (await this.reports.findOpenFor(problemId, userId)) ?? null;
  }

  async create(input: CreateReportInput, userId: string) {
    // Reports against deleted or invented ids would only fill the queue.
    const problemSlug = await this.problems.findSlugById(input.problemId);
    if (!problemSlug) throw new NotFoundError("Problem not found.");

    const user = await this.identity.getUser(userId);
    const report = await this.reports.create({
      problemId: input.problemId,
      problemSlug,
      userId,
      userName: user?.displayName || "Anonymous",
      reason: input.reason,
      details: input.details,
    });
    // The partial unique index refused a second OPEN report: the intended outcome.
    if (report === "duplicate") return { report: null, alreadyReported: true };
    return { report, alreadyReported: false };
  }

  async update(id: string, input: UpdateReportInput, adminId: string) {
    const isClosing = input.status === "resolved" || input.status === "rejected";
    const updated = await this.reports.setStatus(id, {
      status: input.status,
      resolutionNote: input.resolutionNote,
      resolvedBy: isClosing ? adminId : "",
      resolvedAt: isClosing ? new Date() : null,
    });
    if (!updated) throw new NotFoundError("Report not found.");
    return updated;
  }
}
