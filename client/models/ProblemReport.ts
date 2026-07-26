import mongoose from "mongoose";
import {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_DETAILS_MAX_LENGTH,
} from "@/lib/reports";
import { modelFromSchema } from "./model";

/**
 * A user-submitted report that something is wrong with a problem.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 * Problems come from three places — hand-authored, AI-generated, and seeded —
 * and until FEAT-01 runs hidden tests, a problem with a wrong `expectedOutput`
 * is UNPASSABLE and gives the solver no way to tell whether they are wrong or
 * the problem is. Reports are the only signal that distinguishes the two.
 *
 * Deliberately NOT part of `Comment`: a report is private moderation data with a
 * lifecycle (open → resolved), whereas a comment is public discussion. Merging
 * them would leak reports into the discussion thread.
 */
export const ProblemReportSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true },
  /** Denormalised so the admin list does not need a join to be readable. */
  problemSlug: { type: String, required: true },

  userId: { type: String, required: true },
  userName: { type: String, default: "Anonymous" },

  reason: { type: String, enum: [...REPORT_REASONS], required: true },
  /** Optional free text. Capped — this is a report, not an essay. */
  details: { type: String, default: "", maxlength: REPORT_DETAILS_MAX_LENGTH },

  status: { type: String, enum: [...REPORT_STATUSES], default: "open" },
  /** Set when an admin resolves or rejects it. */
  resolvedBy: { type: String, default: "" },
  resolvedAt: { type: Date },
  resolutionNote: { type: String, default: "", maxlength: REPORT_DETAILS_MAX_LENGTH },

  createdAt: { type: Date, default: Date.now },
});

/**
 * One OPEN report per user per problem.
 *
 * Partial index so the constraint applies only while a report is open: a user
 * whose earlier report was resolved may legitimately report the problem again if
 * it regresses. A plain unique index would block that forever.
 */
ProblemReportSchema.index(
  { problemId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "open" } },
);

// Admin triage: open reports, newest first.
ProblemReportSchema.index({ status: 1, createdAt: -1 });
// "How many people reported this problem?" — the signal that ranks triage.
ProblemReportSchema.index({ problemSlug: 1, status: 1 });

export const ProblemReport = modelFromSchema("ProblemReport", ProblemReportSchema);
