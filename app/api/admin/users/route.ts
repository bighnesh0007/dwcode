import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminCheck";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Comment } from "@/models/Comment";
import { UserRole } from "@/models/UserRole";
import { UserCoins } from "@/models/UserCoins";

export async function GET() {
    try {
        const admin = await requireAdmin();
        if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        await connectToDatabase();

        // Aggregate unique users from submissions
        const submissionUsers = await Submission.aggregate([
            {
                $group: {
                    _id: "$userId",
                    userName: { $last: "$userName" },
                    userImageUrl: { $last: "$userImageUrl" },
                    totalSubmissions: { $sum: 1 },
                    accepted: { $sum: { $cond: [{ $eq: ["$status", "Accepted"] }, 1, 0] } },
                    joinedAt: { $min: "$createdAt" },
                    solvedSlugs: { $addToSet: { $cond: [{ $eq: ["$status", "Accepted"] }, "$problemSlug", "$$REMOVE"] } },
                }
            },
        ]);

        // Comment counts per user
        const commentCounts = await Comment.aggregate([
            { $group: { _id: "$userId", count: { $sum: 1 } } },
        ]);
        const commentMap: Record<string, number> = {};
        for (const c of commentCounts) {
            if (c._id) commentMap[c._id] = c.count;
        }

        // Coin balances
        const coins = await UserCoins.find().select("userId balance").lean() as any[];
        const coinMap: Record<string, number> = {};
        for (const c of coins) coinMap[c.userId] = c.balance;

        // Admin roles
        const roles = await UserRole.find({ role: "admin" }).lean() as any[];
        const adminSet = new Set(roles.map((r: any) => r.userId));

        const users = submissionUsers
            .filter(u => u._id) // skip anonymous
            .map(u => ({
                userId: u._id,
                userName: u.userName || "Anonymous",
                userImageUrl: u.userImageUrl || "",
                totalSubmissions: u.totalSubmissions,
                accepted: u.accepted,
                solvedCount: (u.solvedSlugs || []).length,
                commentCount: commentMap[u._id] ?? 0,
                coins: coinMap[u._id] ?? 0,
                isAdmin: adminSet.has(u._id),
                joinedAt: u.joinedAt,
            }))
            .sort((a, b) => b.solvedCount - a.solvedCount);

        return NextResponse.json({ users, isSuperAdmin: admin.isSuperAdmin });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
