/** Mongo-shaped documents covering every collection the copy script reads. */
const oid = (n: number) => n.toString(16).padStart(24, "0");

export const P1 = oid(1);
export const P2 = oid(2);
export const DELETED_PROBLEM = oid(99);
export const BLOG = oid(10);
export const CONTEST = oid(20);

export const fixtures: Record<string, Record<string, unknown>[]> = {
  problems: [
    {
      _id: P1, title: "Odd or even", slug: "odd-or-even", difficulty: "Easy", category: "Basics",
      tags: ["math"], description: "d", examples: [{ _id: oid(500), input: "{}", output: "{}" }],
      testCases: [{ _id: oid(501), input: "{}", expectedOutput: "{}" }],
      hiddenTestCases: [], createdAt: new Date("2026-01-01"),
    },
    { _id: P2, title: "Two", slug: "two", difficulty: "Hard", category: "Maps", description: "d" },
  ],
  submissions: [
    { _id: oid(100), problemId: P1, problemSlug: "odd-or-even", userId: "u1", code: "x", status: "Accepted" },
    { _id: oid(101), problemId: DELETED_PROBLEM, problemSlug: "gone", userId: "u1", code: "x" },
  ],
  bookmarks: [
    { _id: oid(110), problemId: P1, problemSlug: "odd-or-even", userId: "u1" },
    { _id: oid(111), problemId: P1, problemSlug: "odd-or-even", userId: "" },
  ],
  notes: [{ _id: oid(120), problemId: P2, problemSlug: "two", userId: "u1", content: "remember" }],
  problemreports: [
    { _id: oid(130), problemId: P1, problemSlug: "odd-or-even", userId: "u2", reason: "wrong-expected-output", status: "open" },
  ],
  userprofiles: [
    { userId: "u1", username: "alice", following: ["u2", "u2", "u1"], followers: [] },
    { userId: "u2", username: "bob", following: [], followers: ["u1"] },
  ],
  userroles: [{ userId: "u1", role: "admin", grantedBy: "seed" }],
  usercoins: [
    {
      userId: "u1", balance: 15,
      transactions: [
        // Newest first, as Mongo's $position: 0 stores them.
        { _id: oid(140), type: "first_solve", amount: 10, description: "", createdAt: new Date("2026-01-02") },
        { _id: oid(141), type: "comment", amount: 5, description: "", createdAt: new Date("2026-01-01") },
      ],
    },
  ],
  storepurchases: [{ userId: "u1", itemId: "theme-dark", cost: 5 }],
  contests: [
    {
      _id: CONTEST, title: "Weekly", createdBy: "u1", createdByName: "alice",
      problems: [P1, P2, DELETED_PROBLEM], problemSlugs: ["odd-or-even", "two", "gone"], startTime: new Date("2026-02-01T10:00Z"),
      endTime: new Date("2026-02-01T11:00Z"), duration: 60, inviteCode: "abc123",
      participants: [
        { userId: "u1", userName: "alice", score: 3, solvedProblems: ["odd-or-even"] },
        { userId: "u1", userName: "alice dup" },
      ],
    },
    {
      _id: oid(21), title: "Broken", createdBy: "u1", createdByName: "alice", duration: 0,
      startTime: new Date("2026-02-01"), endTime: new Date("2026-02-01"),
    },
  ],
  blogs: [{ _id: BLOG, title: "Hi", slug: "hi", content: "# hi", authorId: "u1", upvotes: 1 }],
  blogvotes: [
    { blogSlug: "hi", userId: "u2", value: 1 },
    { blogSlug: "missing", userId: "u2", value: 1 },
  ],
  comments: [
    // Problem comments are dual-written with problemSlug (migration 002 rollout).
    { _id: oid(150), targetType: "problem", targetId: "odd-or-even", problemSlug: "odd-or-even", userId: "u2", userName: "bob", content: "nice" },
    { _id: oid(151), problemSlug: "two", userId: "u2", userName: "bob", content: "legacy" },
  ],
  githubintegrations: [{ userId: "u1", githubId: "1", githubUsername: "alice", accessToken: "enc" }],
  playgroundsnippets: [{ _id: oid(160), slug: "abc", script: "%dw 2.0", files: [], testCases: [] }],
};

export const readFixtures = (c: string) => Promise.resolve(fixtures[c] ?? []);

/**
 * The fixtures without the rows the copy deliberately cannot represent
 * (orphans, an invalid contest, an anonymous bookmark, a vote for a missing
 * post, a pre-migration-002 comment, a duplicated follow). On this set Mongo and Postgres must
 * agree exactly; `DIRTY` lists what was removed.
 */
export const DIRTY = {
  submissions: [oid(101)],
  bookmarks: [oid(111)],
  contests: [oid(21)],
  comments: [oid(151)],
};

export function cleanFixtures(): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [name, docs] of Object.entries(fixtures)) {
    const drop = new Set<string>(DIRTY[name as keyof typeof DIRTY] ?? []);
    out[name] = docs.filter((d) => !drop.has(String(d._id)));
  }
  out.blogvotes = fixtures.blogvotes.filter((v) => v.blogSlug !== "missing");
  out.contests = out.contests.map((c) => ({
    ...c,
    problems: (c.problems as string[]).filter((id) => id !== DELETED_PROBLEM),
    problemSlugs: (c.problemSlugs as string[]).filter((s) => s !== "gone"),
    participants: (c.participants as Record<string, unknown>[]).slice(0, 1),
  }));
  // Mongo stores the array as written; the copy de-duplicates and drops self-follows.
  out.userprofiles = out.userprofiles.map((p) => (p.userId === "u1" ? { ...p, following: ["u2"] } : p));
  return out;
}
