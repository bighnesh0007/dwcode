/**
 * Admin user directory and role management. Ported from
 * client/app/api/admin/{users,roles}/route.ts.
 *
 * Users are the UNION of every collection that records a Clerk userId, with
 * UserProfile as the primary registry; activity stats are left-joined on top.
 */
import { ForbiddenError, NotFoundError } from "../../errors/AppError.ts";
import { ErrorCode } from "../../errors/codes.ts";
import type { AdminRepository, AdminRoleRow } from "../../repositories/admin.repository.ts";

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

export interface AdminUsersView {
  users: AdminUserRow[];
  isSuperAdmin: boolean;
  counts: { total: number; withProfile: number; active: number; admins: number };
}

export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly superAdminId: string,
  ) {}

  async listUsers(callerIsSuperAdmin: boolean): Promise<AdminUsersView> {
    const src = await this.repo.userSources();
    const submissionMap = new Map(src.submissions.filter((r) => r._id).map((r) => [r._id, r]));
    const commentMap = new Map(src.comments.filter((r) => r._id).map((r) => [r._id, r]));
    const coinMap = new Map(src.coins.map((r) => [r.userId, r.balance]));
    const profileMap = new Map(src.profiles.map((r) => [r.userId, r]));
    const adminSet = new Set(src.adminIds);
    const superAdminId = this.superAdminId;

    // An empty-string userId is a legacy anonymous row, not a user.
    const userIds = new Set<string>();
    for (const keys of [profileMap.keys(), submissionMap.keys(), commentMap.keys(), coinMap.keys(), adminSet.values()]) {
      for (const id of keys) if (id) userIds.add(id);
    }
    if (superAdminId) userIds.add(superAdminId);

    const users: AdminUserRow[] = [...userIds].map((userId) => {
      const sub = submissionMap.get(userId);
      const comment = commentMap.get(userId);
      const profile = profileMap.get(userId);
      const joinedAt = profile?.createdAt ?? sub?.firstSeenAt ?? null;
      return {
        userId,
        userName: sub?.userName || comment?.userName || profile?.username || "Unknown user",
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

    return {
      users,
      isSuperAdmin: callerIsSuperAdmin,
      counts: {
        total: users.length,
        withProfile: users.filter((u) => u.hasProfile).length,
        active: users.filter((u) => u.totalSubmissions > 0).length,
        admins: users.filter((u) => u.isAdmin).length,
      },
    };
  }

  listAdmins(callerIsSuperAdmin: boolean): Promise<AdminRoleRow[]> {
    requireSuper(callerIsSuperAdmin);
    return this.repo.listAdmins();
  }

  async grant(callerId: string, callerIsSuperAdmin: boolean, target: { userId: string; userName: string }): Promise<void> {
    requireSuper(callerIsSuperAdmin);
    await this.repo.grantAdmin({
      targetUserId: target.userId,
      targetUserName: target.userName,
      grantedBy: callerId,
    });
  }

  async revoke(callerIsSuperAdmin: boolean, targetUserId: string): Promise<void> {
    requireSuper(callerIsSuperAdmin);
    if (!(await this.repo.revokeAdmin(targetUserId))) throw new NotFoundError("That user is not an admin.");
  }
}

function requireSuper(isSuper: boolean): void {
  if (!isSuper) throw new ForbiddenError("Only the super admin can manage admin roles.", ErrorCode.SUPER_ADMIN_REQUIRED);
}
