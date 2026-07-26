/**
 * Security regression — access control on the routes fixed in Week 1.
 *
 * Findings covered:
 *   C-1  unauthenticated PUT/DELETE on /api/problems/[id]
 *   C-2  unauthenticated POST /api/generate
 *   C-3  unauthenticated + globally-shared /api/notes
 *   C-4  client-supplied verdict on POST /api/submissions
 *   C-5  unverified bulk solves via /api/migrate-guest-progress
 *   M-1  unauthenticated POST /api/problems
 *
 * Each test asserts the status an ANONYMOUS or UNDER-PRIVILEGED caller gets.
 * They must fail if any of the Week 1 guards are removed.
 *
 * These are handler-level tests with the data layer mocked — enough to pin the
 * authorization contract without a database. Full end-to-end coverage with
 * mongodb-memory-server is TEST-03.
 */
/*
 * `unbound-method` fires on every `vi.mocked(Model.method)` read, which is the
 * standard vitest idiom for asserting on a mocked call — the reference is only
 * inspected, never invoked detached. Disabled for this file rather than
 * project-wide so production code keeps the rule.
 */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Identity, controlled per test ────────────────────────────────────────────
const authState = { userId: null as string | null };
const adminState = { admin: null as { userId: string; isSuperAdmin: boolean } | null };

vi.mock("@clerk/nextjs/server", () => ({
    auth: () => Promise.resolve({ userId: authState.userId }),
    currentUser: () =>
        Promise.resolve(authState.userId ? { fullName: "Test User", imageUrl: "" } : null),
}));

vi.mock("@/lib/adminCheck", () => ({
    requireAdmin: () => Promise.resolve(adminState.admin),
}));

// ── Data layer, stubbed ──────────────────────────────────────────────────────
vi.mock("@/lib/db", () => ({ default: () => Promise.resolve(undefined) }));

const problemDoc = {
    _id: "507f1f77bcf86cd799439011",
    title: "T",
    slug: "t",
    difficulty: "Easy",
    testCases: [],
    examples: [],
};

vi.mock("@/models/Problem", () => ({
    Problem: {
        findById: vi.fn(() => ({ select: () => ({ lean: () => Promise.resolve(problemDoc) }) })),
        findByIdAndUpdate: vi.fn(() => Promise.resolve(problemDoc)),
        findByIdAndDelete: vi.fn(() => Promise.resolve(problemDoc)),
        findOne: vi.fn(() => ({ select: () => ({ lean: () => Promise.resolve(problemDoc) }) })),
    },
}));

vi.mock("@/models/Note", () => ({
    Note: {
        findOne: vi.fn(() => ({ lean: () => Promise.resolve(null) })),
        findOneAndUpdate: vi.fn(() => Promise.resolve({ content: "x" })),
    },
}));

vi.mock("@/models/Submission", () => ({
    Submission: {
        find: vi.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([]) }) })),
        countDocuments: vi.fn(() => Promise.resolve(0)),
        exists: vi.fn(() => Promise.resolve(null)),
    },
}));

vi.mock("@/lib/coins", () => ({ awardCoins: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/github", () => ({
    pushSolutionToGithub: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@google/genai", () => ({
    GoogleGenAI: class {
        models = { generateContent: () => Promise.resolve({ text: "{}" }) };
    },
}));

const VALID_ID = "507f1f77bcf86cd799439011";
const ctx = { params: Promise.resolve({ id: VALID_ID }) };

function post(url: string, body: unknown) {
    return new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    authState.userId = null;
    adminState.admin = null;
});

// ─────────────────────────────────────────────────────────────────────────────

describe("C-1 · /api/problems/[id] requires admin", () => {
    it("PUT is refused for an anonymous caller", async () => {
        const { PUT } = await import("@/app/api/problems/[id]/route");
        const res = await PUT(post(`http://t/api/problems/${VALID_ID}`, { title: "pwned" }), ctx);
        expect(res.status).toBe(403);
    });

    it("DELETE is refused for an anonymous caller", async () => {
        const { DELETE } = await import("@/app/api/problems/[id]/route");
        const res = await DELETE(new Request(`http://t/api/problems/${VALID_ID}`, { method: "DELETE" }), ctx);
        expect(res.status).toBe(403);
    });

    it("DELETE is refused for a signed-in non-admin", async () => {
        authState.userId = "user_normal";
        const { DELETE } = await import("@/app/api/problems/[id]/route");
        const res = await DELETE(new Request(`http://t/api/problems/${VALID_ID}`, { method: "DELETE" }), ctx);
        expect(res.status).toBe(403);
    });

    it("PUT succeeds for an admin", async () => {
        adminState.admin = { userId: "user_admin", isSuperAdmin: false };
        const { PUT } = await import("@/app/api/problems/[id]/route");
        const res = await PUT(post(`http://t/api/problems/${VALID_ID}`, { title: "New Title" }), ctx);
        expect(res.status).toBe(200);
    });

    it("PUT ignores server-owned fields (H-5 mass assignment)", async () => {
        adminState.admin = { userId: "user_admin", isSuperAdmin: false };
        const { Problem } = await import("@/models/Problem");
        const { PUT } = await import("@/app/api/problems/[id]/route");

        await PUT(
            post(`http://t/api/problems/${VALID_ID}`, {
                title: "Legit",
                createdBy: "attacker",
                createdAt: "1970-01-01",
                createdByAI: true,
                _id: "deadbeef",
            }),
            ctx,
        );

        const update = vi.mocked(Problem.findByIdAndUpdate).mock.calls.at(-1)?.[1] as {
            $set: Record<string, unknown>;
        };
        expect(update.$set).toHaveProperty("title", "Legit");
        expect(update.$set).not.toHaveProperty("createdBy");
        expect(update.$set).not.toHaveProperty("createdAt");
        expect(update.$set).not.toHaveProperty("createdByAI");
        expect(update.$set).not.toHaveProperty("_id");
    });
});

