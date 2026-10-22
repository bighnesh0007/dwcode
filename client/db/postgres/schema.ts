/**
 * PostgreSQL schema — issue #23, Phase 2.
 *
 * Not yet read or written by the app: MongoDB stays the source of truth until
 * the Phase 3 cutover. This schema exists so that the copy script
 * (scripts/pg/copy-from-mongo.ts) can be run and verified against real data.
 *
 * Identifiers: every migrated row keeps its MongoDB `_id` as a 24-char hex
 * string, so URLs and foreign references survive the move. New rows get an id
 * of the same shape from `newId()`.
 *
 * Document-shaped values (test cases, examples, playground files) stay `jsonb`.
 * Everything relational — follows, contest membership, the coin ledger — is a
 * real table with constraints.
 */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { DIFFICULTY_ENUM, SUBMISSION_STATUS_ENUM } from "@dwcode/shared";
import { REPORT_REASONS, REPORT_STATUSES } from "@/lib/reports";

/** A 24-char hex id, the same shape as a MongoDB ObjectId. */
export function newId(): string {
  return randomBytes(12).toString("hex");
}

const id = () => text("id").primaryKey().$defaultFn(newId);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ── Enums ───────────────────────────────────────────────────────────────────

export const difficulty = pgEnum("difficulty", DIFFICULTY_ENUM as [string, ...string[]]);
export const submissionStatus = pgEnum(
  "submission_status",
  SUBMISSION_STATUS_ENUM as [string, ...string[]],
);
export const reportReason = pgEnum("report_reason", [...REPORT_REASONS] as [string, ...string[]]);
export const reportStatus = pgEnum("report_status", [...REPORT_STATUSES] as [string, ...string[]]);
export const commentTarget = pgEnum("comment_target", ["problem", "blog"]);
export const contestStatus = pgEnum("contest_status", ["upcoming", "active", "ended"]);
export const userRole = pgEnum("user_role", ["admin", "user"]);

// ── Document-shaped jsonb values ────────────────────────────────────────────

export interface TestCase { input: string; expectedOutput: string }
export interface Example { input: string; output: string; explanation?: string }
export interface PlaygroundFile { name: string; kind: string; language: string; content: string }
export interface PlaygroundTestCase { name: string; files: PlaygroundFile[]; expectedOutput: string }

// ── Problems ────────────────────────────────────────────────────────────────

export const problems = pgTable(
  "problems",
  {
    id: id(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    difficulty: difficulty("difficulty").notNull(),
    category: text("category").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    description: text("description").notNull(),
    examples: jsonb("examples").$type<Example[]>().notNull().default([]),
    constraints: text("constraints").array().notNull().default(sql`'{}'`),
    starterCode: text("starter_code").notNull().default("%dw 2.0\noutput application/json\n---\n"),
    testCases: jsonb("test_cases").$type<TestCase[]>().notNull().default([]),
    hiddenTestCases: jsonb("hidden_test_cases").$type<TestCase[]>().notNull().default([]),
    solution: text("solution"),
    hints: text("hints").array().notNull().default(sql`'{}'`),
    createdByAi: boolean("created_by_ai").notNull().default(false),
    createdBy: text("created_by").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("problems_difficulty_category_idx").on(t.difficulty, t.category),
    index("problems_created_at_idx").on(t.createdAt.desc()),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().default(""),
    userName: text("user_name").notNull().default("Anonymous"),
    userImageUrl: text("user_image_url").notNull().default(""),
    code: text("code").notNull(),
    input: text("input").notNull().default("{}"),
    output: text("output").notNull().default(""),
    status: submissionStatus("status").notNull().default("Attempted"),
    executionTime: text("execution_time").notNull().default("0ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("submissions_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("submissions_user_problem_status_idx").on(t.userId, t.problemId, t.status),
  ],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: text("user_id").notNull(),
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.problemId] })],
);

export const notes = pgTable(
  "notes",
  {
    userId: text("user_id").notNull(),
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.problemId] }),
    check("notes_content_length", sql`char_length(${t.content}) <= 20000`),
  ],
);

export const problemReports = pgTable(
  "problem_reports",
  {
    id: id(),
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull().default("Anonymous"),
    reason: reportReason("reason").notNull(),
    details: text("details").notNull().default(""),
    status: reportStatus("status").notNull().default("open"),
    resolvedBy: text("resolved_by").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    // One open report per user per problem; resolved ones may repeat.
    uniqueIndex("problem_reports_one_open_idx")
      .on(t.problemId, t.userId)
      .where(sql`${t.status} = 'open'`),
    index("problem_reports_status_created_idx").on(t.status, t.createdAt.desc()),
  ],
);

