# Requirements: User Progress & Dashboard Statistics Bug Fix

## Introduction

The DWCode dashboard currently displays global aggregate statistics — total solved problems, attempted problems, and bookmarks — without filtering by the authenticated user. This means every user (including guests) sees the same shared counts, which belong to the entire platform rather than the individual. Additionally, the Bookmarks model has no `userId` field, so bookmarks are completely global. This document defines the requirements for making all dashboard statistics and related data fully user-scoped.

### Bug Condition

The bug is active when:
- A user visits the dashboard and the `Submission.distinct()` and `Bookmark.countDocuments()` queries in `app/page.tsx` run without a `userId` filter.
- The `Bookmark` model stores no `userId`, so bookmarks cannot be scoped per user.
- The `/api/submissions` GET route returns all submissions with no `userId` filter.
- The `/api/bookmarks` GET and POST routes store and retrieve bookmarks with no `userId`.

The bug is fixed when:
- All dashboard statistics are derived only from data belonging to the currently authenticated user.
- Unauthenticated users always see zeroed-out stats.
- Bookmarks are scoped to users via a `userId` field on the model.
- API routes filter data by the authenticated user's Clerk `userId`.

---

## Glossary

| Term | Definition |
|---|---|
| **userId** | The unique Clerk user ID string (e.g. `user_2abc...`) attached to authenticated sessions |
| **Guest user** | A visitor who has not signed in — no Clerk `userId` available |
| **Dashboard stats** | The four metric cards on the home page: Total Problems, Solved, Attempted, Bookmarked |
| **Solved** | Count of distinct `problemSlug` values where `status = "Accepted"` for the current user |
| **Attempted** | Count of distinct `problemSlug` values where the user has a non-Accepted submission but no Accepted one |
| **Bookmarked** | Count of Bookmark documents belonging to the current user |
| **Guest progress migration** | The transfer of locally-stored guest solve data into the authenticated user's account upon sign-in |

---

## Requirements

### Requirement 1: Dashboard Shows Only the Authenticated User's Stats

**User Story:** As a logged-in user, I want the dashboard to show only my own statistics, so that I never see another user's progress.

#### Acceptance Criteria

1. WHEN an authenticated user loads the dashboard, THEN the "Solved" count SHALL equal the number of distinct `problemSlug` values with `status = "Accepted"` in the `Submission` collection filtered by that user's `userId`.
2. WHEN an authenticated user loads the dashboard, THEN the "Attempted" count SHALL equal the number of distinct `problemSlug` values that have at least one non-Accepted submission but no Accepted submission for that user's `userId`.
3. WHEN an authenticated user loads the dashboard, THEN the "Bookmarked" count SHALL equal the number of `Bookmark` documents where `userId` matches the authenticated user's `userId`.
4. WHEN an authenticated user loads the dashboard, THEN "Recent Problems" and "Bookmarked for Revision" sections SHALL only reflect data associated with that user's `userId`.
5. IF the authenticated user has made zero submissions, THEN all stat counts SHALL display as `0`.

---

### Requirement 2: Guest Users See Zeroed-Out Stats

**User Story:** As a first-time visitor who is not logged in, I want to see empty/zero statistics, so that I don't see another user's progress on the dashboard.

#### Acceptance Criteria

1. WHEN a guest (unauthenticated) user loads the dashboard, THEN "Solved", "Attempted", and "Bookmarked" SHALL all display as `0`.
2. WHEN a guest user loads the dashboard, THEN the "Recent Problems" card SHALL still display the most recently added problems (public data), but SHALL NOT show any user-specific solved/bookmarked state.
3. WHEN a guest user loads the dashboard, THEN the "Bookmarked for Revision" card SHALL display an empty state (no bookmarks).
4. The dashboard server component SHALL call `auth()` from `@clerk/nextjs/server` to retrieve the `userId` before running any stat queries.
5. IF `userId` is null or undefined, THEN all stat queries SHALL be skipped and default values of `0` SHALL be used.

