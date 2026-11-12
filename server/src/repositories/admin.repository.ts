/**
 * Admin reads across user-bearing collections.
 *
 * `comments` and `userprofiles` are read through the raw collections rather
 * than models: those models belong to other domains, and compiling a second
 * copy of a model under the same name would race their ports.
 */
import mongoose from "mongoose";
import { Submission } from "../models/Submission.ts";
import { UserCoins } from "../models/UserCoins.ts";
import * as roles from "../data/repositories/roles.ts";

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
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database not connected.");
    const [profiles, submissions, comments, coins, adminIds] = await Promise.all([
      db
        .collection<{ userId: string; username: string; createdAt?: Date }>("userprofiles")
        .find({}, { projection: { _id: 0, userId: 1, username: 1, createdAt: 1 } })
        .toArray(),
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
              $addToSet: { $cond: [{ $eq: ["$status", "Accepted"] }, "$problemSlug", "$$REMOVE"] },
            },
          },
        },
      ]),
      db
        .collection("comments")
        .aggregate<CommentUserAggregate>([
          {
            $group: {
              _id: "$userId",
              count: { $sum: 1 },
              userName: { $last: "$userName" },
              userImageUrl: { $last: "$userImageUrl" },
            },
          },
        ])
        .toArray(),
      UserCoins.find().select("userId balance").lean(),
      roles.listAdminUserIds(),
    ]);
    return {
      profiles: profiles.map((p) => ({
        userId: p.userId,
        username: p.username,
        ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      })),
      submissions,
      comments,
      coins: coins.map((c) => ({ userId: c.userId, balance: c.balance })),
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
