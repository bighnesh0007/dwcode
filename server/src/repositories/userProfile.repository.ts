/** UserProfile persistence. Mongoose queries only — no business rules. */
import { UserProfile } from "../models/UserProfile.ts";

export interface ProfileRecord {
  userId: string;
  username: string;
  bio: string;
  followers: string[];
  following: string[];
  createdAt: Date;
}

type LeanProfile = {
  userId: string;
  username: string;
  bio?: string | null;
  followers?: string[] | null;
  following?: string[] | null;
  createdAt?: Date | null;
};

function toRecord(doc: LeanProfile): ProfileRecord {
  return {
    userId: doc.userId,
    username: doc.username,
    bio: doc.bio ?? "",
    followers: doc.followers ?? [],
    following: doc.following ?? [],
    createdAt: doc.createdAt ?? new Date(0),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class UserProfileRepository {
  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const doc = await UserProfile.findOne({ userId }).lean();
    return doc ? toRecord(doc) : null;
  }

  /** Exact username match (case-sensitive), as the follow route did. */
  async findByUsername(username: string): Promise<ProfileRecord | null> {
    const doc = await UserProfile.findOne({ username }).lean();
    return doc ? toRecord(doc) : null;
  }

  /** Case-insensitive exact match; the input is regex-escaped. */
  async findByUsernameInsensitive(username: string): Promise<ProfileRecord | null> {
    const doc = await UserProfile.findOne({
      username: { $regex: `^${escapeRegex(username)}$`, $options: "i" },
    }).lean();
    return doc ? toRecord(doc) : null;
  }

  async usernameExists(username: string): Promise<boolean> {
    return (await UserProfile.exists({ username })) !== null;
  }

  async create(userId: string, username: string): Promise<ProfileRecord> {
    const doc = await UserProfile.create({ userId, username, bio: "" });
    return toRecord(doc.toObject());
  }

  /** Sets username (and bio when given); creates the profile when absent. */
  async upsertIdentity(userId: string, username: string, bio: string | undefined): Promise<ProfileRecord> {
    const doc = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: { username, ...(bio === undefined ? {} : { bio }) } },
      { returnDocument: "after", upsert: true },
    ).lean();
    if (!doc) throw new Error("upsert returned no document");
    return toRecord(doc);
  }

  /** Removes the follow edge if present. True when an edge was removed. */
  async unfollow(userId: string, targetUserId: string): Promise<boolean> {
    const res = await UserProfile.updateOne(
      { userId, following: targetUserId },
      { $pull: { following: targetUserId } },
    );
    if (res.modifiedCount === 0) return false;
    await UserProfile.updateOne({ userId: targetUserId }, { $pull: { followers: userId } });
    return true;
  }

  async follow(userId: string, targetUserId: string): Promise<void> {
    await UserProfile.updateOne({ userId }, { $addToSet: { following: targetUserId } });
    await UserProfile.updateOne({ userId: targetUserId }, { $addToSet: { followers: userId } });
  }

  /** userId → username for a batch of users (one query, never per row). */
  async usernamesFor(userIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (userIds.length === 0) return map;
    const rows = await UserProfile.find({ userId: { $in: userIds } }).select("userId username").lean();
    for (const r of rows) map.set(r.userId, r.username);
    return map;
  }
}
