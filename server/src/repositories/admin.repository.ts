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
import { UserRole } from "../models/UserRole.ts";

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
    const [profiles, submissions, comments, coins, roles] = await Promise.all([
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
      UserRole.find({ role: "admin" }).select("userId").lean(),
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
      adminIds: roles.map((r) => r.userId),
    };
  }

  async listAdmins(): Promise<AdminRoleRow[]> {
    const rows = await UserRole.find({ role: "admin" }).lean();
    return rows.map((r) => ({
      userId: r.userId,
      userName: r.userName ?? "",
      role: r.role ?? "admin",
      grantedBy: r.grantedBy,
      ...(r.createdAt ? { createdAt: r.createdAt } : {}),
    }));
  }

  async grantAdmin(input: { targetUserId: string; targetUserName: string; grantedBy: string; now: Date }): Promise<void> {
    await UserRole.updateOne(
      { userId: input.targetUserId },
      {
        $set: { userName: input.targetUserName, role: "admin", grantedBy: input.grantedBy, createdAt: input.now },
        $setOnInsert: { userId: input.targetUserId },
      },
      { upsert: true },
    );
  }

  async revokeAdmin(targetUserId: string): Promise<boolean> {
    const result = await UserRole.deleteOne({ userId: targetUserId });
    return result.deletedCount > 0;
  }
}
