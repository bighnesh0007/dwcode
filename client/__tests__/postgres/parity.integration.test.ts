/**
 * Mongo ↔ Postgres parity, end to end — issue #23, Phase 3.
 *
 * Seeds MongoDB through the real Mongoose models, copies it into PostgreSQL
 * with the real copy script, then calls every repository function in shadow
 * mode. Any shadow event — a mismatch, a Postgres read error or a failed
 * mirrored write — fails the test with the operation and field path.
 *
 * Needs both MONGO_TEST_URL and PG_TEST_URL (CI provides service containers).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import type { PgDatabase } from "@/db/postgres/client";
import { applyPlan, buildPlan } from "@/db/postgres/copy";
import { onShadowEvent, setDataBackendForTests, type ShadowEvent } from "@/lib/repositories/backend";
import { resetPgForTests } from "@/lib/repositories/pg/db";
import * as blog from "@/lib/repositories/blog";
import * as bookmarks from "@/lib/repositories/bookmarks";
import * as coins from "@/lib/repositories/coins";
import * as comments from "@/lib/repositories/comments";
import * as contests from "@/lib/repositories/contests";
import * as github from "@/lib/repositories/githubIntegrations";
import * as notes from "@/lib/repositories/notes";
import * as problems from "@/lib/repositories/problems";
import * as profiles from "@/lib/repositories/profiles";
import * as reports from "@/lib/repositories/reports";
import * as roles from "@/lib/repositories/roles";
import * as snippets from "@/lib/repositories/snippets";
import * as store from "@/lib/repositories/store";
import * as submissions from "@/lib/repositories/submissions";
import { Blog } from "@/models/Blog";
import { BlogVote } from "@/models/BlogVote";
import { Bookmark } from "@/models/Bookmark";
import { Comment } from "@/models/Comment";
import { Contest } from "@/models/Contest";
import { GitHubIntegration } from "@/models/GitHubIntegration";
import { Note } from "@/models/Note";
import { PlaygroundSnippet } from "@/models/PlaygroundSnippet";
import { Problem } from "@/models/Problem";
import { ProblemReport } from "@/models/ProblemReport";
import { StorePurchase } from "@/models/StorePurchase";
import { Submission } from "@/models/Submission";
import { UserCoins } from "@/models/UserCoins";
import { UserProfile } from "@/models/UserProfile";
import { UserRole } from "@/models/UserRole";
import { CONTEST, P1, P2, cleanFixtures, fixtures } from "./fixtures";
import { PG_TEST_URL, freshDatabase } from "./helpers";

/** Content as the share route passes it (its arrays are typed as Mongoose's). */
const EMPTY_SNIPPET = { script: "%dw 2.0", files: [], testCases: [] } as unknown as Parameters<
  typeof snippets.createWithUniqueSlug
>[1];

const MONGO_TEST_URL = process.env.MONGO_TEST_URL;

/** Copy-script collection name → model, so seeding goes through the schemas. */
const MODELS: Record<string, mongoose.Model<Record<string, unknown>>> = {
  problems: Problem, submissions: Submission, bookmarks: Bookmark, notes: Note,
  problemreports: ProblemReport, userprofiles: UserProfile, userroles: UserRole,
  usercoins: UserCoins, storepurchases: StorePurchase, contests: Contest, blogs: Blog,
  blogvotes: BlogVote, comments: Comment, githubintegrations: GitHubIntegration,
  playgroundsnippets: PlaygroundSnippet,
} as unknown as Record<string, mongoose.Model<Record<string, unknown>>>;

const events: ShadowEvent[] = [];
const shadowEvents = () => events.map((e) => `${e.op} ${e.kind} ${e.path ?? e.error ?? ""}`);

async function seed(docs: Record<string, Record<string, unknown>[]>, pgName: string) {
  await mongoose.connection.dropDatabase();
  for (const [name, model] of Object.entries(MODELS)) {
    expect(model.collection.name).toBe(name);
    await model.syncIndexes();
    for (const doc of docs[name] ?? []) {
      // Documents from before a schema change (a pre-002 comment) fail today's
      // validation but exist in production, so they are inserted as stored.
      const candidate = new model(doc);
      const valid = await candidate.validate().then(() => true, () => false);
      if (valid) await model.create(doc);
      else await model.collection.insertOne(candidate.toObject() as mongoose.mongo.OptionalId<mongoose.mongo.Document>);
    }
  }
  const { url, db } = await freshDatabase(pgName);
  const mongo = mongoose.connection.db;
  if (!mongo) throw new Error("no Mongo database");
  await applyPlan(db, await buildPlan((c) => mongo.collection(c).find().toArray()));
  return { url, db };
}

