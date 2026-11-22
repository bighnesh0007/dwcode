import { and, asc, count, desc, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";
import { auditLog as auditTable, clientErrors, moderation, pageViews, profiles, submissions } from "../../postgres/schema.ts";
import type { ClientErrorEvent, ModerationInput, NewAuditEntry } from "../mongo/ops.ts";
import { db, oid } from "./db.ts";

export async function audit(e: NewAuditEntry, preset?: { id: string; createdAt: Date }) {
  const [row] = await db().insert(auditTable).values({ ...e, ...(preset && { id: preset.id, createdAt: preset.createdAt }) }).returning();
  if (!row) throw new Error("Audit entry vanished after insert");
  const { id, ...rest } = row;
  return { _id: oid(id), ...rest };
}

export async function auditLog(limit: number, before?: Date) {
  const rows = await db().select().from(auditTable).where(before ? lt(auditTable.createdAt, before) : undefined)
    .orderBy(desc(auditTable.createdAt)).limit(limit);
  return rows.map(({ id, ...rest }) => ({ _id: oid(id), ...rest }));
}

export async function moderate(kind: string, ref: string, m: ModerationInput) {
  const set = { ...m, createdAt: new Date() };
  const [row] = await db().insert(moderation).values({ kind, ref, ...set })
    .onConflictDoUpdate({ target: [moderation.kind, moderation.ref], set }).returning();
  return row ?? null;
}

export async function unmoderate(kind: string, ref: string): Promise<boolean> {
  const rows = await db().delete(moderation).where(and(eq(moderation.kind, kind), eq(moderation.ref, ref))).returning({ ref: moderation.ref });
  return rows.length > 0;
}

export async function moderated(kind: string, now: Date) {
  return db().select().from(moderation)
    .where(and(eq(moderation.kind, kind), or(isNull(moderation.until), gt(moderation.until, now))))
    .orderBy(desc(moderation.createdAt));
}

export async function recordError(e: ClientErrorEvent, at: Date): Promise<void> {
  await db().insert(clientErrors).values({ ...e, count: 1, firstSeen: at, lastSeen: at, resolved: false })
    .onConflictDoUpdate({
      target: clientErrors.fingerprint,
      set: { count: sql`${clientErrors.count} + 1`, lastSeen: at, resolved: false, sample: e.sample },
    });
}

export async function listErrors(resolved: boolean, limit: number) {
  return db().select().from(clientErrors).where(eq(clientErrors.resolved, resolved)).orderBy(desc(clientErrors.lastSeen)).limit(limit);
}

export async function resolveError(fingerprint: string): Promise<boolean> {
  const rows = await db().update(clientErrors).set({ resolved: true }).where(eq(clientErrors.fingerprint, fingerprint)).returning({ f: clientErrors.fingerprint });
  return rows.length > 0;
}

export async function countOpenErrors(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(clientErrors).where(eq(clientErrors.resolved, false));
  return row?.n ?? 0;
}

export async function recordPageView(day: string, path: string): Promise<void> {
  await db().insert(pageViews).values({ day, path, count: 1 })
    .onConflictDoUpdate({ target: [pageViews.day, pageViews.path], set: { count: sql`${pageViews.count} + 1` } });
}

export async function pageViewsSince(day: string) {
  return db().select({ day: pageViews.day, path: pageViews.path, count: pageViews.count }).from(pageViews)
    .where(gte(pageViews.day, day)).orderBy(asc(pageViews.day), asc(pageViews.path));
}

export async function userCounts(since: Date): Promise<{ total: number; recent: number }> {
  const [row] = await db().select({
    total: sql<number>`count(*)::int`,
    recent: sql<number>`(count(*) filter (where ${profiles.createdAt} >= ${since}))::int`,
  }).from(profiles);
  return { total: row?.total ?? 0, recent: row?.recent ?? 0 };
}

export async function submissionsByDay(since: Date) {
  const day = sql<string>`to_char(${submissions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  return db().select({
    day,
    total: sql<number>`count(*)::int`,
    accepted: sql<number>`(count(*) filter (where ${submissions.status} = 'Accepted'))::int`,
  }).from(submissions).where(gte(submissions.createdAt, since)).groupBy(day).orderBy(asc(day));
}
