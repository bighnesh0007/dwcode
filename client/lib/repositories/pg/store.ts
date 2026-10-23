import { and, eq } from "drizzle-orm";
import { storePurchases } from "@/db/postgres/schema";
import { db } from "./db";

export async function listOwnedItemIds(userId: string): Promise<string[]> {
  const rows = await db().select({ itemId: storePurchases.itemId }).from(storePurchases)
    .where(eq(storePurchases.userId, userId));
  return rows.map((r) => r.itemId);
}

export async function hasPurchased(userId: string, itemId: string): Promise<boolean> {
  const rows = await db().select({ itemId: storePurchases.itemId }).from(storePurchases)
    .where(and(eq(storePurchases.userId, userId), eq(storePurchases.itemId, itemId))).limit(1);
  return rows.length > 0;
}

/** The primary key { userId, itemId } makes this idempotent, as in Mongo. */
export async function recordPurchase(userId: string, itemId: string, cost: number): Promise<"created" | "duplicate"> {
  const rows = await db().insert(storePurchases).values({ userId, itemId, cost })
    .onConflictDoNothing().returning({ itemId: storePurchases.itemId });
  return rows.length ? "created" : "duplicate";
}
