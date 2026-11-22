import { eq } from "drizzle-orm";
import { learnerStates } from "../../postgres/schema.ts";
import { db } from "./db.ts";

export async function get(userId: string): Promise<unknown> {
  const rows = await db().select({ state: learnerStates.state }).from(learnerStates).where(eq(learnerStates.userId, userId));
  return rows[0]?.state ?? null;
}

export async function put(userId: string, state: unknown): Promise<void> {
  const row = { state, updatedAt: new Date() };
  await db().insert(learnerStates).values({ userId, ...row }).onConflictDoUpdate({ target: learnerStates.userId, set: row });
}
