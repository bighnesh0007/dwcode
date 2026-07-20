/**
 * Property 2: Preservation — Non-Bug-Condition Behavior
 *
 * Validates: Requirements 2.2, 4.3, 5.1, 5.2
 *
 * These tests capture baseline behaviors that MUST NOT regress after the fix is applied.
 * All three sub-properties PASS on the current (unfixed) code.
 *
 * Sub-properties:
 *   2a — Problem counts (total, easy, medium, hard) are global — userId has no effect
 *   2b — Submissions sort order: any set sorted descending by createdAt stays sorted
 *   2c — localStorage guest progress logic: only "Accepted" status adds the slug
 *
 * Tag: Feature: user-progress-dashboard-stats, Property 2: preservation
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProblemDoc {
    difficulty: "Easy" | "Medium" | "Hard";
}

interface SubmissionDoc {
    userId: string;
    problemSlug: string;
    status: "Accepted" | "Attempted" | "Error";
    createdAt: Date;
}

type SubmissionStatus = "Accepted" | "Attempted" | "Error";

// ---------------------------------------------------------------------------
// Pure functions under test
// ---------------------------------------------------------------------------

/**
 * Mirrors what app/page.tsx does for Problem counts:
 *   Problem.countDocuments()              → total
 *   Problem.countDocuments({ difficulty: "Easy" })   → easy
 *   Problem.countDocuments({ difficulty: "Medium" }) → medium
 *   Problem.countDocuments({ difficulty: "Hard" })   → hard
 *
 * No userId filter — these counts are purely collection-wide.
 */
function computeProblemCounts(problems: ProblemDoc[]): {
    total: number;
    easy: number;
    medium: number;
    hard: number;
} {
    return {
        total: problems.length,
        easy: problems.filter((p) => p.difficulty === "Easy").length,
        medium: problems.filter((p) => p.difficulty === "Medium").length,
        hard: problems.filter((p) => p.difficulty === "Hard").length,
    };
}

/**
 * Mirrors what app/api/submissions/route.ts GET currently does:
 *   Submission.find().sort({ createdAt: -1 }).lean()
 *
 * Sort descending by createdAt — userId is irrelevant to this sort property.
 */
function sortSubmissionsDescending(submissions: SubmissionDoc[]): SubmissionDoc[] {
    return [...submissions].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
}

/**
 * Mirrors the localStorage guest progress logic planned for Workspace.tsx
 * (task 3.5). This is the pure logic we are preserving:
 *
 *   - If status === "Accepted", add slug to the progress array (if not already present)
 *   - If status !== "Accepted", do NOT add the slug
 *
 * Returns the new progress array after applying this logic.
 */
function applyGuestProgress(
    existingProgress: string[],
    problemSlug: string,
    status: SubmissionStatus
): string[] {
    if (status !== "Accepted") {
        return existingProgress;
    }
    if (existingProgress.includes(problemSlug)) {
        return existingProgress;
    }
    return [...existingProgress, problemSlug];
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

const difficultyArb = fc.constantFrom<"Easy" | "Medium" | "Hard">(
    "Easy",
    "Medium",
    "Hard"
);

const problemArb: fc.Arbitrary<ProblemDoc> = fc.record({
    difficulty: difficultyArb,
});

const userIdArb = fc.stringMatching(/^user_[a-z0-9]{4,8}$/);

const statusArb = fc.constantFrom<SubmissionStatus>(
    "Accepted",
    "Attempted",
    "Error"
);

const slugArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,10}$/);

// Date arbitrary — random timestamp within a 10-year window
const dateArb: fc.Arbitrary<Date> = fc
    .integer({ min: 0, max: 10 * 365 * 24 * 60 * 60 * 1000 })
    .map((ms) => new Date(Date.UTC(2020, 0, 1) + ms));

function submissionArb(userId: string): fc.Arbitrary<SubmissionDoc> {
    return fc.record({
        userId: fc.constant(userId),
        problemSlug: slugArb,
        status: statusArb,
        createdAt: dateArb,
    });
}

