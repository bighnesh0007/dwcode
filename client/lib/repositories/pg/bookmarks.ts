import { and, count, eq } from "drizzle-orm";
import { bookmarks, problems } from "@/db/postgres/schema";
import { db, isHexId, oid } from "./db";

export async function listByUser(userId: string) {
  const rows = await db().select({
    problemId: bookmarks.problemId,
    problemSlug: problems.slug,
    userId: bookmarks.userId,
    createdAt: bookmarks.createdAt,
  }).from(bookmarks).innerJoin(problems, eq(problems.id, bookmarks.problemId))
    .where(eq(bookmarks.userId, userId));
  return rows.map((r) => ({ ...r, problemId: oid(r.problemId) }));
}

export async function countByUser(userId: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(bookmarks).where(eq(bookmarks.userId, userId));
  return row.n;
}

/** Present or absent, explicitly — the shadow mirror applies Mongo's outcome. */
export async function setBookmarked(userId: string, problemId: string, bookmarked: boolean) {
  if (!isHexId(problemId)) throw new Error(`Invalid problem id: ${problemId}`);
  if (bookmarked) await db().insert(bookmarks).values({ userId, problemId }).onConflictDoNothing();
  else await db().delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.problemId, problemId)));
}

/** Add the bookmark if absent, remove it if present. Returns the new state. */
export async function toggle(userId: string, problemId: string, _problemSlug: string): Promise<boolean> {
  if (!isHexId(problemId)) throw new Error(`Invalid problem id: ${problemId}`);
  return db().transaction(async (t) => {
    const removed = await t.delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.problemId, problemId)))
      .returning({ userId: bookmarks.userId });
    if (removed.length) return false;
    await t.insert(bookmarks).values({ userId, problemId }).onConflictDoNothing();
    return true;
  });
}
