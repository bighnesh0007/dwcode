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
        { _id: oid(140), type: "first_solve", amount: 10, description: "" },
        { _id: oid(141), type: "comment", amount: 5, description: "" },
      ],
    },
  ],
  storepurchases: [{ userId: "u1", itemId: "theme-dark", cost: 5 }],
  contests: [
    {
      _id: CONTEST, title: "Weekly", createdBy: "u1", createdByName: "alice",
      problems: [P1, P2, DELETED_PROBLEM], startTime: new Date("2026-02-01T10:00Z"),
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
    { _id: oid(150), targetType: "problem", targetId: "odd-or-even", userId: "u2", userName: "bob", content: "nice" },
    { _id: oid(151), problemSlug: "two", userId: "u2", userName: "bob", content: "legacy" },
  ],
  githubintegrations: [{ userId: "u1", githubId: "1", githubUsername: "alice", accessToken: "enc" }],
  playgroundsnippets: [{ _id: oid(160), slug: "abc", script: "%dw 2.0", files: [], testCases: [] }],
};

export const readFixtures = (c: string) => Promise.resolve(fixtures[c] ?? []);
