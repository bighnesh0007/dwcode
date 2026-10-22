/**
 * MongoDB document → PostgreSQL row mapping for the #23 copy script.
 *
 * Pure functions over plain (lean) documents, so they can be unit-tested
 * without either database. Each `to*` returns the rows for one Mongo document,
 * or a `skip` with the reason when the document cannot be represented — the
 * copy script counts and prints those rather than failing the whole run.
 */
import type * as s from "./schema";

type Row<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export type Mapped<T> = { rows: T } | { skip: string };

/** A raw Mongo document: `_id`/ObjectIds arrive as ObjectId objects. */
export type Doc = Record<string, unknown>;

/** A scalar or ObjectId as text. ObjectIds stringify to their hex form. */
function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  const hex = (v as { toHexString?: () => string } | null)?.toHexString;
  return typeof hex === "function" ? hex.call(v) : JSON.stringify(v);
}

const str = (v: unknown, fallback = ""): string =>
  v === undefined || v === null ? fallback : text(v);

const strOrNull = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : text(v);

const date = (v: unknown, fallback = new Date(0)): Date =>
  v instanceof Date ? v : v ? new Date(text(v)) : fallback;

const dateOrNull = (v: unknown): Date | null => (v ? date(v) : null);

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(text) : []);

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/** `v` if it is one of `allowed`, else `fallback`. */
function oneOf<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** Strip Mongo subdocument `_id`s from jsonb values. */
function plain(v: unknown): unknown[] {
  return JSON.parse(JSON.stringify(v ?? [], (k, x: unknown) => (k === "_id" ? undefined : x))) as unknown[];
}

export function toProblem(d: Doc): Mapped<Row<typeof s.problems>> {
  return {
    rows: {
      id: str(d._id),
      title: str(d.title),
      slug: str(d.slug),
      difficulty: str(d.difficulty),
      category: str(d.category),
      tags: strings(d.tags),
      description: str(d.description),
      examples: plain(d.examples) as s.Example[],
      constraints: strings(d.constraints),
      starterCode: str(d.starterCode, "%dw 2.0\noutput application/json\n---\n"),
      testCases: plain(d.testCases) as s.TestCase[],
      hiddenTestCases: plain(d.hiddenTestCases) as s.TestCase[],
      solution: strOrNull(d.solution),
      hints: strings(d.hints),
      createdByAi: Boolean(d.createdByAI),
      createdBy: str(d.createdBy),
      createdAt: date(d.createdAt),
    },
  };
}

export function toSubmission(d: Doc): Mapped<Row<typeof s.submissions>> {
  if (!d.problemId) return { skip: "no problemId" };
  return {
    rows: {
      id: str(d._id),
      problemId: str(d.problemId),
      userId: str(d.userId),
      userName: str(d.userName, "Anonymous"),
      userImageUrl: str(d.userImageUrl),
      code: str(d.code),
      input: str(d.input, "{}"),
      output: str(d.output),
      status: str(d.status, "Attempted"),
      executionTime: str(d.executionTime, "0ms"),
      createdAt: date(d.createdAt),
    },
  };
}

export function toBookmark(d: Doc): Mapped<Row<typeof s.bookmarks>> {
  // Pre-auth bookmarks were stored with userId "" and belong to nobody.
  if (!d.userId) return { skip: "anonymous bookmark (empty userId)" };
  if (!d.problemId) return { skip: "no problemId" };
  return { rows: { userId: str(d.userId), problemId: str(d.problemId), createdAt: date(d.createdAt) } };
}

export function toNote(d: Doc): Mapped<Row<typeof s.notes>> {
  if (!d.userId) return { skip: "anonymous note (empty userId)" };
  if (!d.problemId) return { skip: "no problemId" };
  return {
    rows: {
      userId: str(d.userId),
      problemId: str(d.problemId),
      content: str(d.content),
      updatedAt: date(d.updatedAt),
    },
  };
}