describe("M-1 · POST /api/problems requires a session", () => {
    it("is refused for an anonymous caller", async () => {
        const { POST } = await import("@/app/api/problems/route");
        const res = await POST(post("http://t/api/problems", { title: "x" }));
        expect(res.status).toBe(401);
    });
});

describe("C-2 · POST /api/generate requires admin", () => {
    it("is refused for an anonymous caller", async () => {
        const { POST } = await import("@/app/api/generate/route");
        const res = await POST(post("http://t/api/generate", { difficulty: "Easy" }));
        expect(res.status).toBe(403);
    });

    it("is refused for a signed-in non-admin", async () => {
        authState.userId = "user_normal";
        const { POST } = await import("@/app/api/generate/route");
        const res = await POST(post("http://t/api/generate", { difficulty: "Easy" }));
        expect(res.status).toBe(403);
    });
});

describe("C-3 · /api/notes requires a session and is owner-scoped", () => {
    it("GET is refused for an anonymous caller", async () => {
        const { GET } = await import("@/app/api/notes/route");
        const res = await GET(new Request(`http://t/api/notes?problemId=${VALID_ID}`));
        expect(res.status).toBe(401);
    });

    it("PUT is refused for an anonymous caller", async () => {
        const { PUT } = await import("@/app/api/notes/route");
        const res = await PUT(post("http://t/api/notes", { problemId: VALID_ID, problemSlug: "t", content: "x" }));
        expect(res.status).toBe(401);
    });

    it("queries are scoped by the session userId, never the request", async () => {
        authState.userId = "user_alice";
        const { Note } = await import("@/models/Note");
        const { GET } = await import("@/app/api/notes/route");

        await GET(new Request(`http://t/api/notes?problemId=${VALID_ID}&userId=user_bob`));

        const filter = vi.mocked(Note.findOne).mock.calls.at(-1)?.[0] as unknown as Record<
            string,
            unknown
        >;
        expect(filter).toMatchObject({ userId: "user_alice", problemId: VALID_ID });
    });

    it("an upsert cannot claim another user's row", async () => {
        authState.userId = "user_alice";
        const { Note } = await import("@/models/Note");
        const { PUT } = await import("@/app/api/notes/route");

        await PUT(
            post("http://t/api/notes", {
                problemId: VALID_ID,
                problemSlug: "t",
                content: "mine",
                userId: "user_bob", // ignored
            }),
        );

        const [filter, update] = vi.mocked(Note.findOneAndUpdate).mock.calls.at(-1) ?? [];
        expect(filter).toMatchObject({ userId: "user_alice" });
        expect(update).toMatchObject({ userId: "user_alice" });
    });
});

describe("C-4 · POST /api/submissions rejects a client verdict", () => {
    it("is refused for an anonymous caller", async () => {
        const { POST } = await import("@/app/api/submissions/route");
        const res = await POST(post("http://t/api/submissions", { problemId: VALID_ID, code: "%dw 2.0" }));
        expect(res.status).toBe(401);
    });

    it("rejects a body carrying `status`, even from a signed-in user", async () => {
        authState.userId = "user_normal";
        const { POST } = await import("@/app/api/submissions/route");
        const res = await POST(
            post("http://t/api/submissions", {
                problemId: VALID_ID,
                code: "%dw 2.0",
                status: "Accepted",
            }),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/status/i);
    });

    it("awards no coins when a verdict is forged", async () => {
        authState.userId = "user_normal";
        const { awardCoins } = await import("@/lib/coins");
        const { POST } = await import("@/app/api/submissions/route");

        await POST(
            post("http://t/api/submissions", {
                problemId: VALID_ID,
                code: "%dw 2.0",
                status: "Accepted",
            }),
        );

        expect(awardCoins).not.toHaveBeenCalled();
    });
});

describe("C-5 · /api/migrate-guest-progress is disabled", () => {
    it("returns 503 while the feature flag is off", async () => {
        authState.userId = "user_normal";
        const { POST } = await import("@/app/api/migrate-guest-progress/route");
        const res = await POST(post("http://t/api/migrate-guest-progress", { slugs: ["a", "b"] }));
        expect(res.status).toBe(503);
    });

    it("writes no submissions while disabled", async () => {
        authState.userId = "user_normal";
        const { Submission } = await import("@/models/Submission");
        const { POST } = await import("@/app/api/migrate-guest-progress/route");

        await POST(post("http://t/api/migrate-guest-progress", { slugs: ["a", "b", "c"] }));

        expect(Submission.exists).not.toHaveBeenCalled();
    });
});
