/**
 * Admin reads across user-bearing collections. Delegates to data/repositories,
 * where DATA_BACKEND picks the database.
 */
import * as coins from "../data/repositories/coins.ts";
import * as commentStats from "../data/repositories/comments.ts";
import * as profiles from "../data/repositories/profiles.ts";
import * as roles from "../data/repositories/roles.ts";
import * as submissionStats from "../data/repositories/submissions.ts";

export interface SubmissionUserAggregate {
  _id: string;
  userName?: string;
  userImageUrl?: string;
  totalSubmissions: number;
  accepted: number;
  firstSeenAt?: Date;
  lastActiveAt?: Date;
  solvedSlugs: string[];
}

export interface CommentUserAggregate {
  _id: string;
  count: number;
  userName?: string;
  userImageUrl?: string;
}

export interface AdminRoleRow {
  userId: string;
  userName: string;
  role: string;
  grantedBy: string;
  createdAt?: Date;
}

export interface UserSources {
  profiles: { userId: string; username: string; createdAt?: Date }[];
  submissions: SubmissionUserAggregate[];
  comments: CommentUserAggregate[];
  coins: { userId: string; balance: number }[];
  adminIds: string[];
}

export class AdminRepository {
  async userSources(): Promise<UserSources> {
    const [profileRows, submissions, comments, balances, adminIds] = await Promise.all([
      profiles.listAllSummaries(),
      submissionStats.statsByUser(),
      commentStats.statsByUser(),
      coins.listBalances(),
      roles.listAdminUserIds(),
    ]);
    return {
      profiles: profileRows.map((p) => ({
        userId: p.userId,
        username: p.username,
        ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      })),
      submissions,
      comments,
      coins: balances.map((c) => ({ userId: c.userId, balance: c.balance })),
      adminIds,
    };
  }

  async listAdmins(): Promise<AdminRoleRow[]> {
    const rows = await roles.listAdminRoles();
    return rows.map((r) => ({
      userId: r.userId,
      userName: r.userName ?? "",
      role: r.role ?? "admin",
      grantedBy: r.grantedBy,
      ...(r.createdAt ? { createdAt: r.createdAt } : {}),
    }));
  }

  /** Grant (or re-grant) admin; the grant time is stamped by the store. */
  grantAdmin(input: { targetUserId: string; targetUserName: string; grantedBy: string }): Promise<void> {
    return roles.grantAdmin(input.targetUserId, input.targetUserName, input.grantedBy);
  }

  /** True when a role row was removed. */
  revokeAdmin(targetUserId: string): Promise<boolean> {
    return roles.revokeAdmin(targetUserId);
  }
}