export function toProblemReport(d: Doc): Mapped<Row<typeof s.problemReports>> {
  if (!d.problemId) return { skip: "no problemId" };
  return {
    rows: {
      id: str(d._id),
      problemId: str(d.problemId),
      userId: str(d.userId),
      userName: str(d.userName, "Anonymous"),
      reason: str(d.reason),
      details: str(d.details),
      status: str(d.status, "open"),
      resolvedBy: str(d.resolvedBy),
      resolvedAt: dateOrNull(d.resolvedAt),
      resolutionNote: str(d.resolutionNote),
      createdAt: date(d.createdAt),
    },
  };
}

/** A profile yields its row plus one `follows` edge per entry in `following`. */
export function toProfile(d: Doc): Mapped<{
  profile: Row<typeof s.profiles>;
  follows: Row<typeof s.follows>[];
}> {
  const userId = str(d.userId);
  if (!userId) return { skip: "no userId" };
  const following = [...new Set(strings(d.following))].filter((id) => id && id !== userId);
  return {
    rows: {
      profile: {
        userId,
        username: str(d.username),
        bio: str(d.bio),
        createdAt: date(d.createdAt),
        updatedAt: date(d.updatedAt),
      },
      follows: following.map((followedId) => ({ followerId: userId, followedId })),
    },
  };
}

export function toUserRole(d: Doc): Mapped<Row<typeof s.userRoles>> {
  if (!d.userId) return { skip: "no userId" };
  return {
    rows: {
      userId: str(d.userId),
      userName: str(d.userName),
      role: oneOf(["admin", "user"] as const, d.role, "admin"),
      grantedBy: str(d.grantedBy),
      createdAt: date(d.createdAt),
    },
  };
}

/**
 * A wallet yields its balance plus its ledger. The balance is copied as
 * stored, not recomputed: Mongo capped the ledger at 200 entries, so older
 * history is already gone and the sum would undercount.
 */
export function toWallet(d: Doc): Mapped<{
  balance: Row<typeof s.userBalances>;
  transactions: Row<typeof s.coinTransactions>[];
}> {
  const userId = str(d.userId);
  if (!userId) return { skip: "no userId" };
  const txs = Array.isArray(d.transactions) ? (d.transactions as Doc[]) : [];
  return {
    rows: {
      balance: { userId, balance: num(d.balance) },
      transactions: txs.map((tx) => ({
        id: str(tx._id) || undefined,
        userId,
        type: str(tx.type),
        amount: num(tx.amount),
        description: str(tx.description),
        createdAt: date(tx.createdAt),
      })),
    },
  };
}

export function toStorePurchase(d: Doc): Mapped<Row<typeof s.storePurchases>> {
  if (!d.userId || !d.itemId) return { skip: "no userId or itemId" };
  return {
    rows: { userId: str(d.userId), itemId: str(d.itemId), cost: num(d.cost), createdAt: date(d.createdAt) },
  };
}

/** A contest yields its row, its ordered problem list and its participants. */
export function toContest(d: Doc): Mapped<{
  contest: Row<typeof s.contests>;
  problems: Row<typeof s.contestProblems>[];
  participants: Row<typeof s.contestParticipants>[];
}> {
  const id = str(d._id);
  const start = date(d.startTime);
  const end = date(d.endTime);
  if (end <= start) return { skip: "endTime is not after startTime" };
  const problemIds = [...new Set(strings(d.problems))];
  const seen = new Set<string>();
  const participants = (Array.isArray(d.participants) ? (d.participants as Doc[]) : [])
    .filter((p) => {
      const uid = str(p.userId);
      if (!uid || seen.has(uid)) return false;
      seen.add(uid);
      return true;
    })
    .map((p) => ({
      contestId: id,
      userId: str(p.userId),
      userName: str(p.userName),
      userImageUrl: str(p.userImageUrl),
      score: num(p.score),
      solvedProblemSlugs: strings(p.solvedProblems),
      joinedAt: date(p.joinedAt),
      finishedAt: dateOrNull(p.finishedAt),
    }));
  return {
    rows: {
      contest: {
        id,
        title: str(d.title),
        description: str(d.description),
        createdBy: str(d.createdBy),
        createdByName: str(d.createdByName),
        startTime: start,
        endTime: end,
        durationMinutes: num(d.duration),
        status: oneOf(["upcoming", "active", "ended"] as const, d.status, "upcoming"),
        isPublic: d.isPublic !== false,
        maxParticipants: num(d.maxParticipants, 100),
        inviteCode: strOrNull(d.inviteCode)?.toUpperCase() ?? null,
        createdAt: date(d.createdAt),
      },
      problems: problemIds.map((problemId, position) => ({ contestId: id, problemId, position })),
      participants,
    },
  };
}

