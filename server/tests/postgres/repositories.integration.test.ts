/**
 * The repository facades in DATA_BACKEND=postgres mode, against a real
 * PostgreSQL seeded from the copy fixtures. Runs when PG_TEST_URL is set.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgDatabase } from "../../src/data/postgres/client.ts";
import { applyPlan, buildPlan } from "../../src/data/postgres/copy.ts";
import { setDataBackendForTests } from "../../src/data/repositories/backend.ts";
import { resetPgForTests } from "../../src/data/repositories/pg/db.ts";
import * as blog from "../../src/data/repositories/blog.ts";
import * as bookmarks from "../../src/data/repositories/bookmarks.ts";
import * as coins from "../../src/data/repositories/coins.ts";
import * as comments from "../../src/data/repositories/comments.ts";
import * as contests from "../../src/data/repositories/contests.ts";
import * as github from "../../src/data/repositories/githubIntegrations.ts";
import * as notes from "../../src/data/repositories/notes.ts";
import * as contributions from "../../src/data/repositories/contributions.ts";
import * as learners from "../../src/data/repositories/learners.ts";
import * as notifications from "../../src/data/repositories/notifications.ts";
import * as settings from "../../src/data/repositories/settings.ts";
import * as teams from "../../src/data/repositories/teams.ts";
import * as problems from "../../src/data/repositories/problems.ts";
import * as profiles from "../../src/data/repositories/profiles.ts";
import * as reports from "../../src/data/repositories/reports.ts";
import * as roles from "../../src/data/repositories/roles.ts";
import * as snippets from "../../src/data/repositories/snippets.ts";
import * as store from "../../src/data/repositories/store.ts";
import * as submissions from "../../src/data/repositories/submissions.ts";
import { isDuplicateKeyError } from "../../src/data/repositories/shared.ts";
import { BLOG, CONTEST, P1, P2, readFixtures, must } from "./fixtures.ts";
import { PG_TEST_URL, freshDatabase } from "./helpers.ts";

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
    it("finds a full problem for admins, and listing-shaped summaries", async () => {
      expect(await problems.findFullByIdOrSlug("odd-or-even")).toHaveProperty("hiddenTestCases");
      expect(await problems.findFullByIdOrSlug(P2)).toMatchObject({ slug: "two" });
      const found = await problems.summariesByIdsOrSlugs({ ids: [P1], slugs: ["two"] }, 10);
      expect(found.map((p) => p.slug).sort()).toEqual(["odd-or-even", "two"]);
      expect(found.every((p) => !("testCases" in p) && !("solution" in p))).toBe(true);
      expect(await problems.summariesByIdsOrSlugs({}, 10)).toEqual([]);
      expect(await problems.summariesByIdsOrSlugs({ ids: [P1, P2] }, 1)).toHaveLength(1);
    });

    it("counts problems per stored difficulty", async () => {
      const counts = await problems.countByDifficulty();
      expect(counts).toMatchObject({ Easy: 1, Hard: 1 });
    });

    it("samples within a difficulty and excludes ids", async () => {
      const hard = await problems.sample(5, { difficulty: "Hard" });
      expect(hard.map((p) => p.slug)).toEqual(["two"]);
      const rest = await problems.sample(5, { excludeIds: [P1] });
      expect(rest.map((p) => String(p._id))).not.toContain(P1);
    });

    it("lists without test cases or solutions, newest first", async () => {
      const list = await problems.listPublic({});
      expect(list.map((p) => p.slug)).toEqual(["odd-or-even", "two"]);
      expect(list[0]).not.toHaveProperty("testCases");
      expect(list[0]).not.toHaveProperty("hiddenTestCases");
      expect(String(must(list[0])._id)).toBe(P1);
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
      expect(String(must(s).problemId)).toBe(P1);
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

    it("pages a user's history, optionally for one problem", async () => {
      const recent = await submissions.listRecentByUser("u1", 1);
      expect(recent).toHaveLength(1);
      const forTwo = await submissions.listRecentByUser("u1", 10, "two");
      expect(forTwo.length).toBeGreaterThan(0);
      expect(forTwo.every((s) => s.problemSlug === "two")).toBe(true);
      expect(must(forTwo[0])).not.toHaveProperty("input");
    });

    it("builds leaderboard rows, preferring the earliest real name over placeholders", async () => {
      const base = { problemId: P2, problemSlug: "two", userImageUrl: "", code: "x", input: "{}", output: "{}", executionTime: "1ms" };
      await submissions.create({ ...base, userId: "lb1", userName: "Migrated", userImageUrl: "first.png", status: "Accepted" });
      await new Promise((r) => setTimeout(r, 10));
      await submissions.create({ ...base, userId: "lb1", userName: "Lena", userImageUrl: "lena.png", status: "Attempted" });
      await new Promise((r) => setTimeout(r, 10));
      await submissions.create({ ...base, userId: "lb1", userName: "Lena B", status: "Accepted" });
      await submissions.create({ ...base, userId: "lb2", userName: "Anonymous", status: "Attempted" });
      const rows = await submissions.leaderboardRows(["", "Anonymous", "Migrated"]);
      expect(rows.find((r) => r.userId === "lb1")).toEqual({
        userId: "lb1", totalSubmissions: 3, accepted: 2, solvedSlugs: ["two"],
        firstReal: { name: "Lena", imageUrl: "lena.png" }, firstAny: { imageUrl: "first.png" },
      });
      expect(rows.find((r) => r.userId === "lb2")).toMatchObject({ firstReal: null, accepted: 0, solvedSlugs: [] });
      expect(rows.some((r) => r.userId === "")).toBe(false);
    });

    it("counts activity per UTC day", async () => {
      const stats = await submissions.activityStats("u1", new Date(0));
      expect(stats).toMatchObject({ total: 2, accepted: 1 });
      expect(Object.values(stats.daily).reduce((a, b) => a + b, 0)).toBe(2);
      expect(Object.keys(stats.daily).every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
      expect((await submissions.activityStats("u1", new Date(Date.now() + 86_400_000))).daily).toEqual({});
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
      const resolved = await reports.updateById(String(must(open)._id), { status: "resolved", resolvedBy: "u1" });
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
      expect(await profiles.unfollow("u2", "u1")).toBe(true);
      expect(await profiles.isFollowing("u2", "u1")).toBe(false);
      expect(await profiles.unfollow("u2", "u1")).toBe(false);
    });

    it("creates and renames profiles, rejecting a taken username", async () => {
      expect(await profiles.create("u3", "carol")).toMatchObject({ userId: "u3", bio: "", followers: [] });
      expect(await profiles.upsertUsernameAndBio("u3", "caroline", "hi")).toMatchObject({ username: "caroline", bio: "hi" });
      // A rename without a bio keeps the stored one.
      expect(await profiles.upsertUsernameAndBio("u3", "carrie")).toMatchObject({ username: "carrie", bio: "hi" });
      expect(await profiles.upsertUsernameAndBio("u3", "caroline", "hi")).toMatchObject({ bio: "hi" });
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
      expect(await roles.revokeAdmin("u2")).toBe(true);
      expect(await roles.hasAdminRole("u2")).toBe(false);
      expect(await roles.revokeAdmin("u2")).toBe(false);
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

    it("keeps the snippet's owner", async () => {
      await snippets.createWithUniqueSlug(() => "owned", { ...EMPTY_SNIPPET, userId: "u7" });
      expect(await snippets.findBySlug("owned")).toMatchObject({ userId: "u7" });
    });
  });
  describe("contest joins and the weekly series", () => {
    const later = (h: number) => new Date(Date.now() + h * 3_600_000);
    const newContest = (over: Partial<Parameters<typeof contests.create>[0]> = {}) =>
      contests.create({
        title: "Cap", description: "", createdBy: "u1", createdByName: "alice", problems: [P1],
        problemSlugs: ["odd-or-even"], startTime: later(-1), endTime: later(1), duration: 120,
        status: "active", isPublic: true, maxParticipants: 2, inviteCode: undefined, ...over,
      });
    const joiner = (userId: string) => ({ userId, userName: userId, userImageUrl: "", score: 0, solvedProblems: [], joinedAt: new Date() });

    it("never lets concurrent joins overfill a contest", async () => {
      const c = String((await newContest())._id);
      // Many more joiners than the pool has connections, so transactions overlap.
      const users = Array.from({ length: 30 }, (_, i) => `racer${i}`);
      const outcomes = await Promise.all(users.map((u) =>
        contests.joinIfOpen(c, joiner(u), { now: new Date(), requirePublic: true })));
      expect(outcomes.filter((o) => o === "joined")).toHaveLength(2);
      expect(await contests.joinState(c, "a")).toMatchObject({ participantCount: 2, maxParticipants: 2 });
    });

    // The race above rarely overlaps on a local database, so it cannot prove the
    // lock exists. This can: hold the contest row's lock from another
    // transaction and check a join waits for it rather than counting stale rows.
    it("takes the contest row lock before counting places", async () => {
      const c = String((await newContest())._id);
      let joined = false;
      await seed.transaction(async (t) => {
        // NO KEY UPDATE, not UPDATE: the participant insert's foreign-key check
        // takes KEY SHARE, which UPDATE would block even without the join's own lock.
        await t.execute(sql`select id from contests where id = ${c} for no key update`);
        const pending = contests.joinIfOpen(c, joiner("waiter"), { now: new Date(), requirePublic: true })
          .then((o) => { joined = true; return o; });
        await new Promise((r) => setTimeout(r, 300));
        expect(joined).toBe(false);
        void pending;
      });
      await new Promise((r) => setTimeout(r, 300));
      expect(joined).toBe(true);
    });

    it("refuses ended, private (when public is required) and repeat joins", async () => {
      const ended = String((await newContest({ startTime: later(-3), endTime: later(-2) }))._id);
      expect(await contests.joinIfOpen(ended, joiner("u5"), { now: new Date(), requirePublic: false })).toBe("not_applied");
      const priv = String((await newContest({ isPublic: false, inviteCode: "PRIV9" }))._id);
      expect(await contests.joinIfOpen(priv, joiner("u5"), { now: new Date(), requirePublic: true })).toBe("not_applied");
      expect(await contests.joinIfOpen(priv, joiner("u5"), { now: new Date(), requirePublic: false })).toBe("joined");
      expect(await contests.joinIfOpen(priv, joiner("u5"), { now: new Date(), requirePublic: false })).toBe("not_applied");
      expect(await contests.joinState(priv, "u5")).toMatchObject({ isParticipant: true, isPublic: false });
    });

    it("leaves, and deletes only for the owner", async () => {
      const c = String((await newContest())._id);
      expect(await contests.removeParticipant(c, "nobody")).toBe(true);
      expect(await contests.removeParticipant("0".repeat(24), "u1")).toBe(false);
      expect(await contests.deleteOwned(c, "u2")).toBe(false);
      expect(await contests.deleteOwned(c, "u1")).toBe(true);
      expect(await contests.findById(c)).toBeNull();
    });

    it("rejects a second contest with the same series key", async () => {
      expect(await contests.existsBySeriesKey("weekly-2026-W46")).toBe(false);
      await newContest({ seriesKey: "weekly-2026-W46" });
      expect(await contests.existsBySeriesKey("weekly-2026-W46")).toBe(true);
      await expect(newContest({ seriesKey: "weekly-2026-W46" })).rejects.toSatisfy(isDuplicateKeyError);
    });
  });
  describe("notifications and settings (Phase A)", () => {
    it("lists a user's notifications newest first and counts the unread", async () => {
      await notifications.create("n1", { kind: "follower", title: "first" });
      await new Promise((r) => setTimeout(r, 5));
      const second = await notifications.create("n1", { kind: "achievement", title: "second", body: "b", link: "/profile" });
      await notifications.create("n2", { kind: "follower", title: "someone else's" });
      const list = await notifications.listForUser("n1", 10);
      expect(list.map((n) => n.title)).toEqual(["second", "first"]);
      expect(list[0]).toMatchObject({ kind: "achievement", body: "b", link: "/profile", read: false });
      expect(await notifications.countUnread("n1")).toBe(2);

      await notifications.markRead("n1", [String(second._id), "not-a-hex-id"]);
      expect(await notifications.countUnread("n1")).toBe(1);
      await notifications.markRead("n2", [String(second._id)]);
      expect(await notifications.countUnread("n1")).toBe(1);
      await notifications.markRead("n1");
      expect(await notifications.countUnread("n1")).toBe(0);
      expect(await notifications.countUnread("n2")).toBe(1);
    });

    it("stores and replaces a setting by key", async () => {
      expect(await settings.get("announcement")).toBeNull();
      await settings.set("announcement", { message: "hi", level: "info" }, "admin");
      expect(await settings.get("announcement")).toEqual({ message: "hi", level: "info" });
      await settings.set("announcement", null, "admin");
      expect(await settings.get("announcement")).toBeNull();
    });
  });
  describe("competition data (Phase C)", () => {
    it("claims a key once", async () => {
      expect(await settings.claim("contest-final:x", { at: 1 }, "system")).toBe(true);
      expect(await settings.claim("contest-final:x", { at: 2 }, "system")).toBe(false);
    });

    it("returns submissions to given problems inside a window", async () => {
      const rows = await submissions.inWindowForProblems(["odd-or-even"], new Date(0), new Date(Date.now() + 1000), 100);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.problemSlug === "odd-or-even")).toBe(true);
      const later = Date.now() + 3_600_000;
      expect(await submissions.inWindowForProblems(["odd-or-even"], new Date(later), new Date(later + 1000), 100)).toEqual([]);
      expect(await submissions.inWindowForProblems([], new Date(0), new Date(), 100)).toEqual([]);
    });

    it("keeps a user in at most one team and bounds team size", async () => {
      const team = await teams.create({ slug: "pg-team", name: "PG Team", ownerId: "t1", inviteCode: "PGCODE01", listed: true });
      expect(team).not.toBe("duplicate");
      expect(await teams.create({ slug: "pg-team", name: "Again", ownerId: "t9", inviteCode: "PGCODE02", listed: true })).toBe("duplicate");
      expect(await teams.addMember("pg-team", "t2", 2)).toBe("joined");
      expect(await teams.addMember("pg-team", "t3", 2)).toBe("full");
      expect(await teams.create({ slug: "other", name: "Other", ownerId: "t2", inviteCode: "PGCODE03", listed: true })).toBe("duplicate");
      expect((await teams.findForMember("t2"))?.slug).toBe("pg-team");
      expect((await teams.memberships()).filter((m) => m.slug === "pg-team")).toHaveLength(2);
      await teams.removeMember("pg-team", "t2");
      expect(await teams.findForMember("t2")).toBeNull();
      await teams.deleteBySlug("pg-team");
      expect(await teams.findBySlug("pg-team")).toBeNull();
    });

    it("stores a country only once chosen", async () => {
      expect(await profiles.findByUserId("u1")).not.toHaveProperty("country");
      await profiles.setCountry("u1", "IN");
      expect(await profiles.findByUserId("u1")).toMatchObject({ country: "IN" });
      expect((await profiles.countriesByUserId()).get("u1")).toBe("IN");
      await profiles.setCountry("u1", null);
      expect(await profiles.findByUserId("u1")).not.toHaveProperty("country");
    });
  });
  describe("learner state (Phase D)", () => {
    it("creates, replaces and reads one state per learner", async () => {
      expect(await learners.get("learner_1")).toBeNull();
      await learners.put("learner_1", { onboarding: null, quizzesPassed: ["beginner/b-first"], review: {} });
      await learners.put("learner_1", { onboarding: null, quizzesPassed: [], review: { q1: { box: 0, due: "2026-01-01T00:00:00.000Z" } } });
      expect(await learners.get("learner_1")).toEqual({ onboarding: null, quizzesPassed: [], review: { q1: { box: 0, due: "2026-01-01T00:00:00.000Z" } } });
      expect(await learners.get("learner_2")).toBeNull();
    });
  });
  describe("contributions (Phase E)", () => {
    it("creates, transitions atomically, queues and deletes drafts", async () => {
      const c = await contributions.create({ kind: "problem", authorId: "author_1", status: "draft", payload: { title: "T" } });
      const id = String(c._id);
      expect(await contributions.countByAuthor("author_1", "problem", ["draft", "submitted"])).toBe(1);
      expect(await contributions.transition(id, ["submitted"], { status: "approved" })).toBeNull();
      const submitted = await contributions.transition(id, ["draft"], { status: "submitted", check: { ok: true } });
      expect(submitted).toMatchObject({ status: "submitted", check: { ok: true } });
      expect((await contributions.listByStatus("submitted", "problem", 10)).map((x) => String(x._id))).toEqual([id]);
      expect(await contributions.listByStatus("submitted", "question", 10)).toEqual([]);
      expect(await contributions.removeDraft(id, "author_1")).toBe(false); // not a draft
      await contributions.transition(id, ["submitted"], { status: "draft" });
      expect(await contributions.removeDraft(id, "someone_else")).toBe(false);
      expect(await contributions.removeDraft(id, "author_1")).toBe(true);
      expect(await contributions.findById(id)).toBeNull();
      expect(await contributions.findById("not-an-id")).toBeNull();
    });
  });
});