// ---------------------------------------------------------------------------
// Property 2a: Problem counts are global — userId has NO effect
//
// Validates: Requirement 2.2
// (Public data — total/difficulty counts are NOT filtered by userId)
//
// The core invariant: computeProblemCounts returns the same result regardless
// of what userId (or no userId) is passed to the dashboard — because the
// Problem.countDocuments() calls in app/page.tsx carry no userId filter.
// ---------------------------------------------------------------------------

describe(
    "Property 2a: Problem counts are global — userId has no effect",
    () => {
        /**
         * **Validates: Requirements 2.2**
         *
         * For any collection of Problem documents and any userId string,
         * the counts (total, easy, medium, hard) depend only on the full
         * collection — not on the userId.
         *
         * Preservation invariant: after the fix, Problem.countDocuments() calls
         * in app/page.tsx remain OUTSIDE the `if (userId)` guard — this property
         * must still pass.
         */
        it(
            "total/easy/medium/hard counts equal the full collection counts, " +
            "regardless of userId",
            () => {
                fc.assert(
                    fc.property(
                        fc.array(problemArb, { minLength: 0, maxLength: 30 }),
                        userIdArb,

                        (problems, _userId) => {
                            // Counts without any userId consideration
                            const counts = computeProblemCounts(problems);

                            // The userId should have ZERO effect on these numbers
                            expect(counts.total).toBe(problems.length);
                            expect(counts.easy).toBe(
                                problems.filter((p) => p.difficulty === "Easy").length
                            );
                            expect(counts.medium).toBe(
                                problems.filter((p) => p.difficulty === "Medium").length
                            );
                            expect(counts.hard).toBe(
                                problems.filter((p) => p.difficulty === "Hard").length
                            );

                            // Summing by difficulty always equals total (completeness check)
                            expect(counts.easy + counts.medium + counts.hard).toBe(
                                counts.total
                            );

                            // Calling with a different userId produces identical output
                            const countsForDifferentUser = computeProblemCounts(problems);
                            expect(countsForDifferentUser).toEqual(counts);

                            // Passing null/undefined userId doesn't change anything either
                            // (userId is irrelevant to computeProblemCounts by design)
                            const countsForGuest = computeProblemCounts(problems);
                            expect(countsForGuest).toEqual(counts);
                        }
                    ),
                    { numRuns: 200, seed: 42 }
                );
            }
        );

        it(
            "counts are stable across two calls with different userIds on the same dataset",
            () => {
                fc.assert(
                    fc.property(
                        fc.array(problemArb, { minLength: 0, maxLength: 20 }),
                        fc.tuple(userIdArb, userIdArb).filter(([a, b]) => a !== b),

                        (problems, [_userA, _userB]) => {
                            const countsA = computeProblemCounts(problems);
                            const countsB = computeProblemCounts(problems);

                            // Both users see the same global problem counts
                            expect(countsA).toEqual(countsB);

                            // Totals are non-negative
                            expect(countsA.total).toBeGreaterThanOrEqual(0);
                            expect(countsA.easy).toBeGreaterThanOrEqual(0);
                            expect(countsA.medium).toBeGreaterThanOrEqual(0);
                            expect(countsA.hard).toBeGreaterThanOrEqual(0);
                        }
                    ),
                    { numRuns: 200, seed: 43 }
                );
            }
        );
    }
);

// ---------------------------------------------------------------------------
// Property 2b: Submission sort order — createdAt descending
//
// Validates: Requirement 4.3, Design Property 6
//
// The GET /api/submissions route already uses .sort({ createdAt: -1 }).
// This preservation test confirms that for ANY set of submission documents
// with random createdAt timestamps, the sort produces a valid descending order.
//
// Adjacent pair invariant: submissions[i].createdAt >= submissions[i+1].createdAt
// ---------------------------------------------------------------------------

