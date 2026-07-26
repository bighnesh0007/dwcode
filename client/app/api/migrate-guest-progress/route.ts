import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";
import { GUEST_MIGRATION_ENABLED } from "@/lib/config";
import { getErrorMessage } from "@/lib/errors";

/**
 * POST /api/migrate-guest-progress — DISABLED BY DEFAULT (audit finding C-5).
 *
 * This took a client-supplied list of slugs and wrote an `Accepted` submission
 * for each with NO verification that the user had ever run any code. One request
 * marked every problem on the platform solved, granting leaderboard rank and
 * solved counts for free. There was no cap on the array length either, so it
 * doubled as an unbounded write loop.
 *
 * Gated off rather than deleted so the feature can return once submissions are
 * graded server-side (FEAT-01): at that point a guest's claimed solves can be
 * RE-GRADED against stored code instead of taken on trust.
 *
 * While disabled this returns 503, which components/GuestMigration.tsx already
 * treats as a retryable failure — it leaves localStorage intact, so nothing is
 * lost and the carryover resumes automatically once re-enabled.
 *
 * Set GUEST_MIGRATION_ENABLED=true only after FEAT-01 lands.
 */
export async function POST(req: Request) {
  try {
    if (!GUEST_MIGRATION_ENABLED) {
      return NextResponse.json(
        {
          error:
            "Guest progress migration is temporarily disabled while submission grading moves server-side.",
        },
        { status: 503 },
      );
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slugs } = await req.json();
    if (!Array.isArray(slugs) || slugs.length === 0) {
      return NextResponse.json({ migrated: 0 });
    }

    await connectToDatabase();

    let count = 0;
    for (const slug of slugs) {
      const exists = await Submission.exists({ userId, problemSlug: slug, status: "Accepted" });
      if (exists) continue;

      const problem = await Problem.findOne({ slug });
      if (!problem) continue;

      const submission = new Submission({
        problemId: problem._id,
        problemSlug: slug,
        userId,
        userName: "Migrated",
        code: "// migrated from guest session",
        input: "{}",
        output: "",
        status: "Accepted",
        executionTime: "0ms",
      });
      await submission.save();
      count++;
    }

    return NextResponse.json({ migrated: count });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
