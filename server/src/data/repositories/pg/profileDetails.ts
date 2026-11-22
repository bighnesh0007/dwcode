import { asc, desc, eq, inArray } from "drizzle-orm";
import { profileDetails } from "../../postgres/schema.ts";
import type { ProfileDetailPatch } from "../mongo/profileDetails.ts";
import { db } from "./db.ts";

export async function get(userId: string) {
  const [row] = await db().select().from(profileDetails).where(eq(profileDetails.userId, userId)).limit(1);
  return row ?? null;
}

export async function getMany(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db().select().from(profileDetails).where(inArray(profileDetails.userId, userIds)).orderBy(asc(profileDetails.userId));
}

export async function upsert(userId: string, patch: ProfileDetailPatch) {
  const set = { ...patch, updatedAt: new Date() };
  const [row] = await db().insert(profileDetails).values({ userId, ...set })
    .onConflictDoUpdate({ target: profileDetails.userId, set }).returning();
  return row ?? null;
}

export async function listMentors(limit: number) {
  return db().select().from(profileDetails).where(eq(profileDetails.mentorActive, true))
    .orderBy(desc(profileDetails.updatedAt)).limit(limit);
}