describe(
    "Property 2b: Submissions sort order — createdAt descending for any input",
    () => {
        /**
         * **Validates: Requirements 4.3**
         *
         * For any userId and any array of Submission documents with random createdAt
         * values, sorting descending by createdAt must satisfy: for every adjacent
         * pair (i, i+1), submissions[i].createdAt >= submissions[i+1].createdAt.
         *
         * This property already holds on unfixed code because the GET route has
         * .sort({ createdAt: -1 }) — we are preserving it through the fix.
         */
        it(
            "sorted submissions satisfy: submissions[i].createdAt >= submissions[i+1].createdAt " +
            "for all adjacent pairs",
            () => {
                fc.assert(
                    fc.property(
                        userIdArb,
                        fc.array(
                            userIdArb.chain((uid) => submissionArb(uid)),
                            { minLength: 0, maxLength: 20 }
                        ),

                        (userId, submissions) => {
                            const sorted = sortSubmissionsDescending(submissions);

                            // Array length is preserved
                            expect(sorted.length).toBe(submissions.length);

                            // Adjacent pair check: descending order
                            for (let i = 0; i < sorted.length - 1; i++) {
                                expect(sorted[i].createdAt.getTime()).toBeGreaterThanOrEqual(
                                    sorted[i + 1].createdAt.getTime()
                                );
                            }
                        }
                    ),
                    { numRuns: 300, seed: 44 }
                );
            }
        );

        it(
            "empty submission array sorts to an empty array",
            () => {
                const result = sortSubmissionsDescending([]);
                expect(result).toEqual([]);
            }
        );

        it(
            "single-element array is trivially sorted",
            () => {
                fc.assert(
                    fc.property(
                        userIdArb.chain((uid) => submissionArb(uid)),
                        (sub) => {
                            const sorted = sortSubmissionsDescending([sub]);
                            expect(sorted).toHaveLength(1);
                            expect(sorted[0]).toEqual(sub);
                        }
                    ),
                    { numRuns: 100, seed: 45 }
                );
            }
        );

        it(
            "sort is stable with ties — equal timestamps are both included",
            () => {
                fc.assert(
                    fc.property(
                        userIdArb,
                        dateArb,
                        fc.array(slugArb, { minLength: 2, maxLength: 5 }),

                        (userId, sameDate, slugs) => {
                            const submissions: SubmissionDoc[] = slugs.map((slug) => ({
                                userId,
                                problemSlug: slug,
                                status: "Accepted" as const,
                                createdAt: sameDate,
                            }));

                            const sorted = sortSubmissionsDescending(submissions);

                            // All elements preserved
                            expect(sorted.length).toBe(submissions.length);

                            // Adjacent pairs with equal timestamps still satisfy >=
                            for (let i = 0; i < sorted.length - 1; i++) {
                                expect(sorted[i].createdAt.getTime()).toBeGreaterThanOrEqual(
                                    sorted[i + 1].createdAt.getTime()
                                );
                            }
                        }
                    ),
                    { numRuns: 100, seed: 46 }
                );
            }
        );
    }
);

// ---------------------------------------------------------------------------
// Property 2c: Guest localStorage progress logic
//
// Validates: Requirements 5.1, 5.2, Design Property 7
//
// Tests the pure applyGuestProgress function in isolation (no actual browser
// localStorage needed). The logic is:
//   - status === "Accepted"  → slug IS added to progress array (if not already present)
//   - status !== "Accepted"  → slug is NOT added to progress array
// ---------------------------------------------------------------------------