// ── People ──────────────────────────────────────────────────────────────────

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  username: text("username").notNull().unique(),
  bio: text("bio").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Replaces the mirrored followers/following arrays: one row per edge. */
export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id").notNull(),
    followedId: text("followed_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followedId] }),
    index("follows_followed_idx").on(t.followedId),
    check("follows_not_self", sql`${t.followerId} <> ${t.followedId}`),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id").primaryKey(),
    userName: text("user_name").notNull().default(""),
    role: userRole("role").notNull().default("admin"),
    grantedBy: text("granted_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("user_roles_role_idx").on(t.role)],
);

// ── Coins ───────────────────────────────────────────────────────────────────

export const userBalances = pgTable(
  "user_balances",
  {
    userId: text("user_id").primaryKey(),
    balance: integer("balance").notNull().default(0),
  },
  // No non-negative check: credit() accepts negative amounts by design.
);

/** The full ledger — no longer capped at 200 entries per user. */
export const coinTransactions = pgTable(
  "coin_transactions",
  {
    id: id(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("coin_transactions_user_created_idx").on(t.userId, t.createdAt.desc())],
);

export const storePurchases = pgTable(
  "store_purchases",
  {
    userId: text("user_id").notNull(),
    itemId: text("item_id").notNull(),
    cost: integer("cost").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    check("store_purchases_cost_non_negative", sql`${t.cost} >= 0`),
  ],
);

// ── Contests ────────────────────────────────────────────────────────────────

export const contests = pgTable(
  "contests",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdByName: text("created_by_name").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: contestStatus("status").notNull().default("upcoming"),
    isPublic: boolean("is_public").notNull().default(true),
    maxParticipants: integer("max_participants").notNull().default(100),
    inviteCode: text("invite_code").unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index("contests_public_start_idx").on(t.isPublic, t.startTime.desc()),
    index("contests_created_by_idx").on(t.createdBy),
    check("contests_time_order", sql`${t.endTime} > ${t.startTime}`),
  ],
);

export const contestProblems = pgTable(
  "contest_problems",
  {
    contestId: text("contest_id").notNull().references(() => contests.id, { onDelete: "cascade" }),
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.contestId, t.problemId] })],
);

export const contestParticipants = pgTable(
  "contest_participants",
  {
    contestId: text("contest_id").notNull().references(() => contests.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    userImageUrl: text("user_image_url").notNull().default(""),
    score: integer("score").notNull().default(0),
    solvedProblemSlugs: text("solved_problem_slugs").array().notNull().default(sql`'{}'`),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.contestId, t.userId] }),
    index("contest_participants_user_idx").on(t.userId),
  ],
);

// ── Blog and comments ───────────────────────────────────────────────────────

export const blogs = pgTable(
  "blogs",
  {
    id: id(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    content: text("content").notNull(),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull().default("Anonymous"),
    authorImageUrl: text("author_image_url").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    published: boolean("published").notNull().default(true),
    upvotes: integer("upvotes").notNull().default(0),
    downvotes: integer("downvotes").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("blogs_published_created_idx").on(t.published, t.createdAt.desc()),
    index("blogs_author_idx").on(t.authorId),
  ],
);

export const blogVotes = pgTable(
  "blog_votes",
  {
    blogId: text("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    value: smallint("value").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blogId, t.userId] }),
    check("blog_votes_value", sql`${t.value} in (1, -1)`),
  ],
);

/**
 * Polymorphic target (problem slug or blog slug), so no foreign key; the
 * Phase 3 repository validates the target exists before insert.
 */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    targetType: commentTarget("target_type").notNull(),
    targetId: text("target_id").notNull(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    userImageUrl: text("user_image_url").notNull().default(""),
    content: text("content").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("comments_target_created_idx").on(t.targetType, t.targetId, t.createdAt.desc()),
    index("comments_user_idx").on(t.userId),
  ],
);

// ── Integrations and playground ─────────────────────────────────────────────

export const githubIntegrations = pgTable("github_integrations", {
  userId: text("user_id").primaryKey(),
  githubId: text("github_id").notNull(),
  githubUsername: text("github_username").notNull(),
  accessToken: text("access_token").notNull(),
  repoName: text("repo_name").notNull().default("dwcode-workspace"),
  repoPrivate: boolean("repo_private").notNull().default(false),
  defaultBranch: text("default_branch").notNull().default("main"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const playgroundSnippets = pgTable("playground_snippets", {
  id: id(),
  slug: text("slug").notNull().unique(),
  script: text("script").notNull(),
  files: jsonb("files").$type<PlaygroundFile[]>().notNull().default([]),
  testCases: jsonb("test_cases").$type<PlaygroundTestCase[]>().notNull().default([]),
  userId: text("user_id").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
