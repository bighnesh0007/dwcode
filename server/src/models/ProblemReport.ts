import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/**
 * Ported from client/models/ProblemReport.ts — both apps write the same
 * collection during the migration, so keep the schema and indexes identical.
 *
 * The vocabulary is duplicated from client/lib/reports.ts because the client
 * copy cannot be imported here. Move both into @dwcode/shared once the Next
 * route is gone; until then a change to one must be made to the other.
 */
export const REPORT_REASONS = [
  "wrong-expected-output",
  "unclear-description",
  "broken-test-case",
  "duplicate",
  "inappropriate",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "reviewing", "resolved", "rejected"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_DETAILS_MAX_LENGTH = 1000;

export const ProblemReportSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true },
  problemSlug: { type: String, required: true },

  userId: { type: String, required: true },
  userName: { type: String, default: "Anonymous" },

  reason: { type: String, enum: [...REPORT_REASONS], required: true },
  details: { type: String, default: "", maxlength: REPORT_DETAILS_MAX_LENGTH },

  status: { type: String, enum: [...REPORT_STATUSES], default: "open" },
  resolvedBy: { type: String, default: "" },
  resolvedAt: { type: Date },
  resolutionNote: { type: String, default: "", maxlength: REPORT_DETAILS_MAX_LENGTH },

  createdAt: { type: Date, default: Date.now },
});

// One OPEN report per user per problem; partial so a resolved report does not block a new one.
ProblemReportSchema.index(
  { problemId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "open" } },
);
ProblemReportSchema.index({ status: 1, createdAt: -1 });
ProblemReportSchema.index({ problemSlug: 1, status: 1 });

export const ProblemReport = modelFromSchema("ProblemReport", ProblemReportSchema);
