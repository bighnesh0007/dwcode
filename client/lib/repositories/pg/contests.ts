import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { contestParticipants, contestProblems, contests, problems } from "@/db/postgres/schema";
import type { Participant } from "../mongo/contests";
import type { RecordId } from "../shared";
import { db, hex, isHexId, oid } from "./db";

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
  },
  preset?: { id: string; createdAt: Date },
) {
  // problemSlugs is derived from contest_problems, not stored.
  const { problems: problemIds, duration, inviteCode, title, description, createdBy, createdByName,
    startTime, endTime, status, isPublic, maxParticipants } = fields;
  const rest = { title, description, createdBy, createdByName, startTime, endTime, status, isPublic, maxParticipants };
  const id = await db().transaction(async (t) => {
    const [row] = await t.insert(contests).values({
      ...rest,
      durationMinutes: duration,
      inviteCode: inviteCode?.toUpperCase() ?? null,
      ...(preset && { id: preset.id, createdAt: preset.createdAt }),
    }).returning({ id: contests.id });
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

export async function removeParticipant(contestId: RecordId, userId: string) {
  await db().delete(contestParticipants)
    .where(and(eq(contestParticipants.contestId, hex(contestId)), eq(contestParticipants.userId, userId)));
}

export async function deleteById(id: string) {
  if (!isHexId(id)) return;
  await db().delete(contests).where(eq(contests.id, id));
}
