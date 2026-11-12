import { and, eq } from "drizzle-orm";
import { userRoles } from "../../postgres/schema.ts";
import { db } from "./db.ts";

export async function listAdminRoles() {
  return db().select().from(userRoles).where(eq(userRoles.role, "admin"));
}

export async function listAdminUserIds(): Promise<string[]> {
  const rows = await db().select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.role, "admin"));
  return rows.map((r) => r.userId);
}

export async function hasAdminRole(userId: string): Promise<boolean> {
  const rows = await db().select({ userId: userRoles.userId }).from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin"))).limit(1);
  return rows.length > 0;
}

export async function grantAdmin(targetUserId: string, targetUserName: string, grantedBy: string) {
  const row = { userId: targetUserId, userName: targetUserName, role: "admin" as const, grantedBy, createdAt: new Date() };
  await db().insert(userRoles).values(row).onConflictDoUpdate({ target: userRoles.userId, set: row });
}

/** True when a role row was removed. */
export async function revokeAdmin(targetUserId: string): Promise<boolean> {
  const removed = await db().delete(userRoles).where(eq(userRoles.userId, targetUserId)).returning({ userId: userRoles.userId });
  return removed.length > 0;
}
