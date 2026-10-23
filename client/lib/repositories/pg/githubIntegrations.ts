import { eq } from "drizzle-orm";
import { githubIntegrations } from "@/db/postgres/schema";
import { db } from "./db";

export async function findByUserId(userId: string) {
  const rows = await db().select().from(githubIntegrations).where(eq(githubIntegrations.userId, userId));
  return rows[0] ?? null;
}

export async function findSettings(userId: string) {
  const rows = await db().select({
    githubUsername: githubIntegrations.githubUsername,
    repoName: githubIntegrations.repoName,
    repoPrivate: githubIntegrations.repoPrivate,
    defaultBranch: githubIntegrations.defaultBranch,
  }).from(githubIntegrations).where(eq(githubIntegrations.userId, userId));
  return rows[0] ?? null;
}

export async function saveConnection(userId: string, githubId: string, githubUsername: string, accessToken: string) {
  const set = { githubId, githubUsername, accessToken, updatedAt: new Date() };
  await db().insert(githubIntegrations).values({ userId, ...set })
    .onConflictDoUpdate({ target: githubIntegrations.userId, set });
}

export async function deleteByUserId(userId: string) {
  await db().delete(githubIntegrations).where(eq(githubIntegrations.userId, userId));
}
