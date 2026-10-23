/**
 * The repository facades in DATA_BACKEND=postgres mode, against a real
 * PostgreSQL seeded from the copy fixtures. Runs when PG_TEST_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgDatabase } from "@/db/postgres/client";
import { applyPlan, buildPlan } from "@/db/postgres/copy";
import { setDataBackendForTests } from "@/lib/repositories/backend";
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
import { isDuplicateKeyError } from "@/lib/repositories/shared";
import { BLOG, CONTEST, P1, P2, readFixtures } from "./fixtures";
import { PG_TEST_URL, freshDatabase } from "./helpers";

/** Content as the share route passes it (its arrays are typed as Mongoose's). */
const EMPTY_SNIPPET = { script: "%dw 2.0", files: [], testCases: [] } as unknown as Parameters<
  typeof snippets.createWithUniqueSlug
>[1];

describe.skipIf(!PG_TEST_URL)("repositories on PostgreSQL (#23 phase 3)", () => {
  let seed: PgDatabase;

  beforeAll(async () => {
    const fresh = await freshDatabase("dwcode_test_repositories");
    seed = fresh.db;
    await applyPlan(seed, await buildPlan(readFixtures));
    process.env.DATABASE_URL = fresh.url;
    setDataBackendForTests("postgres");
  });
  afterAll(async () => {
    setDataBackendForTests(null);
    await resetPgForTests();
    await seed?.close();
  });

  describe("problems", () => {
    it("lists without test cases or solutions, newest first", async () => {
      const list = await problems.listPublic({});
      expect(list.map((p) => p.slug)).toEqual(["odd-or-even", "two"]);
      expect(list[0]).not.toHaveProperty("testCases");
      expect(list[0]).not.toHaveProperty("hiddenTestCases");
      expect(String(list[0]._id)).toBe(P1);
    });

    it("finds by id or slug, never exposing hidden cases", async () => {
      expect((await problems.findPublicByIdOrSlug(P1))?.slug).toBe("odd-or-even");
      const bySlug = await problems.findPublicByIdOrSlug("two");
      expect(String(bySlug?._id)).toBe(P2);
      expect(bySlug).not.toHaveProperty("hiddenTestCases");
      expect(await problems.findForWorkspace("odd-or-even")).not.toHaveProperty("hiddenTestCases");
      expect(await problems.findForGrading(P1)).toHaveProperty("hiddenTestCases");
    });

    it("maps ids and slugs both ways and counts by filter", async () => {
      expect(await problems.findSlugById(P2)).toBe("two");
      expect(String(await problems.findIdBySlug("two"))).toBe(P2);
      expect((await problems.slugsForIds([P1, P2])).sort()).toEqual(["odd-or-even", "two"]);
      expect(await problems.difficultyBySlug()).toEqual({ "odd-or-even": "Easy", two: "Hard" });
      expect(await problems.count({ difficulty: "Hard" })).toBe(1);
      expect(await problems.findSlugById("not-an-id")).toBeNull();
    });

    it("creates, updates (reporting slug collisions) and deletes", async () => {
      const created = await problems.create({
        title: "New", slug: "new", difficulty: "Medium", category: "Maps", description: "d",
        createdByAI: true, notAColumn: "ignored",
      });
      expect(created).toMatchObject({ slug: "new", createdByAI: true, tags: [] });
      expect(await problems.updateById(String(created._id), { slug: "two" })).toBe("duplicate");
      expect(await problems.updateById(String(created._id), { title: "Renamed" })).toMatchObject({ title: "Renamed" });
      expect(await problems.deleteById(String(created._id))).toBe(true);
      expect(await problems.deleteById(String(created._id))).toBe(false);
    });
  });

  describe("submissions", () => {
    it("joins the problem slug back in", async () => {
      const [s] = await submissions.listByUser("u1");
      expect(s).toMatchObject({ problemSlug: "odd-or-even", status: "Accepted" });
      expect(String(s.problemId)).toBe(P1);
    });

    it("records a submission and answers the solved questions", async () => {
      const created = await submissions.create({
        problemId: P2, problemSlug: "two", userId: "u1", userName: "alice", userImageUrl: "",
        code: "x", input: "{}", output: "{}", status: "Attempted", executionTime: "1ms",
      });
      expect(created.problemSlug).toBe("two");
      expect(await submissions.hasAcceptedForSlug("u1", "odd-or-even")).toBe(true);
      expect(await submissions.hasOtherAccepted("u1", P1, created._id)).toBe(true);
      expect(await submissions.slugsByOutcome("u1")).toEqual({ accepted: ["odd-or-even"], notAccepted: ["two"] });
      const [stats] = (await submissions.statsByUser()).filter((r) => r._id === "u1");
      expect(stats).toMatchObject({ totalSubmissions: 2, accepted: 1, solvedSlugs: ["odd-or-even"] });
    });
  });

  describe("bookmarks and notes", () => {
    it("toggles a bookmark off and on", async () => {
      expect(await bookmarks.countByUser("u1")).toBe(1);
      expect(await bookmarks.toggle("u1", P1, "odd-or-even")).toBe(false);
      expect(await bookmarks.toggle("u1", P1, "odd-or-even")).toBe(true);
      expect((await bookmarks.listByUser("u1"))[0]).toMatchObject({ problemSlug: "odd-or-even" });
    });

    it("keeps notes per user", async () => {
      expect(await notes.findOwn("u1", P2)).toMatchObject({ content: "remember", problemSlug: "two" });
      expect(await notes.findOwn("u2", P2)).toBeNull();
      expect(await notes.saveOwn("u2", P2, "two", "mine")).toMatchObject({ userId: "u2", content: "mine" });
      expect(await notes.findOwn("u1", P2)).toMatchObject({ content: "remember" });
    });
  });

  describe("reports", () => {
    it("allows one open report per user per problem", async () => {
      expect(await reports.findOwnOpen("u2", P1)).toMatchObject({ status: "open" });
      const again = await reports.create({
        problemId: P1, problemSlug: "odd-or-even", userId: "u2", userName: "bob", reason: "other", details: "",
      });
      expect(again).toBe("duplicate");
      const [open] = await reports.listByStatus("open", 10);
      const resolved = await reports.updateById(String(open._id), { status: "resolved", resolvedBy: "u1" });
      expect(resolved).toMatchObject({ status: "resolved", resolvedBy: "u1", problemSlug: "odd-or-even" });
      expect(await reports.create({
        problemId: P1, problemSlug: "odd-or-even", userId: "u2", userName: "bob", reason: "other", details: "",
      })).toMatchObject({ status: "open" });
    });
  });

  describe("profiles and follows", () => {
    it("rebuilds followers and following from edges", async () => {
      expect(await profiles.findByUserId("u1")).toMatchObject({ username: "alice", following: ["u2"], followers: [] });
      expect(await profiles.findByUsernameIgnoreCase("BOB")).toMatchObject({ userId: "u2", followers: ["u1"] });
      expect(await profiles.isFollowing("u1", "u2")).toBe(true);
    });

    it("follows and unfollows idempotently, never self", async () => {
      await profiles.follow("u2", "u1");
      await profiles.follow("u2", "u1");
      await profiles.follow("u2", "u2");
      expect(await profiles.findByUserId("u2")).toMatchObject({ following: ["u1"] });
      await profiles.unfollow("u2", "u1");
      expect(await profiles.isFollowing("u2", "u1")).toBe(false);
    });

    it("creates and renames profiles, rejecting a taken username", async () => {
      expect(await profiles.create("u3", "carol")).toMatchObject({ userId: "u3", bio: "", followers: [] });
      expect(await profiles.upsertUsernameAndBio("u3", "caroline", "hi")).toMatchObject({ username: "caroline", bio: "hi" });
      await expect(profiles.create("u4", "alice")).rejects.toSatisfy(isDuplicateKeyError);
      expect((await profiles.usernamesByUserId(["u1", "u3"])).get("u3")).toBe("caroline");
    });
  });

  describe("coins and store", () => {
    it("credits and debits atomically, refusing an overdraft", async () => {
      expect(await coins.getBalance("u1")).toBe(15);
      await coins.credit("u1", { type: "comment", amount: 5, description: "" });
      expect(await coins.debitIfAffordable("u1", 100, { type: "purchase", description: "too much" })).toBeNull();
      expect(await coins.debitIfAffordable("u1", 20, { type: "purchase", description: "theme" })).toBe(0);
      const wallet = await coins.getWallet("u1");
      expect(wallet.balance).toBe(0);
      expect(wallet.transactions.map((t) => t.amount)).toEqual(expect.arrayContaining([-20, 5, 10, 5]));
      expect(wallet.transactions).toHaveLength(4);
    });

    it("never lets two concurrent debits spend the same coins", async () => {
      await coins.credit("u9", { type: "seed", amount: 10, description: "" });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => coins.debitIfAffordable("u9", 10, { type: "purchase", description: "" })),
      );
      expect(results.filter((r) => r !== null)).toEqual([0]);
      expect(await coins.getBalance("u9")).toBe(0);
    });

    it("records a purchase once", async () => {
      expect(await store.hasPurchased("u1", "theme-dark")).toBe(true);
      expect(await store.recordPurchase("u1", "theme-dark", 5)).toBe("duplicate");
      expect(await store.recordPurchase("u1", "theme-light", 5)).toBe("created");
      expect((await store.listOwnedItemIds("u1")).sort()).toEqual(["theme-dark", "theme-light"]);
    });

    it("grants and revokes admin", async () => {
      expect(await roles.hasAdminRole("u1")).toBe(true);
      await roles.grantAdmin("u2", "bob", "u1");
      expect((await roles.listAdminUserIds()).sort()).toEqual(["u1", "u2"]);
      await roles.revokeAdmin("u2");
      expect(await roles.hasAdminRole("u2")).toBe(false);
    });
  });

  describe("contests", () => {
    it("returns problems in order, populated when asked, and participants", async () => {
      const c = await contests.findById(CONTEST);
      expect(c?.problems.map(String)).toEqual([P1, P2]);
      expect(c?.problemSlugs).toEqual(["odd-or-even", "two"]);
      expect(c?.participants).toMatchObject([{ userId: "u1", score: 3, solvedProblems: ["odd-or-even"] }]);
      const populated = await contests.findWithProblems(CONTEST);
      expect(populated?.problems[0]).toMatchObject({ slug: "odd-or-even", difficulty: "Easy" });
      expect((await contests.findByInviteCode("ABC123"))?.title).toBe("Weekly");
    });

    it("joins once, leaves, and shows private contests to members only", async () => {
      await contests.addParticipant(CONTEST, { userId: "u2", userName: "bob", userImageUrl: "" });
      await contests.addParticipant(CONTEST, { userId: "u2", userName: "bob", userImageUrl: "" });
      expect((await contests.findById(CONTEST))?.participants.map((p) => p.userId)).toEqual(["u1", "u2"]);
      await contests.removeParticipant(CONTEST, "u2");

      const priv = await contests.create({
        title: "Private", description: "", createdBy: "u1", createdByName: "alice",
        problems: [P2, P2], problemSlugs: ["two"], startTime: new Date("2026-03-01T10:00Z"),
        endTime: new Date("2026-03-01T11:00Z"), duration: 60, status: "upcoming",
        isPublic: false, maxParticipants: 10, inviteCode: "xyz",
      });
      expect(priv).toMatchObject({ inviteCode: "XYZ", problemSlugs: ["two"], participants: [] });
      const ids = async (user: string | null) => (await contests.listVisible(user)).map((c) => String(c._id));
      expect(await ids(null)).not.toContain(String(priv._id));
      expect(await ids("u1")).toContain(String(priv._id));
      await contests.deleteById(String(priv._id));
      expect(await contests.findById(String(priv._id))).toBeNull();
    });
  });

  describe("blog and comments", () => {
    it("casts, changes and retracts a vote, reporting the previous value", async () => {
      expect(await blog.findVoteValue("hi", "u2")).toBe(1);
      expect(await blog.castVote("hi", "u2", -1)).toBe(1);
      expect(await blog.castVote("hi", "u3", 1)).toBe(0);
      expect(await blog.retractVote("hi", "u3")).toBe(1);
      expect(await blog.retractVote("hi", "u3")).toBe(0);
      await blog.adjustVoteCounts("hi", -1, 1);
      expect(await blog.findPublished("hi")).toMatchObject({ upvotes: 0, downvotes: 1 });
    });

    it("deletes a post with its votes, so a reused slug starts clean", async () => {
      await blog.create({
        title: "Temp", slug: "temp", content: "x", authorId: "u1", authorName: "alice",
        authorImageUrl: "", tags: [], published: true,
      });
      await blog.castVote("temp", "u2", 1);
      await blog.deleteWithVotes("temp");
      expect(await blog.slugExists("temp")).toBe(false);
      await blog.create({
        title: "Temp again", slug: "temp", content: "x", authorId: "u1", authorName: "alice",
        authorImageUrl: "", tags: [], published: false,
      });
      expect(await blog.findVoteValue("temp", "u2")).toBe(0);
      expect(await blog.findPublished("temp")).toBeNull();
      expect(String((await blog.findBySlug("hi"))?._id)).toBe(BLOG);
    });

    it("lists comments per target, legacy problem comments included", async () => {
      const legacy = await comments.listForTarget({ targetType: "problem", targetId: "two" }, 10);
      expect(legacy).toMatchObject([{ content: "legacy", problemSlug: "two" }]);
      const made = await comments.create({ targetType: "blog", targetId: "hi" }, { userId: "u1", userName: "alice", userImageUrl: "" }, "great");
      expect(made).not.toHaveProperty("problemSlug");
      expect(await comments.findAuthorId(String(made._id))).toBe("u1");
      await comments.deleteById(String(made._id));
      expect(await comments.findAuthorId(String(made._id))).toBeNull();
      expect((await comments.statsByUser()).find((s) => s._id === "u2")).toMatchObject({ count: 2, userName: "bob" });
    });
  });

  describe("integrations", () => {
    it("keeps the token out of the settings read", async () => {
      expect(await github.findByUserId("u1")).toMatchObject({ accessToken: "enc" });
      expect(await github.findSettings("u1")).not.toHaveProperty("accessToken");
      await github.saveConnection("u1", "1", "alice2", "enc2");
      expect(await github.findSettings("u1")).toMatchObject({ githubUsername: "alice2" });
      await github.deleteByUserId("u1");
      expect(await github.findByUserId("u1")).toBeNull();
    });

    it("stores snippets under a fresh slug, retrying on collision", async () => {
      const slugs = ["abc", "def"];
      const slug = await snippets.createWithUniqueSlug(() => slugs.shift() ?? "zzz", EMPTY_SNIPPET);
      expect(slug).toBe("def");
      expect(await snippets.findBySlug("def")).toMatchObject({ script: "%dw 2.0" });
    });
  });
});
