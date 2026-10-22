import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import * as problems from "@/lib/repositories/problems";
import * as reports from "@/lib/repositories/reports";
import { isValidId } from "@/lib/repositories/shared";
import {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_DETAILS_MAX_LENGTH,
  isReportReason as isReason,
  isReportStatus as isStatus,
} from "@/lib/reports";
import { requireAdmin } from "@/lib/adminCheck";
import { getErrorMessage } from "@/lib/errors";

/**
 * Report a problem as broken, unclear or inappropriate.
 *
 * Authenticated only — an anonymous report queue is a spam queue, and the
 * partial unique index below needs a stable identity to deduplicate against.
 */

const MAX_DETAILS = REPORT_DETAILS_MAX_LENGTH;

/**
 * GET /api/problems/report?problemId=…  — the caller's own report, if any.
 * GET /api/problems/report?status=open  — admin triage list.
 *
 * Regular users can only ever see their OWN report for a problem. Reports are
 * moderation data, so the queue is admin-only.
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    // ── Admin triage list ────────────────────────────────────────────────────
    if (status) {
      const admin = await requireAdmin();
      if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (!isStatus(status)) {
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      }

      return NextResponse.json({ reports: await reports.listByStatus(status, 200) });
    }

    // ── The caller's own report for one problem ──────────────────────────────
    const problemId = searchParams.get("problemId");
    if (!isValidId(problemId)) {
      return NextResponse.json({ error: "valid problemId required" }, { status: 400 });
    }

    const mine = await reports.findOwnOpen(userId, problemId);

    return NextResponse.json({ report: mine ?? null });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/** POST /api/problems/report  { problemId, reason, details? } */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Sign in to report a problem." }, { status: 401 });
    }

    const body = await req.json();
    const { problemId, reason } = body ?? {};

    if (!isValidId(problemId)) {
      return NextResponse.json({ error: "valid problemId required" }, { status: 400 });
    }
    if (!isReason(reason)) {
      return NextResponse.json(
        { error: `reason must be one of: ${REPORT_REASONS.join(", ")}` },
        { status: 400 },
      );
    }
    const details =
      typeof body?.details === "string" ? body.details.trim().slice(0, MAX_DETAILS) : "";

    // The problem must exist — otherwise the queue fills with reports against
    // ids that were deleted or never existed.
    const problemSlug = await problems.findSlugById(problemId);
    if (!problemSlug) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const user = await currentUser();

    const report = await reports.create({
      problemId,
      problemSlug,
      userId,
      userName: user?.fullName || user?.username || "Anonymous",
      reason,
      details,
    });
    // The partial unique index rejected a second OPEN report from the same
    // user. That is the intended outcome, not a failure — report it as
    // "already reported" rather than a 500.
    if (report === "duplicate") {
      return NextResponse.json({ success: true, alreadyReported: true }, { status: 200 });
    }
    return NextResponse.json({ success: true, report });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

/** PATCH /api/problems/report  { id, status, resolutionNote? } — admin only. */
export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, status } = body ?? {};

    if (!isValidId(id)) {
      return NextResponse.json({ error: "valid id required" }, { status: 400 });
    }
    if (!isStatus(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${REPORT_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const resolutionNote =
      typeof body?.resolutionNote === "string"
        ? body.resolutionNote.trim().slice(0, MAX_DETAILS)
        : "";
    const isClosing = status === "resolved" || status === "rejected";

    const updated = await reports.updateById(id, {
      status,
      resolutionNote,
      ...(isClosing
        ? { resolvedBy: admin.userId, resolvedAt: new Date() }
        : { resolvedBy: "", resolvedAt: null }),
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true, report: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
