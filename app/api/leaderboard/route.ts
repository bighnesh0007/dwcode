import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";

export async function GET() {
    try {
        await connectToDatabase();

        // Aggregate per-user stats from submissions
        // Each submission has: userId (Clerk), userName, problemSlug, status
        const submissions = await Submission.find().lean();

        const totalProblems = await Problem.countDocuments();
        const [easyCount, mediumCount, hardCount] = await Promise.all([
            Problem.countDocuments({ difficulty: "Easy" }),
            Problem.countDocuments({ difficulty: "Medium" }),
            Problem.countDocuments({ difficulty: "Hard" }),
        ]);

        // Get difficulty map  slug → difficulty
        const problems = await Problem.find().select("slug difficulty").lean();
        const diffMap: Record<string, string> = {};
        for (const p of problems as any[]) diffMap[p.slug] = p.difficulty;

        // Group by userId
        const userMap: Record<
            string,
            {
                userId: string;
                userName: string;
                userImageUrl: string;
                solvedSlugs: Set<string>;
                totalSubmissions: number;
                accepted: number;
            }
        > = {};

        for (const sub of submissions as any[]) {
            if (!sub.userId) continue; // skip old submissions without userId
            if (!userMap[sub.userId]) {
                userMap[sub.userId] = {
                    userId: sub.userId,
                    userName: sub.userName || "Anonymous",
                    userImageUrl: sub.userImageUrl || "",
                    solvedSlugs: new Set(),
                    totalSubmissions: 0,
                    accepted: 0,
                };
            }
            userMap[sub.userId].totalSubmissions++;
            if (sub.status === "Accepted") {
                userMap[sub.userId].solvedSlugs.add(sub.problemSlug);
                userMap[sub.userId].accepted++;
            }
        }

        // Build leaderboard rows
        const rows = Object.values(userMap).map((u) => {
            const solved = Array.from(u.solvedSlugs);
            const easy = solved.filter((s) => diffMap[s] === "Easy").length;
            const medium = solved.filter((s) => diffMap[s] === "Medium").length;
            const hard = solved.filter((s) => diffMap[s] === "Hard").length;
            // Score: hard=5, medium=3, easy=1
            const score = hard * 5 + medium * 3 + easy * 1;
            const acceptanceRate =
                u.totalSubmissions > 0
                    ? Math.round((u.accepted / u.totalSubmissions) * 100)
                    : 0;
            return {
                userId: u.userId,
                userName: u.userName,
                userImageUrl: u.userImageUrl,
                totalSolved: solved.length,
                easy,
                medium,
                hard,
                score,
                totalSubmissions: u.totalSubmissions,
                acceptanceRate,
            };
        });

        // Sort by score desc, then by totalSolved
        rows.sort((a, b) => b.score - a.score || b.totalSolved - a.totalSolved);

        return NextResponse.json({
            leaderboard: rows,
            meta: { totalProblems, easyCount, mediumCount, hardCount },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