export function toBlog(d: Doc): Mapped<Row<typeof s.blogs>> {
  return {
    rows: {
      id: str(d._id),
      title: str(d.title),
      slug: str(d.slug),
      content: str(d.content),
      authorId: str(d.authorId),
      authorName: str(d.authorName, "Anonymous"),
      authorImageUrl: str(d.authorImageUrl),
      tags: strings(d.tags),
      published: d.published !== false,
      upvotes: num(d.upvotes),
      downvotes: num(d.downvotes),
      createdAt: date(d.createdAt),
      updatedAt: date(d.updatedAt),
    },
  };
}

/** Votes reference a blog by slug in Mongo; Postgres keys them by blog id. */
export function toBlogVote(d: Doc, blogIdBySlug: Map<string, string>): Mapped<Row<typeof s.blogVotes>> {
  const blogId = blogIdBySlug.get(str(d.blogSlug));
  if (!blogId) return { skip: "vote for a blog that does not exist" };
  const value = num(d.value);
  if (value !== 1 && value !== -1) return { skip: "vote value is not 1 or -1" };
  return {
    rows: { blogId, userId: str(d.userId), value, createdAt: date(d.createdAt), updatedAt: date(d.updatedAt) },
  };
}

/** Comments from before migration 002 have only `problemSlug`. */
export function toComment(d: Doc): Mapped<Row<typeof s.comments>> {
  const targetType = oneOf(["problem", "blog"] as const, d.targetType, "problem");
  const targetId = str(d.targetId) || (targetType === "problem" ? str(d.problemSlug) : "");
  if (!targetId) return { skip: "no targetId" };
  return {
    rows: {
      id: str(d._id),
      targetType,
      targetId,
      userId: str(d.userId),
      userName: str(d.userName),
      userImageUrl: str(d.userImageUrl),
      content: str(d.content),
      createdAt: date(d.createdAt),
      updatedAt: date(d.updatedAt),
    },
  };
}

export function toGithubIntegration(d: Doc): Mapped<Row<typeof s.githubIntegrations>> {
  if (!d.userId) return { skip: "no userId" };
  return {
    rows: {
      userId: str(d.userId),
      githubId: str(d.githubId),
      githubUsername: str(d.githubUsername),
      accessToken: str(d.accessToken),
      repoName: str(d.repoName, "dwcode-workspace"),
      repoPrivate: Boolean(d.repoPrivate),
      defaultBranch: str(d.defaultBranch, "main"),
      createdAt: date(d.createdAt),
      updatedAt: date(d.updatedAt),
    },
  };
}

export function toPlaygroundSnippet(d: Doc): Mapped<Row<typeof s.playgroundSnippets>> {
  return {
    rows: {
      id: str(d._id),
      slug: str(d.slug),
      script: str(d.script),
      files: plain(d.files) as s.PlaygroundFile[],
      testCases: plain(d.testCases) as s.PlaygroundTestCase[],
      userId: str(d.userId),
      createdAt: date(d.createdAt),
      updatedAt: date(d.updatedAt),
    },
  };
}
