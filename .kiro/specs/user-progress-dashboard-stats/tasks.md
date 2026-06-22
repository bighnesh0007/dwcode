# Implementation Plan

## Overview

This task list implements the fix for the user-progress-dashboard-stats bug using the exploratory bugfix workflow:

1. **Explore** — Write a property-based test (Property 1: Bug Condition) on unfixed code to confirm the bug exists and understand root cause.
2. **Preserve** — Write preservation property-based tests (Property 2: Preservation) on unfixed code to capture baseline behavior that must not regress.
3. **Implement** — Apply the fix across 7 files (Bookmark model, bookmarks route, submissions route, dashboard page, Workspace, migration endpoint, GuestMigration component).
4. **Validate** — Re-run exploration and preservation tests, then cover all 8 correctness properties from the design document.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1", "3.3", "3.5", "3.6"] },
    { "wave": 3, "tasks": ["3.2", "3.7"] },
    { "wave": 4, "tasks": ["3.4"] },
    { "wave": 5, "tasks": ["3.8", "3.9"] },
    { "wave": 6, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "wave": 7, "tasks": ["5"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Global Stats Leak (No userId Filter)
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that stat queries return global aggregates instead of per-user counts
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — seed two distinct users' Submission/Bookmark documents, call `computeStats` without a userId filter, and assert that userA's count ≠ total collection count
  - Bug Condition (isBugCondition): any of the following conditions holds —
    - `app/page.tsx` calls `Submission.distinct()` / `Bookmark.countDocuments()` without a `{ userId }` filter
    - `GET /api/bookmarks` returns documents that do not belong to the requesting user
    - `GET /api/submissions` returns documents that do not belong to the requesting user
    - `Bookmark` schema has no `userId` field (making per-user scoping structurally impossible)
  - Write a fast-check property with two arbitrary distinct userIds + arbitrary Submission/Bookmark arrays mixed across both users
  - Assert that stats computed for `userA` equal only `userA`'s records — not the full collection count (isBugCondition: stats for userA include userB's records)
  - Expected behavior (from design Property 1): `computeStats(submissions, bookmarks, userId)` returns counts filtered to `userId` only
  - Run the property on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS — fast-check finds a counterexample where userA sees userB's data
  - Document the counterexample (e.g., "userA solved=3 but collection has 5 Accepted submissions across both users — solved returns 5")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Bug-Condition Behavior (Public Stats and Sort Order)
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code with non-buggy inputs first
  - Observe and record: `Problem.countDocuments()` for total/easy/medium/hard are NOT filtered by userId and must remain unaffected by the fix
  - Observe and record: `GET /api/submissions` sort order is `createdAt` descending on unfixed code
  - Observe and record: `POST /api/submissions` correctly saves with userId when authenticated — this path is already correct and must not regress
  - Write property-based tests capturing these observed patterns:
    - **Preservation 2a**: For any set of Problems, `total`, `easy`, `medium`, `hard` counts are always the full collection counts regardless of userId
    - **Preservation 2b**: For any userId and arbitrary Submission documents with random `createdAt` values, the array returned is sorted `createdAt` descending (validates Property 6 from design)
    - **Preservation 2c**: For any `problemSlug` string with `status = "Accepted"`, after a guest submission the slug appears in `localStorage["dwcode_guest_progress"]`; non-Accepted statuses do NOT add the slug (validates Property 7 from design)
  - Non-bug condition (¬C(X)): total/difficulty problem counts have no userId dependency; submission POST path already correct; sort order already correct
  - Run all preservation tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS — confirms baseline behavior to preserve after the fix
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 2.2, 4.3, 5.1, 5.2_

- [ ] 3. Fix: user-scoped dashboard stats, bookmarks, submissions, and guest migration

  - [ ] 3.1 Update `models/Bookmark.ts` — add `userId` field and compound unique index
    - Remove `unique: true` from the `problemId` field definition
    - Add `userId: { type: String, default: '' }` to the schema
    - Add `BookmarkSchema.index({ problemId: 1, userId: 1 }, { unique: true })` after schema definition
    - This makes per-user scoping structurally possible (fixes root cause 2 from design)
    - _Bug_Condition: `Bookmark` schema lacks `userId` → `findOne({ problemId })` is always global_
    - _Expected_Behavior: compound index `{ problemId, userId }` enforces per-user uniqueness; same problemId with different userId succeeds (Property 4 from design)_
    - _Preservation: existing Bookmark documents with `userId = ""` remain intact; no data migration needed_
    - _Requirements: 3.1, 3.2_

  - [x] 3.2 Update `app/api/bookmarks/route.ts` — scope GET and POST by authenticated userId
    - Add `import { auth } from "@clerk/nextjs/server";`
    - `GET`: call `const { userId } = await auth()` — return `NextResponse.json([])` if no userId; otherwise `Bookmark.find({ userId }).lean()`
    - `POST`: call `const { userId } = await auth()` — return `401` if no userId; use `{ problemId, userId }` for `findOne` lookup and new document creation
    - _Bug_Condition: GET returns all bookmarks; POST toggles by `problemId` only with no auth_
    - _Expected_Behavior: GET returns only the calling user's bookmarks; POST requires auth and scopes by userId (Properties 4, 5 from design)_
    - _Preservation: toggle semantics (bookmark / unbookmark) remain unchanged; HTTP 200 success shape unchanged_
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [x] 3.3 Update `app/api/submissions/route.ts` — scope GET by authenticated userId
    - `auth` is already imported at the top of this file
    - `GET`: add `const { userId } = await auth()` — return `NextResponse.json([])` if no userId; otherwise `Submission.find({ userId }).sort({ createdAt: -1 }).lean()`
    - Leave the `POST` handler entirely unchanged
    - _Bug_Condition: GET runs `Submission.find()` without any userId filter → returns all submissions_
    - _Expected_Behavior: GET returns only submissions where `submission.userId === authenticatedUserId`; guests receive `[]` (Properties 5, 6 from design)_
    - _Preservation: POST handler, coin awards, and sort order logic unchanged_
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 3.4 Update `app/page.tsx` — call `auth()` and gate user-scoped queries
    - Add `import { auth } from "@clerk/nextjs/server";` to imports
    - At the top of `Home()`, add `const { userId } = await auth();`
    - Wrap all `Submission.distinct()`, `Bookmark.countDocuments()`, and `Bookmark.find()` calls inside `if (userId) { ... }`
    - Keep `Problem.countDocuments()` calls outside the guard (they are public/global)
    - Keep `Problem.find().sort({ createdAt: -1 }).limit(4)` outside the guard (Recent Problems is public)
    - Render `{userId && <GuestMigration userId={userId} />}` inside the returned JSX (requires task 3.7)
    - _Bug_Condition: no `auth()` call → all stat queries run without userId filter_
    - _Expected_Behavior: authenticated users see their own stats; guests see `0` for solved/attempted/bookmarked (Properties 1, 2, 3 from design)_
    - _Preservation: Total Problems count, Recent Problems list, and all non-stat UI unchanged_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.5 Update `app/problems/[slug]/Workspace.tsx` — persist accepted solves to localStorage for guests
    - Inside `handleSubmit`, after `await fetch("/api/submissions", ...)` saves the submission and before the history refresh, add a `localStorage` write block
    - If `finalStatus === "Accepted"`, read `localStorage.getItem("dwcode_guest_progress")`, parse as JSON array, push `problem.slug` if not already present, and write back with `localStorage.setItem`
    - Wrap all `localStorage` calls in a `try/catch` block that fails silently (private mode / SSR guard)
    - Only `"Accepted"` status adds to the array — `"Attempted"` and `"Error"` do not
    - _Bug_Condition: guest accepted solves are never persisted → migration cannot transfer them_
    - _Expected_Behavior: accepted slugs accumulate in `localStorage["dwcode_guest_progress"]`; non-accepted statuses do not add slugs (Property 7 from design)_
    - _Preservation: all existing Workspace behavior (run, submit flow, timer, bookmarks, notes, solution guard) unchanged_
    - _Requirements: 5.1, 5.2_

  - [x] 3.6 Create `app/api/migrate-guest-progress/route.ts` — migration endpoint
    - New file; no existing route to modify
    - `POST` handler: call `auth()` → return 401 if no userId; parse `{ slugs: string[] }` from request body; validate it is a non-empty array (return `{ migrated: 0 }` if empty); for each slug, check `Submission.exists({ userId, problemSlug: slug, status: "Accepted" })` and skip if truthy; look up `Problem.findOne({ slug })` for `_id` and skip slug if not found; create `Submission` with `status: "Accepted"`, `userId`, `userName: "Migrated"`, `code: "// migrated from guest session"`, `input: "{}"`, `output: ""`, `executionTime: "0ms"`; return `{ migrated: count }`
    - _Bug_Condition: endpoint does not exist → guest progress cannot be migrated_
    - _Expected_Behavior: each slug produces exactly one Accepted Submission per userId; calling endpoint twice with same inputs is idempotent (Property 8 from design)_
    - _Preservation: existing Submission records untouched; coin awards are NOT triggered for migrated records_
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

  - [x] 3.7 Create `components/GuestMigration.tsx` — zero-UI client component
    - New file; `"use client"` directive at top
    - `GuestMigration({ userId }: { userId: string })` — named export
    - `useEffect` on `[userId]`: read `localStorage.getItem("dwcode_guest_progress")`; return early if null; parse as JSON array; if not a valid non-empty array, call `localStorage.removeItem("dwcode_guest_progress")` and return; POST `{ slugs }` to `/api/migrate-guest-progress`; on `.then()` success, call `localStorage.removeItem("dwcode_guest_progress")`; on `.catch()`, leave localStorage intact for next attempt; all operations are fire-and-forget
    - Return `null` — no rendered UI
    - _Bug_Condition: component does not exist → migration logic has no trigger point_
    - _Expected_Behavior: on first authenticated dashboard load, guest slugs migrate silently; localStorage is cleared after success (Properties 7, 8 from design)_
    - _Preservation: component renders null — zero visual impact on dashboard_
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_

  - [~] 3.8 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - User Stat Isolation (No Cross-User Leakage)
    - **IMPORTANT**: Re-run the SAME property-based test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior: `computeStats(submissions, bookmarks, userId)` returns only that user's counts
    - Run against the fixed code (tasks 3.1–3.4 applied)
    - **EXPECTED OUTCOME**: Test PASSES — fast-check finds no counterexample; userA's stats contain only userA's records
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [~] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Public Stats, Sort Order, Guest localStorage
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation properties 2a (global problem counts), 2b (submissions sort order), and 2c (localStorage persistence) against the fixed code
    - **EXPECTED OUTCOME**: All tests PASS — no regressions on public data or existing correct behavior
    - Confirm all preservation tests pass after the fix

- [ ] 4. Write remaining property-based tests (Properties 2–8 from design)
  - These tests validate correctness properties not covered by the exploration/preservation tests above
  - Use **fast-check** with minimum 100 iterations per property; use `mongodb-memory-server` for DB-touching properties

  - [~] 4.1 Property 2 — Zero state
    - **Property 2: Zero State** - Users With No Data Always See Zero Stats
    - Generate arbitrary userId strings; assert `computeStats([], [], userId)` returns `{ solved: 0, attempted: 0, bookmarked: 0 }`
    - _Requirements: 1.5, 2.1_

  - [~] 4.2 Property 3 — Guest isolation
    - **Property 3: Guest Isolation** - Null/Undefined userId Always Returns Zero Stats
    - Generate arbitrary Submission/Bookmark arrays; assert `computeStats(submissions, bookmarks, null)` and `computeStats(submissions, bookmarks, undefined)` both return all zeros
    - _Requirements: 2.1, 2.5_

  - [~] 4.3 Property 4 — Bookmark compound uniqueness
    - **Property 4: Bookmark Compound Uniqueness** - Same userId+problemId Rejected; Different userId Accepted
    - Generate arbitrary `userId` + `problemId` pairs using mongodb-memory-server; assert inserting two Bookmarks with the same pair throws a duplicate key error; assert inserting with same `problemId` but different `userId` succeeds
    - _Requirements: 3.1, 3.2_

  - [~] 4.4 Property 5 — API response isolation
    - **Property 5: API Response Isolation** - Route Handlers Return Only Requesting User's Data
    - Seed arbitrary multi-user Bookmark/Submission documents into an in-memory MongoDB; call the route handler logic directly; assert every returned item has `userId === targetUserId`
    - _Requirements: 3.5, 4.1_

  - [~] 4.5 Property 6 — Submissions sort order
    - **Property 6: Submissions Sort Order** - createdAt Descending for Any Input Set
    - Generate arbitrary Submission arrays with random `createdAt` values for a given userId; assert adjacent pairs satisfy `submissions[i].createdAt >= submissions[i+1].createdAt`
    - _Requirements: 4.3_

  - [~] 4.6 Property 8 — Migration idempotency
    - **Property 8: Migration Idempotency** - Running Migration Twice Produces Exactly One Accepted Submission Per Slug
    - Generate arbitrary userId + arbitrary slug arrays (including overlap with pre-existing Accepted submissions); run migration once then again with the same inputs; assert total Accepted Submission count per slug per userId equals exactly 1 after both runs
    - _Requirements: 5.4, 5.5, 5.6_

- [~] 5. Checkpoint — Ensure all tests pass
  - Run the full test suite: all 8 properties (tasks 1, 2, 4.1–4.6) plus any unit/integration tests
  - Confirm the bug condition exploration test (task 1 / 3.8) passes on fixed code
  - Confirm all preservation tests (task 2 / 3.9) still pass
  - Confirm Properties 2–8 (tasks 4.1–4.6) all pass
  - Verify no TypeScript errors in the 7 modified/created files: `models/Bookmark.ts`, `app/api/bookmarks/route.ts`, `app/api/submissions/route.ts`, `app/page.tsx`, `app/problems/[slug]/Workspace.tsx`, `app/api/migrate-guest-progress/route.ts`, `components/GuestMigration.tsx`
  - Ask the user if any questions arise before closing the spec

## Notes

- All property-based tests use **fast-check** (TypeScript PBT library) with a minimum of 100 iterations per property.
- DB-touching properties (4, 5, 8) use `mongodb-memory-server` for isolation.
- Tasks 1 and 2 are intentionally placed before task 3 — exploration and preservation tests must be written and run on **unfixed** code.
- Tasks 3.1 and 3.2 are ordered because the Bookmark route depends on the updated Bookmark model having the `userId` field.
- Task 3.4 (`app/page.tsx`) depends on task 3.7 (`GuestMigration.tsx`) to compile without errors — either create 3.7 first or add the GuestMigration import/render as a final step within 3.4.
- Old Bookmark documents (userId = "") become invisible to all users after the fix — no data migration needed.
- Old Submission documents (userId = "") become invisible to authenticated users — no data migration needed.
- The migration endpoint intentionally does not trigger coin awards to avoid inflating balances with migrated historical data.