---

### Requirement 3: Bookmark Model Is User-Scoped

**User Story:** As a logged-in user, I want my bookmarks to be tied to my account, so that I only see the problems I personally bookmarked.

#### Acceptance Criteria

1. THE `Bookmark` Mongoose schema SHALL include a `userId` field of type `String` with a default of `""`.
2. THE `Bookmark` schema SHALL enforce a compound unique index on `{ problemId, userId }` so that the same user cannot bookmark the same problem twice, but different users can each bookmark the same problem.
3. WHEN the `POST /api/bookmarks` route toggles a bookmark, it SHALL use `auth()` to get the authenticated `userId` and include it in the `findOne` query and the new document.
4. IF no authenticated `userId` is available on a bookmark POST, THEN the route SHALL return a `401 Unauthorized` response.
5. WHEN the `GET /api/bookmarks` route is called, it SHALL return only the bookmarks where `userId` matches the authenticated user's `userId`.
6. IF no authenticated `userId` is available on a bookmark GET, THEN the route SHALL return an empty array `[]`.

---

### Requirement 4: Submissions API Is User-Scoped

**User Story:** As a logged-in user, I want the submissions list to return only my own submissions, so that my history tab is private.

#### Acceptance Criteria

1. WHEN the `GET /api/submissions` route is called by an authenticated user, THEN it SHALL return only `Submission` documents where `userId` matches the authenticated user's `userId`.
2. IF no authenticated `userId` is available on a submissions GET, THEN the route SHALL return an empty array `[]`.
3. The submissions GET response SHALL remain sorted by `createdAt` descending.

---

### Requirement 5: Guest Progress Is Tracked Locally and Migrated on Sign-In

**User Story:** As a guest user who solved problems before signing up, I want my progress to carry over when I create an account, so that I don't lose my solve history.

#### Acceptance Criteria

1. WHEN a guest user's code submission is evaluated as "Accepted" in the Workspace, THEN the solved `problemSlug` SHALL be persisted to `localStorage` under the key `dwcode_guest_progress` as a JSON array of slug strings.
2. WHEN a guest user's submission is "Attempted" or "Error", THEN the `problemSlug` SHALL NOT be added to guest progress.
3. WHEN an authenticated user loads the dashboard or Workspace for the first time after sign-in, THEN the app SHALL check `localStorage` for `dwcode_guest_progress`.
4. IF guest progress exists in `localStorage`, THEN the app SHALL call a migration endpoint or client-side logic that creates `Submission` records with `status = "Accepted"` for each slug in the guest progress array, attributed to the now-authenticated `userId`.
5. AFTER successful migration, the guest progress SHALL be cleared from `localStorage` (`localStorage.removeItem('dwcode_guest_progress')`).
6. IF a slug in the guest progress already has an Accepted submission under the authenticated `userId`, THEN that slug SHALL be skipped (no duplicate submission created).
7. The migration SHALL be a best-effort, silent background operation and SHALL NOT block the UI.

---

### Requirement 6: Correctness Properties

The following properties must hold at all times and shall be validated via automated tests:

#### Property A — Isolation
For any two distinct authenticated users `U1` and `U2`, the dashboard stats returned for `U1` SHALL share no data with the stats returned for `U2`, regardless of overlapping problem slugs.

#### Property B — Zero State
For any user with no submissions and no bookmarks, all four dashboard stat values (total problems is global — this refers to solved, attempted, bookmarked) SHALL equal exactly `0`.

#### Property C — Bookmark Uniqueness Per User
A single user SHALL NOT have more than one `Bookmark` document for the same `problemId`. Different users MAY each have a `Bookmark` for the same `problemId`.

#### Property D — Submission Visibility
A user's `GET /api/submissions` response SHALL contain only documents where `submission.userId === authenticatedUserId`.

#### Property E — Guest Isolation
A guest user's dashboard SHALL never contain a count greater than `0` for solved, attempted, or bookmarked stats.
