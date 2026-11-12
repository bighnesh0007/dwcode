/**
 * Problem-report vocabulary.
 *
 * In @dwcode/shared because the report form (client) and the ProblemReport
 * schema and validation (server) must agree on every value.
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

/** Human-facing labels, so the report form and the admin queue cannot drift. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  "wrong-expected-output": "Expected output looks wrong",
  "unclear-description": "Description is unclear or incomplete",
  "broken-test-case": "A test case is broken",
  duplicate: "Duplicate of another problem",
  inappropriate: "Inappropriate content",
  other: "Something else",
};

/** Max length of the optional free-text field. */
export const REPORT_DETAILS_MAX_LENGTH = 1000;

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && (REPORT_STATUSES as readonly string[]).includes(value);
}