describe.skipIf(!MONGO_TEST_URL || !PG_TEST_URL)("Mongo ↔ Postgres parity in shadow mode (#23 phase 3)", () => {
  let pg: PgDatabase;
  let off: () => void;

  beforeAll(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.MONGODB_URI = MONGO_TEST_URL;
    await mongoose.connect(MONGO_TEST_URL ?? "");
    const seeded = await seed(cleanFixtures(), "dwcode_test_parity");
    pg = seeded.db;
    process.env.DATABASE_URL = seeded.url;
    await resetPgForTests();
    off = onShadowEvent((e) => events.push(e));
    setDataBackendForTests("shadow");
  }, 60_000);

  afterEach(() => {
    // Every test ends with no unexplained difference between the stores.
    expect(shadowEvents()).toEqual([]);
    events.length = 0;
  });

  afterAll(async () => {
    setDataBackendForTests(null);
    off?.();
    await resetPgForTests();
    await pg?.close();
    await mongoose.disconnect();
  });

  it("agrees on every read of the copied data", async () => {
    await problems.listPublic({});
    await problems.listPublic({ difficulty: "Hard" });
    await problems.findPublicByIdOrSlug(P1);
    await problems.findPublicByIdOrSlug("two");
    await problems.findForWorkspace("odd-or-even");
    await problems.findForGrading(P1);
    await problems.findSlugById(P2);
    await problems.findIdBySlug("two");
    await problems.slugsForIds([P1, P2]);
    await problems.findByIds([P1, P2], 10);
    await problems.summariesForSlugs(["odd-or-even", "two"]);
    await problems.difficultyBySlug();
    await problems.recentByCreator("", 10);
    await problems.listForSitemap();
    await problems.count();
    await problems.count({ difficulty: "Easy" });

    await submissions.listByUser("u1");
    await submissions.listAll();
    await submissions.hasAcceptedForSlug("u1", "odd-or-even");
    await submissions.slugsByOutcome("u1");
    await submissions.statsByUser();

    await bookmarks.listByUser("u1");
    await bookmarks.countByUser("u1");
    await notes.findOwn("u1", P2);
    await notes.findOwn("u2", P2);
    await reports.listByStatus("open", 10);
    await reports.findOwnOpen("u2", P1);

    await profiles.findByUserId("u1");
    await profiles.findByUserId("u2");
    await profiles.findByUsername("alice");
    await profiles.findByUsernameIgnoreCase("BOB");
    await profiles.usernameExists("alice");
    await profiles.isFollowing("u1", "u2");
    await profiles.usernamesByUserId(["u1", "u2"]);
    await profiles.listAllSummaries();
    await roles.listAdminRoles();
    await roles.listAdminUserIds();
    await roles.hasAdminRole("u1");

    await coins.getWallet("u1");
    await coins.getBalance("u1");
    await coins.listBalances();
    await store.listOwnedItemIds("u1");
    await store.hasPurchased("u1", "theme-dark");

    await contests.listVisible(null);
    await contests.listVisible("u1");
    await contests.findWithProblems(CONTEST);
    await contests.findById(CONTEST);
    await contests.findByInviteCode("ABC123");

    await blog.listPublished();
    await blog.findPublished("hi");
    await blog.findBySlug("hi");
    await blog.slugExists("hi");
    await blog.findVoteValue("hi", "u2");
    await comments.listForTarget({ targetType: "problem", targetId: "odd-or-even" }, 10);
    await comments.statsByUser();

    await github.findByUserId("u1");
    await github.findSettings("u1");
    await snippets.findBySlug("abc");
  });

  it("stays in agreement after mirrored writes", async () => {
    const created = await problems.create({ title: "New", slug: "new", difficulty: "Medium", category: "Maps", description: "d" });
    await problems.updateById(String(created._id), { title: "Renamed" });
    await problems.findPublicByIdOrSlug("new");

    const sub = await submissions.create({
      problemId: created._id, problemSlug: "new", userId: "u2", userName: "bob", userImageUrl: "",
      code: "x", input: "{}", output: "{}", status: "Accepted", executionTime: "1ms",
    });
    await submissions.hasOtherAccepted("u2", created._id, sub._id);
    await submissions.listByUser("u2");
    await submissions.statsByUser();

    await bookmarks.toggle("u2", P2, "two");
    await bookmarks.toggle("u1", P1, "odd-or-even");
    await bookmarks.listByUser("u2");
    await bookmarks.listByUser("u1");
    await notes.saveOwn("u2", P1, "odd-or-even", "note");
    await notes.findOwn("u2", P1);

    const report = await reports.create({
      problemId: P2, problemSlug: "two", userId: "u1", userName: "alice", reason: "other", details: "x",
    });
    if (report === "duplicate") throw new Error("unexpected duplicate");
    await reports.updateById(String(report._id), { status: "resolved", resolvedBy: "u1", resolvedAt: new Date() });
    await reports.listByStatus("resolved", 10);

    await profiles.create("u3", "carol");
    await profiles.upsertUsernameAndBio("u3", "caroline", "bio");
    await profiles.follow("u3", "u1");
    await profiles.unfollow("u1", "u2");
    await profiles.findByUserId("u1");
    await profiles.findByUserId("u3");
    await roles.grantAdmin("u3", "carol", "u1");
    await roles.listAdminRoles();

    await coins.credit("u3", { type: "first_solve", amount: 10, description: "" });
    await coins.debitIfAffordable("u3", 4, { type: "purchase", description: "theme" });
    await coins.debitIfAffordable("u3", 400, { type: "purchase", description: "too much" });
    await coins.getWallet("u3");
    await store.recordPurchase("u3", "theme-dark", 4);
    await store.listOwnedItemIds("u3");

    await contests.addParticipant(CONTEST, { userId: "u3", userName: "carol", userImageUrl: "" });
    await contests.findById(CONTEST);
    await contests.removeParticipant(CONTEST, "u3");
    const contest = await contests.create({
      title: "New", description: "", createdBy: "u1", createdByName: "alice", problems: [P1],
      problemSlugs: ["odd-or-even"], startTime: new Date("2026-05-01T10:00Z"), endTime: new Date("2026-05-01T11:00Z"),
      duration: 60, status: "upcoming", isPublic: false, maxParticipants: 5, inviteCode: "NEW1",
    });
    await contests.listVisible("u1");
    await contests.deleteById(String(contest._id));
    await contests.listVisible("u1");

    await blog.castVote("hi", "u3", 1);
    await blog.adjustVoteCounts("hi", 1, 0);
    await blog.findVoteValue("hi", "u3");
    await blog.retractVote("hi", "u2");
    await blog.findBySlug("hi");
    const post = await blog.create({
      title: "Second", slug: "second", content: "x", authorId: "u3", authorName: "carol",
      authorImageUrl: "", tags: ["a"], published: true,
    });
    await blog.listPublished();
    await blog.deleteWithVotes(post.slug);

    const comment = await comments.create({ targetType: "blog", targetId: "hi" }, { userId: "u3", userName: "carol", userImageUrl: "" }, "hey");
    await comments.listForTarget({ targetType: "blog", targetId: "hi" }, 10);
    await comments.deleteById(String(comment._id));
    await comments.statsByUser();

    await github.saveConnection("u3", "3", "carol", "enc");
    await github.findSettings("u3");
    await github.deleteByUserId("u3");
    await github.findByUserId("u3");
    const slug = await snippets.createWithUniqueSlug(() => "shared1", EMPTY_SNIPPET);
    await snippets.findBySlug(slug ?? "");

    await problems.deleteById(String(created._id));
    await problems.listPublic({});
  });
});

