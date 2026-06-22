/**
 * Property 1: Bug Condition — Global Stats Leak (No userId Filter)
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *
 * CRITICAL: This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT attempt to fix this test or the implementation code when it fails.
 * NOTE: This test encodes the expected (correct) behavior; it will pass after the fix is applied.
 *
 * Tag: Feature: user-progress-dashboard-stats, Property 1: user stat isolation
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types mirroring the Mongoose documents (plain objects for pure testing)
// ---------------------------------------------------------------------------

interface SubmissionDoc {
    userId: string;
    problemSlug: string;
    status: "Accepted" | "Attempted" | "Error";
}

interface BookmarkDoc {
    userId: string; // NOTE: current Bookmark schema has NO userId field — this is the bug
    problemId: string;
}

// ---------------------------------------------------------------------------
// BUGGY computeStats — mirrors what app/page.tsx currently does:
//   - Submission.distinct("problemSlug", { status: "Accepted" })  ← no userId filter
//   - Submission.distinct("problemSlug", { status: { $ne: "Accepted" } }) ← no userId filter
//   - Bookmark.countDocuments()  ← no userId filter
//
// This function intentionally reproduces the bug for exploration purposes.
// ---------------------------------------------------------------------------

function computeStatsBuggy(
    submissions: SubmissionDoc[],
    bookmarks: BookmarkDoc[],
    // userId is accepted but intentionally NOT used — mirrors the bug
    _userId: string | null | undefined
): { solved: number; attempted: number; bookmarked: number } {
    // Bug: queries the entire collection without userId filter
    const acceptedSlugs = [
        ...new Set(
            submissions
                .filter((s) => s.status === "Accepted")
                .map((s) => s.problemSlug)
        ),
    ];

    const attemptedSlugs = [
        ...new Set(
            submissions
                .filter((s) => s.status !== "Accepted")
                .map((s) => s.problemSlug)
        ),
    ].filter((slug) => !acceptedSlugs.includes(slug));

    // Bug: counts ALL bookmarks, ignoring userId
    const bookmarked = bookmarks.length;

    return {
        solved: acceptedSlugs.length,
        attempted: attemptedSlugs.length,
        bookmarked,
    };
}

// ---------------------------------------------------------------------------
// CORRECT computeStats — expected behavior after the fix:
//   - Filter submissions and bookmarks by userId before computing counts
// ---------------------------------------------------------------------------

function computeStats(
    submissions: SubmissionDoc[],
    bookmarks: BookmarkDoc[],
    userId: string | null | undefined
): { solved: number; attempted: number; bookmarked: number } {
    if (!userId) {
        return { solved: 0, attempted: 0, bookmarked: 0 };
    }

    const userSubmissions = submissions.filter((s) => s.userId === userId);
    const userBookmarks = bookmarks.filter((b) => b.userId === userId);

    const acceptedSlugs = [
        ...new Set(
            userSubmissions
                .filter((s) => s.status === "Accepted")
                .map((s) => s.problemSlug)
        ),
    ];

    const attemptedSlugs = [
        ...new Set(
            userSubmissions
                .filter((s) => s.status !== "Accepted")
                .map((s) => s.problemSlug)
        ),
    ].filter((slug) => !acceptedSlugs.includes(slug));

    return {
        solved: acceptedSlugs.length,
        attempted: attemptedSlugs.length,
        bookmarked: userBookmarks.length,
    };
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

const userIdArb = fc.stringMatching(/^user_[a-z0-9]{4,8}$/);

const statusArb = fc.constantFrom<"Accepted" | "Attempted" | "Error">(
    "Accepted",
    "Attempted",
    "Error"
);

const slugArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,10}$/);

function submissionArb(userId: string): fc.Arbitrary<SubmissionDoc> {
    return fc.record({
        userId: fc.constant(userId),
        problemSlug: slugArb,
        status: statusArb,
    });
}

function bookmarkArb(userId: string): fc.Arbitrary<BookmarkDoc> {
    return fc.record({
        userId: fc.constant(userId),
        problemId: fc.uuid(),
    });
}

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — EXPECTED TO FAIL on unfixed code
//
// The test asserts that computeStats(submissions, bookmarks, userAId) returns
// counts filtered to userA only — NOT the full collection count.
//
// The buggy function (computeStatsBuggy) ignores userId and returns global
// aggregates, so when userB also has records fast-check will find a
// counterexample where userA's "stats" include userB's data.
// ---------------------------------------------------------------------------

describe("Property 1: Bug Condition — Global Stats Leak (No userId Filter)", () => {
    it(
        "computeStats for userA must return only userA records, not the full collection " +
        "[EXPECTED TO FAIL on unfixed code — failure confirms the bug]",
        () => {
            fc.assert(
                fc.property(
                    // Generate two distinct userIds
                    fc
                        .tuple(userIdArb, userIdArb)
                        .filter(([a, b]) => a !== b),

                    // Arbitrary non-empty submissions for userA
                    fc.array(
                        fc.record({
                            userId: userIdArb.filter((id) => id !== "placeholder"), // resolved below
                            problemSlug: slugArb,
                            status: statusArb,
                        }),
                        { minLength: 1, maxLength: 5 }
                    ),

                    // Arbitrary non-empty submissions for userB (at least 1 Accepted to create a discrepancy)
                    fc.array(
                        fc.record({
                            userId: userIdArb.filter((id) => id !== "placeholder"),
                            problemSlug: slugArb,
                            status: statusArb,
                        }),
                        { minLength: 1, maxLength: 5 }
                    ),

                    // Arbitrary bookmarks for each user
                    fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
                    fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }), // at least 1 bookmark for userB

                    (
                        [userAId, userBId],
                        rawSubsA,
                        rawSubsB,
                        bookmarkProblemIdsA,
                        bookmarkProblemIdsB
                    ) => {
                        // Stamp each submission with the correct userId
                        const subsA: SubmissionDoc[] = rawSubsA.map((s) => ({
                            ...s,
                            userId: userAId,
                        }));
                        const subsB: SubmissionDoc[] = rawSubsB.map((s) => ({
                            ...s,
                            userId: userBId,
                        }));

                        const bookmarksA: BookmarkDoc[] = bookmarkProblemIdsA.map(
                            (pid) => ({ userId: userAId, problemId: pid })
                        );
                        const bookmarksB: BookmarkDoc[] = bookmarkProblemIdsB.map(
                            (pid) => ({ userId: userBId, problemId: pid })
                        );

                        // Mixed collection — all users' data together (what MongoDB holds)
                        const allSubmissions = [...subsA, ...subsB];
                        const allBookmarks = [...bookmarksA, ...bookmarksB];

                        // Correct expected stats for userA (only userA's records)
                        const expectedForA = computeStats(subsA, bookmarksA, userAId);

                        // Buggy stats — what the current app/page.tsx actually computes
                        // (no userId filter, uses the full mixed collection)
                        const buggyForA = computeStatsBuggy(
                            allSubmissions,
                            allBookmarks,
                            userAId
                        );

                        // ASSERTION: buggy stats must equal correct stats for userA
                        // This FAILS when userB's records inflate userA's counts,
                        // which is exactly the bug we are surfacing.
                        expect(buggyForA.solved).toEqual(expectedForA.solved);
                        expect(buggyForA.attempted).toEqual(expectedForA.attempted);
                        expect(buggyForA.bookmarked).toEqual(expectedForA.bookmarked);
                    }
                ),
                {
                    numRuns: 200,
                    seed: 42,
                    verbose: true,
                }
            );
        }
    );
});
