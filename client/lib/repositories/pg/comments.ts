import { count, desc, eq, and, sql } from "drizzle-orm";
import { comments } from "@/db/postgres/schema";
import type { CommentTarget, CommentUserStats } from "../mongo/comments";
import { db, isHexId, oid } from "./db";

type Row = typeof comments.$inferSelect;

/** Problem comments carry `problemSlug` too, as Mongo dual-writes it. */
const toDoc = ({ id, ...row }: Row) => ({
  _id: oid(id),
  ...row,
  ...(row.targetType === "problem" ? { problemSlug: row.targetId } : {}),
});

export async function listForTarget(target: CommentTarget, limit: number) {
  const rows = await db().select().from(comments)
    .where(and(eq(comments.targetType, target.targetType), eq(comments.targetId, target.targetId)))
    .orderBy(desc(comments.createdAt)).limit(limit);
  return rows.map(toDoc);
}

export async function create(
  target: CommentTarget,
  author: { userId: string; userName: string; userImageUrl: string },
  content: string,
  preset?: { id: string; createdAt: Date },
) {
  const [row] = await db().insert(comments).values({
    targetType: target.targetType, targetId: target.targetId, ...author, content,
    ...(preset && { id: preset.id, createdAt: preset.createdAt, updatedAt: preset.createdAt }),
  }).returning();
  return toDoc(row);
}

export async function findAuthorId(id: string): Promise<string | null> {
  if (!isHexId(id)) return null;
  const rows = await db().select({ userId: comments.userId }).from(comments).where(eq(comments.id, id));
  return rows[0]?.userId ?? null;
}

export async function deleteById(id: string) {
  if (!isHexId(id)) return;
  await db().delete(comments).where(eq(comments.id, id));
}

export async function statsByUser(): Promise<CommentUserStats[]> {
  return db().select({
    _id: comments.userId,
    count: count(),
    userName: sql<string>`(array_agg(${comments.userName} order by ${comments.createdAt} desc))[1]`,
    userImageUrl: sql<string>`(array_agg(${comments.userImageUrl} order by ${comments.createdAt} desc))[1]`,
  }).from(comments).groupBy(comments.userId);
}
