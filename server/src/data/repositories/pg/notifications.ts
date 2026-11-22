import { and, count, desc, eq, inArray } from "drizzle-orm";
import { notifications } from "../../postgres/schema.ts";
import type { NewNotification } from "../mongo/notifications.ts";
import { db, isHexId, oid } from "./db.ts";

type Row = typeof notifications.$inferSelect;
const toDoc = ({ id, ...row }: Row) => ({ _id: oid(id), ...row });

/** `preset` carries Mongo's id and time when mirroring. */
export async function create(userId: string, n: NewNotification, preset?: { id: string; createdAt: Date }) {
  const [row] = await db().insert(notifications).values({
    userId, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? "",
    ...(preset && { id: preset.id, createdAt: preset.createdAt }),
  }).returning();
  if (!row) throw new Error("Notification vanished after insert");
  return toDoc(row);
}

export async function listForUser(userId: string, limit: number) {
  const rows = await db().select().from(notifications).where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt)).limit(limit);
  return rows.map(toDoc);
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return row?.n ?? 0;
}

export async function markRead(userId: string, ids?: string[]): Promise<void> {
  const scope = ids ? inArray(notifications.id, ids.filter(isHexId)) : eq(notifications.read, false);
  await db().update(notifications).set({ read: true }).where(and(eq(notifications.userId, userId), scope));
}
