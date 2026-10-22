/**
 * Plan and apply the MongoDB → PostgreSQL copy (issue #23, Phase 2).
 *
 * `buildPlan` takes a reader so it can run against Mongo (the script) or
 * fixture documents (the tests). `applyPlan` upserts by primary key in one
 * transaction, so a re-run converges instead of duplicating.
 */
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { PgDatabase } from "./client";
import * as s from "./schema";
import * as t from "./transform";

const BATCH = 500;

type Rows = Record<string, unknown>[];
export interface PlanEntry { table: PgTable; name: string; key: string[]; rows: Rows }
export interface CopyPlan { tables: PlanEntry[]; skipped: Map<string, number> }

/** Reads every document of a Mongo collection (by collection name). */
export type Reader = (collection: string) => Promise<t.Doc[]>;

export async function buildPlan(read: Reader): Promise<CopyPlan> {
  const tables: PlanEntry[] = [];
  const skipped = new Map<string, number>();

  const skip = (collection: string, reason: string) => {
    const k = `${collection}: ${reason}`;
    skipped.set(k, (skipped.get(k) ?? 0) + 1);
  };

  const stage = (table: PgTable, name: string, key: string[], rows: Rows) => {
    const entry = tables.find((p) => p.name === name);
    if (entry) entry.rows.push(...rows);
    else tables.push({ table, name, key, rows: [...rows] });
  };

  /** Map every document of `collection`, staging rows and counting skips. */
  const each = async <T>(collection: string, map: (d: t.Doc) => t.Mapped<T>, accept: (rows: T) => void) => {
    for (const doc of await read(collection)) {
      const out = map(doc);
      if ("skip" in out) skip(collection, out.skip);
      else accept(out.rows);
    }
  };

  /** Keep only rows whose `field` points at an id in `ids`; count the rest. */
  const referencing = <R extends Record<string, unknown>>(
    collection: string, rows: R[], field: keyof R, ids: Set<string>, what: string,
  ): R[] =>
    rows.filter((r) => {
      if (ids.has(String(r[field]))) return true;
      skip(collection, `${what} no longer exists`);
      return false;
    });

  const problems: Rows = [];
  await each("problems", t.toProblem, (r) => problems.push(r));
  stage(s.problems, "problems", ["id"], problems);
  const problemIds = new Set(problems.map((p) => String(p.id)));

  const fk = async <R extends Record<string, unknown>>(
    collection: string, map: (d: t.Doc) => t.Mapped<R>, table: PgTable, name: string, key: string[],
  ) => {
    const rows: R[] = [];
    await each(collection, map, (r) => rows.push(r));
    stage(table, name, key, referencing(collection, rows, "problemId", problemIds, "problem"));
  };
  await fk("submissions", t.toSubmission, s.submissions, "submissions", ["id"]);
  await fk("bookmarks", t.toBookmark, s.bookmarks, "bookmarks", ["userId", "problemId"]);
  await fk("notes", t.toNote, s.notes, "notes", ["userId", "problemId"]);
  await fk("problemreports", t.toProblemReport, s.problemReports, "problem_reports", ["id"]);

  await each("userprofiles", t.toProfile, (r) => {
    stage(s.profiles, "profiles", ["userId"], [r.profile]);
    stage(s.follows, "follows", ["followerId", "followedId"], r.follows);
  });
  await each("userroles", t.toUserRole, (r) => stage(s.userRoles, "user_roles", ["userId"], [r]));
  await each("usercoins", t.toWallet, (r) => {
    stage(s.userBalances, "user_balances", ["userId"], [r.balance]);
    stage(s.coinTransactions, "coin_transactions", ["id"], r.transactions);
  });
  await each("storepurchases", t.toStorePurchase, (r) =>
    stage(s.storePurchases, "store_purchases", ["userId", "itemId"], [r]));

  await each("contests", t.toContest, (r) => {
    stage(s.contests, "contests", ["id"], [r.contest]);
    stage(s.contestProblems, "contest_problems", ["contestId", "problemId"],
      referencing("contests", r.problems, "problemId", problemIds, "contest problem"));
    stage(s.contestParticipants, "contest_participants", ["contestId", "userId"], r.participants);
  });

  const blogs: Rows = [];
  await each("blogs", t.toBlog, (r) => blogs.push(r));
  stage(s.blogs, "blogs", ["id"], blogs);
  const blogIdBySlug = new Map(blogs.map((b) => [String(b.slug), String(b.id)]));
  await each("blogvotes", (d) => t.toBlogVote(d, blogIdBySlug), (r) =>
    stage(s.blogVotes, "blog_votes", ["blogId", "userId"], [r]));

  await each("comments", t.toComment, (r) => stage(s.comments, "comments", ["id"], [r]));
  await each("githubintegrations", t.toGithubIntegration, (r) =>
    stage(s.githubIntegrations, "github_integrations", ["userId"], [r]));
  await each("playgroundsnippets", t.toPlaygroundSnippet, (r) =>
    stage(s.playgroundSnippets, "playground_snippets", ["id"], [r]));

  return { tables, skipped };
}

/** Upsert by primary key: every non-key column takes the incoming value. */
function upsertSet(table: PgTable, key: string[]): Record<string, SQL> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([prop]) => !key.includes(prop))
      .map(([prop, col]) => [prop, sql.raw(`excluded."${col.name}"`)]),
  );
}

export async function applyPlan(db: PgDatabase, plan: CopyPlan): Promise<void> {
  await db.transaction(async (tx) => {
    for (const p of plan.tables) {
      const target = p.key.map((k) => getTableColumns(p.table)[k]);
      const set = upsertSet(p.table, p.key);
      for (let i = 0; i < p.rows.length; i += BATCH) {
        const insert = tx.insert(p.table).values(p.rows.slice(i, i + BATCH));
        await (Object.keys(set).length
          ? insert.onConflictDoUpdate({ target, set })
          : insert.onConflictDoNothing({ target }));
      }
    }
  });
}

/** Postgres row count per planned table. */
export async function countRows(db: PgDatabase, plan: CopyPlan): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const p of plan.tables) {
    const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${p.table}`);
    counts.set(p.name, r.rows[0].n);
  }
  return counts;
}
