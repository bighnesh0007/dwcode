import mongoose from "mongoose";
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS, REPORT_STATUSES } from "@dwcode/shared";
import { modelFromSchema } from "./model.ts";

// One vocabulary for the report form and this schema (@dwcode/shared).
export { REPORT_REASONS, REPORT_STATUSES, REPORT_DETAILS_MAX_LENGTH } from "@dwcode/shared";
export type { ReportReason, ReportStatus } from "@dwcode/shared";

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
