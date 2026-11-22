import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { contributions } from "../../postgres/schema.ts";
import type { ContributionPatch, NewContribution } from "../mongo/contributions.ts";
import { db, isHexId, oid } from "./db.ts";

type Row = typeof contributions.$inferSelect;
const toDoc = ({ id, ...row }: Row) => ({ _id: oid(id), ...row });

/** `preset` carries Mongo's id and time when mirroring. */
export async function create(c: NewContribution, preset?: { id: string; createdAt: Date }) {
  const [row] = await db().insert(contributions).values({
    kind: c.kind, authorId: c.authorId, status: c.status, payload: c.payload, check: null,
    ...(preset && { id: preset.id, createdAt: preset.createdAt, updatedAt: preset.createdAt }),
  }).returning();
  if (!row) throw new Error("Contribution vanished after insert");
  return toDoc(row);
}

export async function findById(id: string) {
  if (!isHexId(id)) return null;
  const [row] = await db().select().from(contributions).where(eq(contributions.id, id)).limit(1);
  return row ? toDoc(row) : null;
}

export async function listByAuthor(authorId: string, limit: number) {
  const rows = await db().select().from(contributions).where(eq(contributions.authorId, authorId))
    .orderBy(desc(contributions.createdAt)).limit(limit);
  return rows.map(toDoc);
}

export async function listByStatus(status: string, kind: string | undefined, limit: number) {
  const where = kind ? and(eq(contributions.status, status), eq(contributions.kind, kind)) : eq(contributions.status, status);
  const rows = await db().select().from(contributions).where(where).orderBy(asc(contributions.createdAt)).limit(limit);
  return rows.map(toDoc);
}

export async function countByAuthor(authorId: string, kind: string, statuses: string[]): Promise<number> {
  const [row] = await db().select({ n: count() }).from(contributions)
    .where(and(eq(contributions.authorId, authorId), eq(contributions.kind, kind), inArray(contributions.status, statuses)));
  return row?.n ?? 0;
}

export async function transition(id: string, from: string[], patch: ContributionPatch) {
  if (!isHexId(id)) return null;
  const [row] = await db().update(contributions).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contributions.id, id), inArray(contributions.status, from))).returning();
  return row ? toDoc(row) : null;
}

export async function removeDraft(id: string, authorId: string): Promise<boolean> {
  if (!isHexId(id)) return false;
  const rows = await db().delete(contributions)
    .where(and(eq(contributions.id, id), eq(contributions.authorId, authorId), eq(contributions.status, "draft")))
    .returning({ id: contributions.id });
  return rows.length > 0;
}
