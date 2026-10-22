import { ProblemReport } from "@/models/ProblemReport";
import type { ReportReason, ReportStatus } from "@/lib/reports";
import { connect, isDuplicateKeyError } from "./shared";

/** Admin triage list: newest first, capped. */
export async function listByStatus(status: ReportStatus, limit: number) {
  await connect();
  return ProblemReport.find({ status }).sort({ createdAt: -1 }).limit(limit).lean();
}

/** The caller's own open report for a problem, if any. */
export async function findOwnOpen(userId: string, problemId: string) {
  await connect();
  return ProblemReport.findOne({ problemId, userId, status: "open" })
    .select("reason details status createdAt")
    .lean();
}

/**
 * File a report. A partial unique index allows one OPEN report per user per
 * problem; a second one returns "duplicate" instead of throwing.
 */
export async function create(report: {
  problemId: string;
  problemSlug: string;
  userId: string;
  userName: string;
  reason: ReportReason;
  details: string;
}) {
  await connect();
  try {
    const doc = await ProblemReport.create({ ...report, status: "open" });
    return doc.toObject();
  } catch (err) {
    if (isDuplicateKeyError(err)) return "duplicate" as const;
    throw err;
  }
}

/** Apply `$set` and return the updated report, or null when it does not exist. */
export async function updateById(id: string, set: Record<string, unknown>) {
  await connect();
  return ProblemReport.findByIdAndUpdate(
    id,
    { $set: set },
    { returnDocument: "after", runValidators: true },
  ).lean();
}
