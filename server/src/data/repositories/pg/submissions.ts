import { and, count, desc, eq, gte, ne, sql } from "drizzle-orm";
import { problems, submissions } from "../../postgres/schema.ts";
import type { ActivityStats, NewSubmission, SubmissionUserStats } from "../mongo/submissions.ts";
import { countOf, db, hex, isHexId, oid, returnedRow } from "./db.ts";
import type { RecordId } from "../shared.ts";

const columns = {
  id: submissions.id,
  problemId: submissions.problemId,
  problemSlug: problems.slug,
  userId: submissions.userId,
  userName: submissions.userName,
  userImageUrl: submissions.userImageUrl,
  code: submissions.code,
  input: submissions.input,
  output: submissions.output,
  status: submissions.status,
  executionTime: submissions.executionTime,
  createdAt: submissions.createdAt,
};

type Row = { id: string; problemId: string } & Record<string, unknown>;
const toDoc = ({ id, problemId, ...rest }: Row) => ({ _id: oid(id), problemId: oid(problemId), ...rest });

const joined = () => db().select(columns).from(submissions).innerJoin(problems, eq(problems.id, submissions.problemId));

export async function listByUser(userId: string) {
  const rows = await joined().where(eq(submissions.userId, userId)).orderBy(desc(submissions.createdAt));
  return rows.map(toDoc);
}

export async function listRecentByUser(userId: string, limit: number, problemSlug?: string) {
  const where = problemSlug
    ? and(eq(submissions.userId, userId), eq(problems.slug, problemSlug))
    : eq(submissions.userId, userId);
  const rows = await db()
    .select({
      id: submissions.id,
      problemId: submissions.problemId,
      problemSlug: problems.slug,
      status: submissions.status,
      executionTime: submissions.executionTime,
      createdAt: submissions.createdAt,
      code: submissions.code,
      output: submissions.output,
    })
    .from(submissions).innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(where).orderBy(desc(submissions.createdAt)).limit(limit);
  return rows.map(toDoc);
}

/** Days are UTC, matching Mongo's $dateToString default. */
export async function activityStats(userId: string, since: Date): Promise<ActivityStats> {
  const [totals] = await db().select({
    total: sql<number>`count(*)::int`,
    accepted: sql<number>`(count(*) filter (where ${submissions.status} = 'Accepted'))::int`,
  }).from(submissions).where(eq(submissions.userId, userId));
  const day = sql<string>`to_char(${submissions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const days = await db().select({ day, n: sql<number>`count(*)::int` }).from(submissions)
    .where(and(eq(submissions.userId, userId), gte(submissions.createdAt, since)))
    .groupBy(day);
  return {
    total: totals?.total ?? 0,
    accepted: totals?.accepted ?? 0,
    daily: Object.fromEntries(days.map((d) => [d.day, d.n])),
  };
}

export async function listAll() {
  return (await joined()).map(toDoc);
}

/** `preset` carries Mongo's id and time when mirroring. */
export async function create(submission: NewSubmission, preset?: { id: string; createdAt: Date }) {
  // problemSlug is joined from problems, not stored.
  const { problemId, userId, userName, userImageUrl, code, input, output, status, executionTime } = submission;
  const row = returnedRow(await db().insert(submissions).values({
    problemId: hex(problemId), userId, userName, userImageUrl, code, input, output, status, executionTime,
    ...(preset && { id: preset.id, createdAt: preset.createdAt }),
  }).returning({ id: submissions.id }), "submissions.create");
  return toDoc(returnedRow(await joined().where(eq(submissions.id, row.id)), "submissions.create (read back)"));
}

export async function hasOtherAccepted(userId: string, problemId: RecordId, exceptId: RecordId): Promise<boolean> {
  return countOf(await db().select({ n: count() }).from(submissions).where(and(
    eq(submissions.userId, userId),
    eq(submissions.problemId, hex(problemId)),
    eq(submissions.status, "Accepted"),
    ne(submissions.id, hex(exceptId)),
  ))) > 0;
}

export async function hasAcceptedForSlug(userId: string, problemSlug: string): Promise<boolean> {
  const rows = await joined()
    .where(and(eq(submissions.userId, userId), eq(problems.slug, problemSlug), eq(submissions.status, "Accepted")))
    .limit(1);
  return rows.length > 0;
}

export async function slugsByOutcome(userId: string) {
  const rows = await db().selectDistinct({ slug: problems.slug, accepted: sql<boolean>`${submissions.status} = 'Accepted'` })
    .from(submissions).innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(eq(submissions.userId, userId));
  return {
    accepted: [...new Set(rows.filter((r) => r.accepted).map((r) => r.slug))],
    notAccepted: [...new Set(rows.filter((r) => !r.accepted).map((r) => r.slug))],
  };
}

/** Per-user totals, aggregated in SQL rather than in memory. */
export async function statsByUser(): Promise<SubmissionUserStats[]> {
  const rows = await db().execute<{
    _id: string; userName: string; userImageUrl: string; totalSubmissions: number; accepted: number;
    firstSeenAt: string; lastActiveAt: string; solvedSlugs: string[] | null;
  }>(sql`
    select s.user_id as "_id",
      (array_agg(s.user_name order by s.created_at desc))[1] as "userName",
      (array_agg(s.user_image_url order by s.created_at desc))[1] as "userImageUrl",
      count(*)::int as "totalSubmissions",
      count(*) filter (where s.status = 'Accepted')::int as "accepted",
      min(s.created_at) as "firstSeenAt",
      max(s.created_at) as "lastActiveAt",
      array_agg(distinct p.slug) filter (where s.status = 'Accepted') as "solvedSlugs"
    from ${submissions} s join ${problems} p on p.id = s.problem_id
    group by s.user_id`);
  return rows.rows.map((r) => ({
    ...r,
    firstSeenAt: new Date(r.firstSeenAt),
    lastActiveAt: new Date(r.lastActiveAt),
    solvedSlugs: r.solvedSlugs ?? [],
  }));
}

export { isHexId };
