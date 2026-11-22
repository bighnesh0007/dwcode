import { eq } from "drizzle-orm";
import { appSettings } from "../../postgres/schema.ts";
import { db } from "./db.ts";

export async function get(key: string): Promise<unknown> {
  const rows = await db().select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return rows[0]?.value ?? null;
}

export async function set(key: string, value: unknown, updatedBy: string): Promise<void> {
  const row = { value, updatedBy, updatedAt: new Date() };
  await db().insert(appSettings).values({ key, ...row }).onConflictDoUpdate({ target: appSettings.key, set: row });
}
