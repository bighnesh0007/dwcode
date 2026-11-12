import { UserProfile } from "../../../models/UserProfile.ts";
import { connect } from "../shared.ts";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function findByUserId(userId: string) {
  await connect();
  return UserProfile.findOne({ userId }).lean();
}

export async function findByUsername(username: string) {
  await connect();
  return UserProfile.findOne({ username }).lean();
}

/** Case-insensitive exact match. */
export async function findByUsernameIgnoreCase(username: string) {
  await connect();
  return UserProfile.findOne({
    username: { $regex: `^${escapeRegex(username)}$`, $options: "i" },
  }).lean();
}

export async function usernameExists(username: string): Promise<boolean> {
  await connect();
  return Boolean(await UserProfile.exists({ username }));
}

export async function create(userId: string, username: string) {
  await connect();
  const doc = await UserProfile.create({ userId, username, bio: "" });
  return doc.toObject();
}

/**
 * Set username (and bio when given), creating the profile if it does not exist.
 * An omitted bio leaves the stored one alone, so a rename never wipes it.
 */
export async function upsertUsernameAndBio(userId: string, username: string, bio?: string) {
  await connect();
  return UserProfile.findOneAndUpdate(
    { userId },
    { $set: { username, ...(bio === undefined ? {} : { bio }) } },
    { returnDocument: "after", upsert: true },
  ).lean();
}

export async function isFollowing(followerId: string, targetUserId: string): Promise<boolean> {
  await connect();
  const viewer = await UserProfile.findOne({ userId: followerId }).select("following").lean();
  return viewer?.following.includes(targetUserId) ?? false;
}

export async function follow(followerId: string, targetUserId: string) {
  await connect();
  await UserProfile.updateOne({ userId: followerId }, { $addToSet: { following: targetUserId } });
  await UserProfile.updateOne({ userId: targetUserId }, { $addToSet: { followers: followerId } });
}

/** Remove the follow edge if present. True when an edge was removed. */
export async function unfollow(followerId: string, targetUserId: string): Promise<boolean> {
  await connect();
  const res = await UserProfile.updateOne(
    { userId: followerId, following: targetUserId },
    { $pull: { following: targetUserId } },
  );
  if (res.modifiedCount === 0) return false;
  await UserProfile.updateOne({ userId: targetUserId }, { $pull: { followers: followerId } });
  return true;
}

/** userId → username, for the given users. One query, never per-row. */
export async function usernamesByUserId(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  await connect();
  const rows = await UserProfile.find({ userId: { $in: userIds } }).select("userId username").lean();
  for (const row of rows) map.set(row.userId, row.username);
  return map;
}

/** Every profile's id, username and creation date — for the admin directory. */
export async function listAllSummaries() {
  await connect();
  return UserProfile.find().select("userId username createdAt").lean();
}
