import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminCheck";
import * as coins from "@/lib/repositories/coins";
import * as comments from "@/lib/repositories/comments";
import * as profiles from "@/lib/repositories/profiles";
import * as roles from "@/lib/repositories/roles";
import * as submissions from "@/lib/repositories/submissions";
import type { CommentUserStats } from "@/lib/repositories/comments";
import type { SubmissionUserStats } from "@/lib/repositories/submissions";
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

type SubmissionUserAggregate = SubmissionUserStats;
type CommentUserAggregate = CommentUserStats;

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

        const [profileRows, submissionUsers, commentUsers, balances, adminIds] = await Promise.all([
            profiles.listAllSummaries(),
            submissions.statsByUser(),
            comments.statsByUser(),
            coins.listBalances(),
            roles.listAdminUserIds(),
        ]);

        const submissionMap = new Map<string, SubmissionUserAggregate>();
        for (const row of submissionUsers) if (row._id) submissionMap.set(row._id, row);

        const commentMap = new Map<string, CommentUserAggregate>();
        for (const row of commentUsers) if (row._id) commentMap.set(row._id, row);

        const coinMap = new Map<string, number>();
        for (const row of balances) coinMap.set(row.userId, row.balance);

        const profileMap = new Map<string, { username: string; createdAt?: Date }>();
        for (const row of profileRows) {
            profileMap.set(row.userId, {
                username: row.username,
                ...(row.createdAt ? { createdAt: row.createdAt } : {}),
            });
        }

        const adminSet = new Set(adminIds);
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