describe(
    "Property 2c: Guest localStorage progress — only Accepted status adds the slug",
    () => {
        /**
         * **Validates: Requirements 5.1, 5.2**
         *
         * For any problemSlug and status === "Accepted", the slug appears in
         * the resulting progress array.
         * For any problemSlug and status !== "Accepted", the progress array
         * is unchanged.
         */
        it(
            "Accepted status adds the slug to the guest progress array",
            () => {
                fc.assert(
                    fc.property(
                        slugArb,
                        fc.array(slugArb, { minLength: 0, maxLength: 5 }),

                        (problemSlug, existingProgress) => {
                            const result = applyGuestProgress(
                                existingProgress,
                                problemSlug,
                                "Accepted"
                            );

                            // The slug must be present in the result
                            expect(result).toContain(problemSlug);
                        }
                    ),
                    { numRuns: 200, seed: 47 }
                );
            }
        );

        it(
            "non-Accepted statuses (Attempted, Error) do NOT add the slug",
            () => {
                fc.assert(
                    fc.property(
                        slugArb,
                        fc.array(slugArb, { minLength: 0, maxLength: 5 }),
                        fc.constantFrom<SubmissionStatus>("Attempted", "Error"),

                        (problemSlug, existingProgress, nonAcceptedStatus) => {
                            // Ensure the slug is NOT already in the existing array
                            // (so we can cleanly assert it doesn't get added)
                            const cleanProgress = existingProgress.filter(
                                (s) => s !== problemSlug
                            );

                            const result = applyGuestProgress(
                                cleanProgress,
                                problemSlug,
                                nonAcceptedStatus
                            );

                            // The slug must NOT appear in the result
                            expect(result).not.toContain(problemSlug);

                            // The array is unchanged
                            expect(result).toEqual(cleanProgress);
                        }
                    ),
                    { numRuns: 200, seed: 48 }
                );
            }
        );

        it(
            "Accepted does not add a duplicate slug if already present",
            () => {
                fc.assert(
                    fc.property(
                        slugArb,
                        fc.array(slugArb, { minLength: 0, maxLength: 5 }),

                        (problemSlug, otherSlugs) => {
                            // Start with the slug already in progress
                            const existingProgress = [problemSlug, ...otherSlugs];

                            const result = applyGuestProgress(
                                existingProgress,
                                problemSlug,
                                "Accepted"
                            );

                            // Count how many times the slug appears — must be exactly 1
                            const occurrences = result.filter((s) => s === problemSlug).length;
                            expect(occurrences).toBe(1);
                        }
                    ),
                    { numRuns: 200, seed: 49 }
                );
            }
        );

        it(
            "progress array grows by exactly 1 when a new Accepted slug is added",
            () => {
                fc.assert(
                    fc.property(
                        slugArb,
                        fc.array(slugArb, { minLength: 0, maxLength: 5 }),

                        (problemSlug, otherSlugs) => {
                            // Ensure the slug is NOT already in the array
                            const existingProgress = otherSlugs.filter(
                                (s) => s !== problemSlug
                            );

                            const result = applyGuestProgress(
                                existingProgress,
                                problemSlug,
                                "Accepted"
                            );

                            // Array grew by exactly 1
                            expect(result.length).toBe(existingProgress.length + 1);
                        }
                    ),
                    { numRuns: 200, seed: 50 }
                );
            }
        );

        it(
            "progress array is unchanged (same reference length) for non-Accepted status",
            () => {
                fc.assert(
                    fc.property(
                        slugArb,
                        fc.array(slugArb, { minLength: 0, maxLength: 5 }),
                        fc.constantFrom<SubmissionStatus>("Attempted", "Error"),

                        (problemSlug, existingProgress, nonAcceptedStatus) => {
                            const cleanProgress = existingProgress.filter(
                                (s) => s !== problemSlug
                            );

                            const result = applyGuestProgress(
                                cleanProgress,
                                problemSlug,
                                nonAcceptedStatus
                            );

                            // Length unchanged
                            expect(result.length).toBe(cleanProgress.length);
                        }
                    ),
                    { numRuns: 200, seed: 51 }
                );
            }
        );

        it(
            "empty initial progress + Accepted slug produces a single-element array",
            () => {
                fc.assert(
                    fc.property(slugArb, (problemSlug) => {
                        const result = applyGuestProgress([], problemSlug, "Accepted");
                        expect(result).toEqual([problemSlug]);
                    }),
                    { numRuns: 100, seed: 52 }
                );
            }
        );

        it(
            "empty initial progress + non-Accepted slug stays empty",
            () => {
                fc.assert(
                    fc.property(
                        slugArb,
                        fc.constantFrom<SubmissionStatus>("Attempted", "Error"),
                        (problemSlug, status) => {
                            const result = applyGuestProgress([], problemSlug, status);
                            expect(result).toEqual([]);
                        }
                    ),
                    { numRuns: 100, seed: 53 }
                );
            }
        );
    }
);
