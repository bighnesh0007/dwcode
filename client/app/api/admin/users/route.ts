import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminCheck";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Comment } from "@/models/Comment";
import { UserRole } from "@/models/UserRole";
import { UserCoins } from "@/models/UserCoins";
import { UserProfile } from "@/models/UserProfile";
import { getErrorMessage } from "@/lib/errors";

/**
 * Admin user directory.
 *
 * Previously this derived the entire user list from a `Submission.aggregate()`,
 * which meant any user who had signed up but never submitted was structurally
 * invisible — the usual case for a new or lurking user, and the reason the admin
 * page could look empty while the platform had plenty of users.
 *
 * Users are now the UNION of every collection that records a Clerk userId, with
 * `UserProfile` (created on first authenticated load) as the primary registry.
 * Activity stats are left-joined on top, defaulting to zero.
 */

interface SubmissionUserAggregate {
    _id: string;
    userName?: string;
    userImageUrl?: string;
    totalSubmissions: number;
    accepted: number;
    firstSeenAt?: Date;
    lastActiveAt?: Date;
    solvedSlugs: string[];
}

interface CommentUserAggregate {
    _id: string;
    count: number;
    userName?: string;
    userImageUrl?: string;
}

export interface AdminUserRow {
    userId: string;
    userName: string;
    userImageUrl: string;
    username: string | null;
    totalSubmissions: number;
    accepted: number;
    solvedCount: number;
    commentCount: number;
    coins: number;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    hasProfile: boolean;
    joinedAt: string | null;
    lastActiveAt: string | null;
}

export async function GET() {
    try {
        const admin = await requireAdmin();
        if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        await connectToDatabase();

        const [profiles, submissionUsers, commentUsers, coins, roles] = await Promise.all([
            UserProfile.find().select("userId username createdAt").lean(),
            Submission.aggregate<SubmissionUserAggregate>([
                {
                    $group: {
                        _id: "$userId",
                        userName: { $last: "$userName" },
                        userImageUrl: { $last: "$userImageUrl" },
                        totalSubmissions: { $sum: 1 },
                        accepted: { $sum: { $cond: [{ $eq: ["$status", "Accepted"] }, 1, 0] } },
                        firstSeenAt: { $min: "$createdAt" },
                        lastActiveAt: { $max: "$createdAt" },
                        solvedSlugs: {
                            $addToSet: {
                                $cond: [{ $eq: ["$status", "Accepted"] }, "$problemSlug", "$$REMOVE"],
                            },
                        },
                    },
                },
            ]),
            Comment.aggregate<CommentUserAggregate>([
                {
                    $group: {
                        _id: "$userId",
                        count: { $sum: 1 },
                        userName: { $last: "$userName" },
                        userImageUrl: { $last: "$userImageUrl" },
                    },
                },
            ]),
            UserCoins.find().select("userId balance").lean(),
            UserRole.find({ role: "admin" }).select("userId").lean(),
        ]);

        const submissionMap = new Map<string, SubmissionUserAggregate>();
        for (const row of submissionUsers) if (row._id) submissionMap.set(row._id, row);

        const commentMap = new Map<string, CommentUserAggregate>();
        for (const row of commentUsers) if (row._id) commentMap.set(row._id, row);

        const coinMap = new Map<string, number>();
        for (const row of coins) coinMap.set(row.userId, row.balance);

        const profileMap = new Map<string, { username: string; createdAt?: Date }>();
        for (const row of profiles) {
            profileMap.set(row.userId, {
                username: row.username,
                ...(row.createdAt ? { createdAt: row.createdAt } : {}),
            });
        }

        const adminSet = new Set(roles.map((role) => role.userId));
        const superAdminId = process.env.SUPER_ADMIN_USER_ID ?? "";

        // Union every source that knows about a user. An empty-string userId is a
        // legacy anonymous row, not a user, so it is excluded.
        const userIds = new Set<string>();
        for (const id of profileMap.keys()) if (id) userIds.add(id);
        for (const id of submissionMap.keys()) if (id) userIds.add(id);
        for (const id of commentMap.keys()) if (id) userIds.add(id);
        for (const id of coinMap.keys()) if (id) userIds.add(id);
        for (const id of adminSet) if (id) userIds.add(id);
        if (superAdminId) userIds.add(superAdminId);

        const users: AdminUserRow[] = [...userIds].map((userId) => {
            const sub = submissionMap.get(userId);
            const comment = commentMap.get(userId);
            const profile = profileMap.get(userId);

            // Display name: prefer the most recent activity record, fall back to the
            // profile username, then to a stable placeholder.
            const userName =
                sub?.userName || comment?.userName || profile?.username || "Unknown user";

            const joinedAt = profile?.createdAt ?? sub?.firstSeenAt ?? null;

            return {
                userId,
                userName,
                userImageUrl: sub?.userImageUrl || comment?.userImageUrl || "",
                username: profile?.username ?? null,
                totalSubmissions: sub?.totalSubmissions ?? 0,
                accepted: sub?.accepted ?? 0,
                solvedCount: sub?.solvedSlugs?.length ?? 0,
                commentCount: comment?.count ?? 0,
                coins: coinMap.get(userId) ?? 0,
                isAdmin: adminSet.has(userId) || userId === superAdminId,
                isSuperAdmin: userId === superAdminId,
                hasProfile: profile !== undefined,
                joinedAt: joinedAt ? new Date(joinedAt).toISOString() : null,
                lastActiveAt: sub?.lastActiveAt ? new Date(sub.lastActiveAt).toISOString() : null,
            };
        });

        // Most active first, then most recently joined, then a stable tiebreak.
        users.sort(
            (a, b) =>
                b.solvedCount - a.solvedCount ||
                b.totalSubmissions - a.totalSubmissions ||
                (b.joinedAt ?? "").localeCompare(a.joinedAt ?? "") ||
                a.userId.localeCompare(b.userId),
        );

        return NextResponse.json({
            users,
            isSuperAdmin: admin.isSuperAdmin,
            counts: {
                total: users.length,
                withProfile: users.filter((u) => u.hasProfile).length,
                active: users.filter((u) => u.totalSubmissions > 0).length,
                admins: users.filter((u) => u.isAdmin).length,
            },
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
