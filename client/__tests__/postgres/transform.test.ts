import { describe, expect, it } from "vitest";
import { buildPlan } from "@/db/postgres/copy";
import { toComment, toContest, toProfile, toWallet } from "@/db/postgres/transform";
import { CONTEST, DELETED_PROBLEM, P1, P2, fixtures, readFixtures } from "./fixtures";

const rowsOf = async (name: string) =>
  (await buildPlan(readFixtures)).tables.find((t) => t.name === name)?.rows ?? [];

describe("Mongo → Postgres transforms (#23)", () => {
  it("turns following arrays into deduplicated edges without self-follows", () => {
    const out = toProfile(fixtures.userprofiles[0]);
    expect("rows" in out && out.rows.follows).toEqual([{ followerId: "u1", followedId: "u2" }]);
  });

  it("keeps the stored balance and every ledger entry", () => {
    const out = toWallet(fixtures.usercoins[0]);
    if (!("rows" in out)) throw new Error("skipped");
    expect(out.rows.balance).toEqual({ userId: "u1", balance: 15 });
    expect(out.rows.transactions.map((t) => t.amount)).toEqual([10, 5]);
  });

  it("maps legacy problem comments that only have problemSlug", () => {
    const out = toComment(fixtures.comments[1]);
    expect("rows" in out && out.rows).toMatchObject({ targetType: "problem", targetId: "two" });
  });

  it("orders contest problems and drops duplicate participants", () => {
    const out = toContest(fixtures.contests[0]);
    if (!("rows" in out)) throw new Error("skipped");
    expect(out.rows.problems.map((p) => p.problemId)).toEqual([P1, P2, DELETED_PROBLEM]);
    expect(out.rows.participants).toHaveLength(1);
    expect(out.rows.contest.inviteCode).toBe("ABC123");
  });

  it("skips a contest whose end is not after its start", () => {
    expect(toContest(fixtures.contests[1])).toEqual({ skip: "endTime is not after startTime" });
  });

  it("strips Mongo subdocument ids from jsonb values", async () => {
    const [p] = await rowsOf("problems");
    expect(p.testCases).toEqual([{ input: "{}", expectedOutput: "{}" }]);
  });
});

describe("buildPlan (#23)", () => {
  it("drops rows pointing at deleted problems and counts every skip by reason", async () => {
    const plan = await buildPlan(readFixtures);
    expect((await rowsOf("submissions")).map((s) => s.id)).not.toContain(fixtures.submissions[1]._id);
    expect((await rowsOf("contest_problems")).map((p) => p.problemId)).toEqual([P1, P2]);
    expect(Object.fromEntries(plan.skipped)).toEqual({
      "submissions: problem no longer exists": 1,
      "bookmarks: anonymous bookmark (empty userId)": 1,
      "contests: endTime is not after startTime": 1,
      "contests: contest problem no longer exists": 1,
      "blogvotes: vote for a blog that does not exist": 1,
    });
    expect((await rowsOf("contests")).map((c) => c.id)).toEqual([CONTEST]);
  });
});
