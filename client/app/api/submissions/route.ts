import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import * as problems from "@/lib/repositories/problems";
import * as submissions from "@/lib/repositories/submissions";
import { isValidId } from "@/lib/repositories/shared";
import { COIN_RULES, coinRewardFor } from "@dwcode/shared";
import { awardCoins } from "@/lib/coins";
import { gradeSubmission } from "@/lib/grading";
import { GRADE_HIDDEN_TESTS } from "@/lib/config";
import { pushSolutionToGithub } from "@/lib/github";
import { getErrorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json([]);
    }
    return NextResponse.json(await submissions.listByUser(userId));
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/submissions — the server grades; the client no longer votes.
 *
 * SECURITY HISTORY (audit finding C-4). This used to accept `status` from the
 * request body and persist it with `new Submission({ ...data, ... })`, then pay
 * out coins on it. Posting `{"status":"Accepted"}` was worth a first-solve
 * bonus, a difficulty bonus, a leaderboard solve and a public GitHub commit —
 * no DataWeave required. Looping over /api/problems put any account at rank #1.
 *
 * The accepted body is now `{ problemId, code, input? }`. Everything else —
 * status, slug, execution time, output, identity — is derived server-side.
 * A body carrying `status` is REJECTED rather than ignored, so forgery attempts
 * surface as 400s in the logs instead of failing quietly.
 *
 * Anonymous submissions are no longer accepted. They previously saved with
 * `userId: ""`, producing rows that no feature could attribute and that the
 * admin directory had to filter out as "legacy anonymous".
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Loud rather than silent: a caller sending a verdict is either a stale
    // client or someone probing, and both are worth seeing.
    if (body && typeof body === "object" && "status" in body) {
      return NextResponse.json(
        { success: false, error: "`status` is computed by the server and must not be supplied." },
        { status: 400 },
      );
    }

    const { problemId, code, input } = body ?? {};

    if (!isValidId(problemId)) {
      return NextResponse.json({ success: false, error: "invalid problemId" }, { status: 400 });
    }
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ success: false, error: "code is required" }, { status: 400 });
    }

    // Test cases come from the database, never from the client.
    const problem = await problems.findForGrading(problemId);
    if (!problem) {
      return NextResponse.json({ success: false, error: "Problem not found" }, { status: 404 });
    }

    const grade = await gradeSubmission(
      code,
      problem.testCases ?? [],
      problem.examples ?? [],
      GRADE_HIDDEN_TESTS ? (problem.hiddenTestCases ?? []) : [],
    );

    const user = await currentUser();
    const submission = await submissions.create({
      problemId,
      problemSlug: problem.slug,
      userId,
      userName: user?.fullName || user?.username || "Anonymous",
      userImageUrl: user?.imageUrl || "",
      code,
      input: typeof input === "string" ? input : "{}",
      output: grade.output,
      status: grade.status,
      executionTime: grade.executionTime,
    });

    // Coins are awarded against the SERVER's verdict.
    if (grade.status === "Accepted") {
      try {
        if (!(await submissions.hasOtherAccepted(userId, problemId, submission._id))) {
          await awardCoins(
            userId,
            COIN_RULES.firstSolve,
            "first_solve",
            `First solve: ${problem.slug}`,
          );
        }

        // Difficulty bonus (always on accepted). The table lives in the shared
        // difficulty registry — it used to be inlined here AND restated in
        // server/src/config/constants.ts, free to drift (REF-01).
        await awardCoins(
          userId,
          coinRewardFor(problem.difficulty),
          "difficulty_bonus",
          `${problem.difficulty} problem solved`,
        );

        // Push to github in background
        void pushSolutionToGithub(userId, problem, code).catch((error: unknown) =>
          console.error("GitHub push error:", error),
        );
      } catch (coinErr) {
        console.error("[coins] award failed:", coinErr);
      }
    }

    return NextResponse.json({
      success: true,
      submission,
      status: grade.status,
      summary: grade.summary,
      results: grade.results,
      executionTime: grade.executionTime,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
