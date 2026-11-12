import { and, asc, count, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { contestParticipants, contestProblems, contests, problems } from "../../postgres/schema.ts";
import type { JoiningParticipant, JoinState, Participant } from "../mongo/contests.ts";
import type { RecordId } from "../shared.ts";
import { countOf, db, hex, isHexId, oid, returnedRow } from "./db.ts";

type ContestRow = typeof contests.$inferSelect;
type ProblemRow = typeof problems.$inferSelect;
type ParticipantRow = typeof contestParticipants.$inferSelect;

/** Children of the given contests, grouped by contest id, in contest order. */
async function children(ids: string[]) {
  const [problemRows, participantRows] = ids.length
    ? await Promise.all([
        db().select({ contestId: contestProblems.contestId, p: problems }).from(contestProblems)
          .innerJoin(problems, eq(problems.id, contestProblems.problemId))
          .where(inArray(contestProblems.contestId, ids)).orderBy(asc(contestProblems.position)),
        db().select().from(contestParticipants).where(inArray(contestParticipants.contestId, ids))
          .orderBy(asc(contestParticipants.joinedAt)),
      ])
    : [[], []];
  const problemsOf = new Map<string, ProblemRow[]>();
  for (const { contestId, p } of problemRows) problemsOf.set(contestId, [...(problemsOf.get(contestId) ?? []), p]);
  const participantsOf = new Map<string, ParticipantRow[]>();
  for (const p of participantRows) participantsOf.set(p.contestId, [...(participantsOf.get(p.contestId) ?? []), p]);
  return { problemsOf, participantsOf };
}

const participant = (p: ParticipantRow) => ({
  userId: p.userId,
  userName: p.userName,
  userImageUrl: p.userImageUrl,
  score: p.score,
  solvedProblems: p.solvedProblemSlugs,
  joinedAt: p.joinedAt,
  ...(p.finishedAt ? { finishedAt: p.finishedAt } : {}),
});

/** A contest in Mongo's shape; `problems` is ids, or summaries when `populate` names fields. */
function toDoc(c: ContestRow, ps: ProblemRow[], parts: ParticipantRow[], populate?: (keyof ProblemRow)[]) {
  return {
    _id: oid(c.id),
    title: c.title,
    description: c.description,
    createdBy: c.createdBy,
    createdByName: c.createdByName,
    problems: populate
      ? ps.map((p) => ({ _id: oid(p.id), ...Object.fromEntries(populate.map((f) => [f, p[f]])) }))
      : ps.map((p) => oid(p.id)),
    problemSlugs: ps.map((p) => p.slug),
    startTime: c.startTime,
    endTime: c.endTime,
    duration: c.durationMinutes,
    status: c.status,
    isPublic: c.isPublic,
    maxParticipants: c.maxParticipants,
    participants: parts.map(participant),
    ...(c.inviteCode ? { inviteCode: c.inviteCode } : {}),
    ...(c.seriesKey ? { seriesKey: c.seriesKey } : {}),
    createdAt: c.createdAt,
  };
}

async function load(where: SQL | undefined, populate?: (keyof ProblemRow)[], newestFirst = false) {
  const rows = await db().select().from(contests).where(where)
    .orderBy(newestFirst ? desc(contests.startTime) : asc(contests.createdAt));
  const { problemsOf, participantsOf } = await children(rows.map((r) => r.id));
  return rows.map((c) => toDoc(c, problemsOf.get(c.id) ?? [], participantsOf.get(c.id) ?? [], populate));
}

export async function listVisible(userId: string | null) {
  const visibility = userId
    ? or(
        eq(contests.isPublic, true),
        eq(contests.createdBy, userId),
        sql`exists (select 1 from ${contestParticipants} where ${contestParticipants.contestId} = ${contests.id} and ${contestParticipants.userId} = ${userId})`,
      )
    : eq(contests.isPublic, true);
  return load(visibility, ["title", "slug", "difficulty"], true);
}

export async function findWithProblems(id: string) {
  if (!isHexId(id)) return null;
  return (await load(eq(contests.id, id), ["title", "slug", "difficulty", "tags"]))[0] ?? null;
}

export async function findById(id: string) {
  if (!isHexId(id)) return null;
  return (await load(eq(contests.id, id)))[0] ?? null;
}

export async function findByInviteCode(inviteCode: string) {
  return (await load(eq(contests.inviteCode, inviteCode)))[0] ?? null;
}

/** The contest and its problem list commit together. */
export async function create(
  fields: {
    title: string;
    description: string;
    createdBy: string;
    createdByName: string;
    problems: RecordId[];
    problemSlugs: string[];
    startTime: Date;
    endTime: Date;
    duration: number;
    status: "upcoming" | "active" | "ended";
    isPublic: boolean;
    maxParticipants: number;
    inviteCode: string | undefined;
    seriesKey?: string;
  },
  preset?: { id: string; createdAt: Date },
) {
  // problemSlugs is derived from contest_problems, not stored.
  const { problems: problemIds, duration, inviteCode, title, description, createdBy, createdByName,
    startTime, endTime, status, isPublic, maxParticipants } = fields;
  const rest = { title, description, createdBy, createdByName, startTime, endTime, status, isPublic, maxParticipants };
  const id = await db().transaction(async (t) => {
    const row = returnedRow(await t.insert(contests).values({
      ...rest,
      durationMinutes: duration,
      inviteCode: inviteCode?.toUpperCase() ?? null,
      seriesKey: fields.seriesKey ?? null,
      ...(preset && { id: preset.id, createdAt: preset.createdAt }),
    }).returning({ id: contests.id }), "contests.create");
    const unique = [...new Set(problemIds.map(hex))];
    if (unique.length) {
      await t.insert(contestProblems).values(unique.map((problemId, position) => ({ contestId: row.id, problemId, position })));
    }
    return row.id;
  });
  const doc = await findById(id);
  if (!doc) throw new Error("Contest vanished after insert");
  return doc;
}

/** One row per (contest, user): joining twice is a no-op, as in Mongo. */
export async function addParticipant(contestId: RecordId, p: Participant) {
  await db().insert(contestParticipants)
    .values({ contestId: hex(contestId), userId: p.userId, userName: p.userName, userImageUrl: p.userImageUrl })
    .onConflictDoNothing();
}

/** Returns false when the contest does not exist. */
export async function removeParticipant(contestId: RecordId, userId: string): Promise<boolean> {
  const id = hex(contestId);
  if (!isHexId(id)) return false;
  await db().delete(contestParticipants)
    .where(and(eq(contestParticipants.contestId, id), eq(contestParticipants.userId, userId)));
  return (await db().select({ id: contests.id }).from(contests).where(eq(contests.id, id)).limit(1)).length === 1;
}

/** Migrations own Postgres's indexes; nothing to build at runtime. */
export function ensureIndexes(): Promise<void> {
  return Promise.resolve();
}

export async function existsBySeriesKey(seriesKey: string): Promise<boolean> {
  return (await db().select({ id: contests.id }).from(contests).where(eq(contests.seriesKey, seriesKey)).limit(1)).length === 1;
}

export async function joinState(contestId: string, userId: string): Promise<JoinState | null> {
  if (!isHexId(contestId)) return null;
  const [c] = await db().select({ id: contests.id, isPublic: contests.isPublic, endTime: contests.endTime,
    maxParticipants: contests.maxParticipants }).from(contests).where(eq(contests.id, contestId));
  if (!c) return null;
  const rows = await db().select({ userId: contestParticipants.userId }).from(contestParticipants)
    .where(eq(contestParticipants.contestId, contestId));
  return { ...c, participantCount: rows.length, isParticipant: rows.some((r) => r.userId === userId) };
}

/**
 * The same checks as Mongo's single conditional update, made atomic by locking
 * the contest row: concurrent joins queue on the lock, so the capacity count
 * each one sees includes every join committed before it.
 */
export async function joinIfOpen(
  contestId: string,
  p: JoiningParticipant,
  opts: { now: Date; requirePublic: boolean },
): Promise<"joined" | "not_applied"> {
  if (!isHexId(contestId)) return "not_applied";
  return db().transaction(async (t) => {
    const where = and(
      eq(contests.id, contestId),
      gte(contests.endTime, opts.now),
      ...(opts.requirePublic ? [eq(contests.isPublic, true)] : []),
    );
    const [c] = await t.select({ max: contests.maxParticipants }).from(contests).where(where).for("update");
    if (!c) return "not_applied";
    const taken = countOf(await t.select({ n: count() }).from(contestParticipants)
      .where(eq(contestParticipants.contestId, contestId)));
    if (taken >= c.max) return "not_applied";
    const inserted = await t.insert(contestParticipants).values({
      contestId, userId: p.userId, userName: p.userName, userImageUrl: p.userImageUrl,
      score: p.score, solvedProblemSlugs: p.solvedProblems, joinedAt: p.joinedAt,
    }).onConflictDoNothing().returning({ userId: contestParticipants.userId });
    return inserted.length === 1 ? "joined" : "not_applied";
  });
}

/** Delete only when `createdBy` still matches — no check-then-act gap. */
export async function deleteOwned(contestId: string, userId: string): Promise<boolean> {
  if (!isHexId(contestId)) return false;
  const removed = await db().delete(contests)
    .where(and(eq(contests.id, contestId), eq(contests.createdBy, userId))).returning({ id: contests.id });
  return removed.length === 1;
}

export async function deleteById(id: string) {
  if (!isHexId(id)) return;
  await db().delete(contests).where(eq(contests.id, id));
}
