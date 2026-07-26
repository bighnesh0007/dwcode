import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import { ProblemReport } from "@/models/ProblemReport";
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

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

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

      await connectToDatabase();
      const reports = await ProblemReport.find({ status })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      return NextResponse.json({ reports });
    }

    // ── The caller's own report for one problem ──────────────────────────────
    const problemId = searchParams.get("problemId");
    if (!problemId || !mongoose.Types.ObjectId.isValid(problemId)) {
      return NextResponse.json({ error: "valid problemId required" }, { status: 400 });
    }

    await connectToDatabase();
    const mine = await ProblemReport.findOne({ problemId, userId, status: "open" })
      .select("reason details status createdAt")
      .lean();

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

    if (!problemId || !mongoose.Types.ObjectId.isValid(problemId)) {
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

    await connectToDatabase();

    // The problem must exist — otherwise the queue fills with reports against
    // ids that were deleted or never existed.
    const problem = await Problem.findById(problemId).select("slug").lean();
    if (!problem) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const user = await currentUser();

    try {
      const report = await ProblemReport.create({
        problemId,
        problemSlug: problem.slug,
        userId,
        userName: user?.fullName || user?.username || "Anonymous",
        reason,
        details,
        status: "open",
      });
      return NextResponse.json({ success: true, report });
    } catch (error) {
      // The partial unique index rejected a second OPEN report from the same
      // user. That is the intended outcome, not a failure — report it as
      // "already reported" rather than a 500.
      if (isDuplicateKeyError(error)) {
        return NextResponse.json(
          { success: true, alreadyReported: true },
          { status: 200 },
        );
      }
      throw error;
    }
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

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
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

    await connectToDatabase();
    const updated = await ProblemReport.findByIdAndUpdate(
      id,
      {
        $set: {
          status,
          resolutionNote,
          ...(isClosing
            ? { resolvedBy: admin.userId, resolvedAt: new Date() }
            : { resolvedBy: "", resolvedAt: null }),
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true, report: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
