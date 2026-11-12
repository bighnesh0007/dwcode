/**
 * UserProfile persistence — no business rules. Delegates to data/repositories,
 * where DATA_BACKEND picks the database.
 */
import * as profiles from "../data/repositories/profiles.ts";

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


export class UserProfileRepository {
  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const doc = await profiles.findByUserId(userId);
    return doc ? toRecord(doc) : null;
  }

  /** Exact username match (case-sensitive), as the follow route did. */
  async findByUsername(username: string): Promise<ProfileRecord | null> {
    const doc = await profiles.findByUsername(username);
    return doc ? toRecord(doc) : null;
  }

  /** Case-insensitive exact match; the input is regex-escaped. */
  async findByUsernameInsensitive(username: string): Promise<ProfileRecord | null> {
    const doc = await profiles.findByUsernameIgnoreCase(username);
    return doc ? toRecord(doc) : null;
  }

  usernameExists(username: string): Promise<boolean> {
    return profiles.usernameExists(username);
  }

  async create(userId: string, username: string): Promise<ProfileRecord> {
    return toRecord(await profiles.create(userId, username));
  }

  /** Sets username (and bio when given); creates the profile when absent. */
  async upsertIdentity(userId: string, username: string, bio: string | undefined): Promise<ProfileRecord> {
    const doc = await profiles.upsertUsernameAndBio(userId, username, bio);
    if (!doc) throw new Error("upsert returned no document");
    return toRecord(doc);
  }

  /** Removes the follow edge if present. True when an edge was removed. */
  unfollow(userId: string, targetUserId: string): Promise<boolean> {
    return profiles.unfollow(userId, targetUserId);
  }

  follow(userId: string, targetUserId: string): Promise<void> {
    return profiles.follow(userId, targetUserId);
  }

  /** userId → username for a batch of users (one query, never per row). */
  usernamesFor(userIds: string[]): Promise<Map<string, string>> {
    return profiles.usernamesByUserId(userIds);
  }
}
