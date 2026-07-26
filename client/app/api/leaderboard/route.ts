import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";
import { UserProfile } from "@/models/UserProfile";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/leaderboard?page=1&limit=25&sort=score|solved|acceptance
 *
 * Server-side pagination + a batched UserProfile join so rows can link to public
 * profiles (/profile/[username]).
 *
 * Semantics worth knowing:
 *  - `rank` is ALWAYS the canonical score-based rank (score desc, solved as the
 *    tiebreak). Sorting by solved/acceptance reorders rows but does not renumber
 *    them — "#4" means the same thing under every sort.
 *  - `me` is the caller's own row + rank regardless of which page they request,
 *    so the "my rank" card works from any page.
 *
 * NOTE: this still aggregates the whole submissions collection in memory on every
 * request (pre-existing behaviour). The backend /api/v1 rewrite replaces it with a
 * Mongo aggregation; pagination here trims the response, not the query cost.
 */

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 5;
const MAX_LIMIT = 100;

type SortKey = "score" | "solved" | "acceptance";

function parseSort(raw: string | null): SortKey {
    return raw === "solved" || raw === "acceptance" ? raw : "score";
}

function parsePositiveInt(raw: string | null, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const sort = parseSort(searchParams.get("sort"));
        const limit = Math.min(
            MAX_LIMIT,
            Math.max(MIN_LIMIT, parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT)),
        );
        const requestedPage = parsePositiveInt(searchParams.get("page"), 1);

        await connectToDatabase();

        // Aggregate per-user stats from submissions
        const submissions = await Submission.find().lean();

        const totalProblems = await Problem.countDocuments();
        const [easyCount, mediumCount, hardCount] = await Promise.all([
            Problem.countDocuments({ difficulty: "Easy" }),
            Problem.countDocuments({ difficulty: "Medium" }),
            Problem.countDocuments({ difficulty: "Hard" }),
        ]);

        // Difficulty map: slug → difficulty
        const problems = await Problem.find().select("slug difficulty").lean();
        const diffMap: Record<string, string> = {};
        for (const problem of problems) {
            diffMap[problem.slug] = problem.difficulty;
        }

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

        for (const sub of submissions) {
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

        // One batched lookup for public-profile usernames — never per-row (N+1).
        const userIds = Object.keys(userMap);
        const profiles = userIds.length
            ? await UserProfile.find({ userId: { $in: userIds } })
                  .select("userId username")
                  .lean()
            : [];
        const usernameByUserId = new Map<string, string>();
        for (const profile of profiles) {
            usernameByUserId.set(profile.userId, profile.username);
        }

        // Build rows
        const rows = Object.values(userMap).map((u) => {
            const solved = Array.from(u.solvedSlugs);
            const easy = solved.filter((s) => diffMap[s] === "Easy").length;
            const medium = solved.filter((s) => diffMap[s] === "Medium").length;
            const hard = solved.filter((s) => diffMap[s] === "Hard").length;
            // Score: hard=5, medium=3, easy=1
            const score = hard * 5 + medium * 3 + easy;
            const acceptanceRate =
                u.totalSubmissions > 0
                    ? Math.round((u.accepted / u.totalSubmissions) * 100)
                    : 0;
            return {
                userId: u.userId,
                userName: u.userName,
                userImageUrl: u.userImageUrl,
                // null = no public profile to link to
                username: usernameByUserId.get(u.userId) ?? null,
                totalSolved: solved.length,
                easy,
                medium,
                hard,
                score,
                totalSubmissions: u.totalSubmissions,
                acceptanceRate,
                rank: 0, // canonical rank, assigned below
            };
        });

        // Canonical ranking first…
        rows.sort((a, b) => b.score - a.score || b.totalSolved - a.totalSolved);
        rows.forEach((row, i) => {
            row.rank = i + 1;
        });

        // The caller's own row, page-independent.
        const { userId: viewerId } = await auth();
        const me = viewerId ? (rows.find((r) => r.userId === viewerId) ?? null) : null;

        // …then the requested presentation order.
        if (sort === "solved") {
            rows.sort((a, b) => b.totalSolved - a.totalSolved || b.score - a.score);
        } else if (sort === "acceptance") {
            rows.sort((a, b) => b.acceptanceRate - a.acceptanceRate || b.score - a.score);
        }

        const totalUsers = rows.length;
        const totalPages = Math.max(1, Math.ceil(totalUsers / limit));
        const page = Math.min(requestedPage, totalPages);
        const start = (page - 1) * limit;

        return NextResponse.json({
            leaderboard: rows.slice(start, start + limit),
            me,
            pagination: { page, limit, totalUsers, totalPages, sort },
            meta: { totalProblems, easyCount, mediumCount, hardCount },
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
