import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import { Submission } from "@/models/Submission";
import { Bookmark } from "@/models/Bookmark";
import { GitHubIntegration } from "@/models/GitHubIntegration";
import { UserProfile } from "@/models/UserProfile";
import { getErrorMessage } from "@/lib/errors";

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        // ── Problem stats ──────────────────────────────────────────────────────
        const [totalProblems, easyCount, mediumCount, hardCount, aiCount, manualCount] =
            await Promise.all([
                Problem.countDocuments(),
                Problem.countDocuments({ difficulty: "Easy" }),
                Problem.countDocuments({ difficulty: "Medium" }),
                Problem.countDocuments({ difficulty: "Hard" }),
                Problem.countDocuments({ createdByAI: true }),
                Problem.countDocuments({ createdByAI: false }),
            ]);

        // ── Submission stats ───────────────────────────────────────────────────
        const allSubmissions = await Submission.find({ userId }).sort({ createdAt: -1 }).lean();
        const totalSubmissions = allSubmissions.length;

        const acceptedSlugs = new Set(
            allSubmissions.filter((submission) => submission.status === "Accepted").map((submission) => submission.problemSlug)
        );
        const attemptedSlugs = new Set(
            allSubmissions
                .filter((submission) => submission.status !== "Accepted")
                .map((submission) => submission.problemSlug)
                .filter((slug: string) => !acceptedSlugs.has(slug))
        );

        const solvedCount = acceptedSlugs.size;
        const attemptedCount = attemptedSlugs.size;

        // Solve breakdown by difficulty
        const solvedProblems = await Problem.find({ slug: { $in: Array.from(acceptedSlugs) } })
            .select("difficulty")
            .lean();
        const solvedEasy = solvedProblems.filter((problem) => problem.difficulty === "Easy").length;
        const solvedMedium = solvedProblems.filter((problem) => problem.difficulty === "Medium").length;
        const solvedHard = solvedProblems.filter((problem) => problem.difficulty === "Hard").length;

        // Acceptance rate
        const acceptedCount = allSubmissions.filter((submission) => submission.status === "Accepted").length;
        const acceptanceRate =
            totalSubmissions > 0 ? Math.round((acceptedCount / totalSubmissions) * 100) : 0;

        // ── Bookmarks ──────────────────────────────────────────────────────────
        const bookmarkCount = await Bookmark.countDocuments({ userId });

        // ── Activity: submissions per day (last 30 days) ───────────────────────
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSubmissions = allSubmissions.filter(
            (submission) => new Date(submission.createdAt) >= thirtyDaysAgo
        );

        // Build a map: "YYYY-MM-DD" -> count
        const activityMap: Record<string, number> = {};
        for (const sub of recentSubmissions) {
            const day = new Date(sub.createdAt).toISOString().split("T")[0];
            activityMap[day] = (activityMap[day] ?? 0) + 1;
        }

        // Fill all 30 days so the chart has no gaps
        const activityData: { date: string; count: number }[] = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split("T")[0];
            activityData.push({ date: key, count: activityMap[key] ?? 0 });
        }

        // ── Recent submissions (for log) ──────────────────────────────────────
        const recentLog = allSubmissions.slice(0, 20).map((submission) => ({
            problemSlug: submission.problemSlug,
            status: submission.status,
            executionTime: submission.executionTime,
            createdAt: submission.createdAt,
        }));

        // ── Streak ────────────────────────────────────────────────────────────
        let streak = 0;
        const today = new Date().toISOString().split("T")[0];
        for (let i = 0; i < 365; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split("T")[0];
            if (activityMap[key] || (i === 0 && activityMap[today])) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }

        // ── GitHub Integration ────────────────────────────────────────────────
        const githubIntegration = await GitHubIntegration.findOne({ userId }).lean();

        // ── User Profile ──────────────────────────────────────────────────────
        const userProfile = await UserProfile.findOne({ userId }).lean();

        return NextResponse.json({
            githubConnected: !!githubIntegration,
            githubUsername: githubIntegration?.githubUsername ?? null,
            username: userProfile?.username ?? null,
            bio: userProfile?.bio ?? "",
            followers: userProfile?.followers.length ?? 0,
            following: userProfile?.following.length ?? 0,
            problems: {
                total: totalProblems,
                easy: easyCount,
                medium: mediumCount,
                hard: hardCount,
                createdByAI: aiCount,
                createdManually: manualCount,
            },
            submissions: {
                total: totalSubmissions,
                accepted: acceptedCount,
                acceptanceRate,
            },
            solved: {
                total: solvedCount,
                easy: solvedEasy,
                medium: solvedMedium,
                hard: solvedHard,
            },
            attempted: attemptedCount,
            bookmarks: bookmarkCount,
            streak,
            activityData,
            recentLog,
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
