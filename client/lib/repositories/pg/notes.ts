import { and, eq } from "drizzle-orm";
import { notes, problems } from "@/db/postgres/schema";
import { db, isHexId, oid } from "./db";

const columns = {
  userId: notes.userId,
  problemId: notes.problemId,
  problemSlug: problems.slug,
  content: notes.content,
  updatedAt: notes.updatedAt,
};

const shape = (row: { problemId: string } & Record<string, unknown>) => ({ ...row, problemId: oid(row.problemId) });

export async function findOwn(userId: string, problemId: string) {
  if (!isHexId(problemId)) return null;
  const rows = await db().select(columns).from(notes)
    .innerJoin(problems, eq(problems.id, notes.problemId))
    .where(and(eq(notes.userId, userId), eq(notes.problemId, problemId)));
  return rows[0] ? shape(rows[0]) : null;
}

/** Keyed by (userId, problemId), so the upsert can only ever touch the caller's row. */
export async function saveOwn(userId: string, problemId: string, _problemSlug: string, content: string) {
  if (!isHexId(problemId)) throw new Error(`Invalid problem id: ${problemId}`);
  const updatedAt = new Date();
  await db().insert(notes).values({ userId, problemId, content, updatedAt })
    .onConflictDoUpdate({ target: [notes.userId, notes.problemId], set: { content, updatedAt } });
  return findOwn(userId, problemId);
}
