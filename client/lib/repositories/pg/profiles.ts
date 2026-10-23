import { and, eq, inArray, sql } from "drizzle-orm";
import { follows, profiles } from "@/db/postgres/schema";
import { db } from "./db";

/**
 * A profile with Mongo's mirrored `followers` / `following` arrays, rebuilt
 * from the `follows` edges.
 */
const withEdges = {
  userId: profiles.userId,
  username: profiles.username,
  bio: profiles.bio,
  createdAt: profiles.createdAt,
  updatedAt: profiles.updatedAt,
  followers: sql<string[]>`array(select ${follows.followerId} from ${follows} where ${follows.followedId} = ${profiles.userId} order by ${follows.createdAt})`,
  following: sql<string[]>`array(select ${follows.followedId} from ${follows} where ${follows.followerId} = ${profiles.userId} order by ${follows.createdAt})`,
};

async function one(where: ReturnType<typeof eq>) {
  const rows = await db().select(withEdges).from(profiles).where(where).limit(1);
  return rows[0] ?? null;
}

export const findByUserId = (userId: string) => one(eq(profiles.userId, userId));

export const findByUsername = (username: string) => one(eq(profiles.username, username));

/** Case-insensitive exact match. */
export const findByUsernameIgnoreCase = (username: string) =>
  one(sql`lower(${profiles.username}) = lower(${username})`);

export async function usernameExists(username: string): Promise<boolean> {
  return Boolean(await findByUsername(username));
}

export async function create(userId: string, username: string, preset?: { createdAt: Date }) {
  await db().insert(profiles).values({
    userId, username, bio: "",
    ...(preset && { createdAt: preset.createdAt, updatedAt: preset.createdAt }),
  });
  return findByUserId(userId);
}

/** Set username and bio, creating the profile if it does not exist. */
export async function upsertUsernameAndBio(userId: string, username: string, bio: unknown) {
  const set = { username, bio: typeof bio === "string" ? bio : "", updatedAt: new Date() };
  await db().insert(profiles).values({ userId, ...set })
    .onConflictDoUpdate({ target: profiles.userId, set });
  return findByUserId(userId);
}

export async function isFollowing(followerId: string, targetUserId: string): Promise<boolean> {
  const rows = await db().select({ f: follows.followerId }).from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followedId, targetUserId))).limit(1);
  return rows.length > 0;
}

/** Both profiles' `updatedAt` move with the edge, as Mongo's two updates do. */
const touch = (t: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], ids: string[]) =>
  t.update(profiles).set({ updatedAt: new Date() }).where(inArray(profiles.userId, ids));

/** One edge row and the two timestamps, in one transaction. Idempotent. */
export async function follow(followerId: string, targetUserId: string) {
  if (followerId === targetUserId) return;
  await db().transaction(async (t) => {
    await t.insert(follows).values({ followerId, followedId: targetUserId }).onConflictDoNothing();
    await touch(t, [followerId, targetUserId]);
  });
}

export async function unfollow(followerId: string, targetUserId: string) {
  await db().transaction(async (t) => {
    await t.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followedId, targetUserId)));
    await touch(t, [followerId, targetUserId]);
  });
}

export async function usernamesByUserId(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const rows = await db().select({ userId: profiles.userId, username: profiles.username })
    .from(profiles).where(inArray(profiles.userId, userIds));
  for (const row of rows) map.set(row.userId, row.username);
  return map;
}

export async function listAllSummaries() {
  return db().select({ userId: profiles.userId, username: profiles.username, createdAt: profiles.createdAt })
    .from(profiles);
}