describe.skipIf(!MONGO_TEST_URL || !PG_TEST_URL)("rows the copy cannot represent (#23 phase 3)", () => {
  it("are exactly the divergences shadow mode reports", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.MONGODB_URI = MONGO_TEST_URL;
    await mongoose.connect(MONGO_TEST_URL ?? "");
    const { url, db } = await seed(fixtures, "dwcode_test_parity_dirty");
    process.env.DATABASE_URL = url;
    await resetPgForTests();
    const seen: ShadowEvent[] = [];
    const off = onShadowEvent((e) => seen.push(e));
    setDataBackendForTests("shadow");
    try {
      await submissions.listByUser("u1"); // includes a submission for a deleted problem
      await contests.findById(CONTEST); // a duplicate participant, and a deleted problem
      await comments.listForTarget({ targetType: "problem", targetId: "two" }, 10); // pre-002 comment
      await submissions.slugsByOutcome("u1"); // the deleted problem's slug
      await profiles.findByUserId("u1"); // a duplicated follow and a self-follow
      expect(seen.map((e) => `${e.op} ${e.path ?? ""}`)).toEqual([
        "submissions.listByUser .length",
        "contests.findById participants.length",
        "comments.listForTarget [0].targetId",
        "submissions.slugsByOutcome notAccepted.length",
        "profiles.findByUserId following.length",
      ]);
    } finally {
      setDataBackendForTests(null);
      off();
      await resetPgForTests();
      await db.close();
      await mongoose.disconnect();
    }
  }, 60_000);
});
