# Design: User Progress & Dashboard Statistics Bug Fix

## Overview

The DWCode dashboard currently queries MongoDB for solved, attempted, and bookmarked counts without any `userId` filter, so every visitor — authenticated or not — sees the same global aggregate numbers. The `Bookmark` model also lacks a `userId` field, making per-user bookmark scoping impossible at the data layer.

This design addresses the bug by making three mutually-reinforcing changes:

1. **Data model** — Add `userId` to `Bookmark` and replace the global unique index on `problemId` with a compound unique index on `{ problemId, userId }`.
2. **API routes** — Filter `GET /api/bookmarks` and `GET /api/submissions` by the authenticated user's Clerk `userId`. Require authentication on `POST /api/bookmarks`.
3. **Dashboard server component** — Call `auth()` before running any stat query; skip all DB queries and default to `0` when `userId` is absent.
4. **Guest progress migration** — Persist accepted solves to `localStorage` for guest users and silently migrate them into `Submission` records upon first authenticated load.

---

## Glossary

| Term | Definition |
|---|---|
| **userId** | The unique Clerk user ID string (e.g. `user_2abc...`) attached to authenticated sessions |
| **Guest user** | A visitor who has not signed in — no Clerk `userId` available |
| **Dashboard stats** | The stat cards on the home page: Total Problems, Solved, Attempted, Bookmarked |
| **Solved** | Count of distinct `problemSlug` values where `status = "Accepted"` for the current user |
| **Attempted** | Count of distinct `problemSlug` values where the user has a non-Accepted submission but no Accepted one |
| **Bookmarked** | Count of Bookmark documents belonging to the current user |
| **Guest progress migration** | Transfer of locally-stored guest solve data into the authenticated user's account upon sign-in |

---

## Bug Details

### Root cause

Three independent but related defects exist:

1. **`app/page.tsx`** — `Submission.distinct()` and `Bookmark.countDocuments()` queries run without a `userId` filter, returning platform-wide counts.
2. **`models/Bookmark.ts`** — The schema has no `userId` field and enforces a global unique index on `problemId` alone, making per-user scoping structurally impossible.
3. **`app/api/bookmarks/route.ts`** — `GET` returns all bookmarks; `POST` toggles by `problemId` only, with no auth check.
4. **`app/api/submissions/route.ts`** — `GET` returns all submissions in the collection with no `userId` filter.

### Affected files

| File | Problem |
|---|---|
| `app/page.tsx` | No `auth()` call; all stat queries are global |
| `models/Bookmark.ts` | No `userId` field; wrong unique index |
| `app/api/bookmarks/route.ts` | No auth; no userId filter |
| `app/api/submissions/route.ts` | No userId filter on GET |

---

## Expected Behavior

After the fix:

- An authenticated user visiting the dashboard sees only their own solved, attempted, and bookmarked counts.
- A guest (unauthenticated) user always sees `0` for all three user-specific stats.
- `GET /api/bookmarks` returns only the calling user's bookmarks; returns `[]` for guests.
- `POST /api/bookmarks` requires authentication; returns `401` otherwise.
- `GET /api/submissions` returns only the calling user's submissions; returns `[]` for guests.
- Bookmarks are scoped per user via a compound `{ problemId, userId }` unique index.
- Accepted solves performed as a guest are migrated to the user's account on first sign-in.

---

## Hypothesized Root Cause

The dashboard and API routes were built before Clerk authentication was integrated. The `Submission` model was updated to carry `userId` when auth was added to the POST handler, but the corresponding read paths (GET routes, dashboard queries) were never updated to filter by `userId`. The `Bookmark` model was never touched at all after auth was introduced.

---

## Fix Implementation

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (browser)                                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Workspace.tsx (client component)                      │  │
│  │  • On Accepted submit: write slug to localStorage      │  │
│  │  GuestMigration.tsx (new client component)             │  │
│  │  • On first auth load: read localStorage, POST to      │  │
│  │    /api/migrate-guest-progress, clear localStorage     │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
           │ fetch                        │ fetch
           ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js App Router (server)                                  │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  app/page.tsx    │  │ /api/        │  │ /api/         │  │
│  │  (server comp.)  │  │ bookmarks    │  │ submissions   │  │
│  │  auth() → userId │  │ route.ts     │  │ route.ts      │  │
│  │  userId filter   │  │ auth filter  │  │ auth filter   │  │
│  └──────────────────┘  └──────────────┘  └───────────────┘  │
│                          /api/migrate-guest-progress          │
│                          (new route)                          │
└─────────────────────────────────────────────────────────────┘
           │ Mongoose                     │ Mongoose
           ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│  MongoDB                                                      │
│  Submission collection (userId field already exists)          │
│  Bookmark collection   (userId field — NEW)                   │
└─────────────────────────────────────────────────────────────┘
```

### Key design decisions

- **No new authentication mechanism.** All auth is delegated to Clerk via `auth()` from `@clerk/nextjs/server`, already used in `POST /api/submissions`.
- **Server component queries in `app/page.tsx`.** The dashboard remains a server component so stats are computed server-side at request time where `auth()` is available.
- **Guest migration via a dedicated client component.** Migration touches `localStorage` (browser-only API) so it runs in a `"use client"` component rendered inside the authenticated dashboard, keeping it non-blocking.
- **No breaking changes to existing Submission records.** Old anonymous submissions (`userId = ""`) simply don't match any authenticated userId query — they become invisible but are not deleted.
- **Existing Bookmark documents are legacy.** Old `Bookmark` rows have `userId = ""` and won't be returned for any authenticated or guest user. A one-time cleanup script is out of scope.

---

### Components and Interfaces

#### 1. `models/Bookmark.ts` — Schema update

Replace the current global unique index on `problemId` with a compound index on `{ problemId, userId }`.

**Before:**
```ts
const BookmarkSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true, unique: true },
  problemSlug: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
```

**After:**
```ts
const BookmarkSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
  problemSlug: { type: String, required: true },
  userId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

BookmarkSchema.index({ problemId: 1, userId: 1 }, { unique: true });
```

Removing `unique: true` from `problemId` and adding the compound index allows different users to bookmark the same problem.

---

#### 2. `app/api/bookmarks/route.ts` — User-scoped GET and POST

**GET** — returns only the calling user's bookmarks; returns `[]` for guests.

**POST** — requires authentication; uses `{ problemId, userId }` for the toggle lookup; returns `401` if unauthenticated.

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Bookmark } from "@/models/Bookmark";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json([]);
    }
    await connectToDatabase();
    const bookmarks = await Bookmark.find({ userId }).lean();
    return NextResponse.json(bookmarks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { problemId, problemSlug } = await req.json();
    await connectToDatabase();

    const existing = await Bookmark.findOne({ problemId, userId });
    if (existing) {
      await Bookmark.deleteOne({ problemId, userId });
      return NextResponse.json({ success: true, bookmarked: false });
    } else {
      const bookmark = new Bookmark({ problemId, problemSlug, userId });
      await bookmark.save();
      return NextResponse.json({ success: true, bookmarked: true });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

---

#### 3. `app/api/submissions/route.ts` — User-scoped GET

Only the `GET` handler changes. The `POST` handler already attaches `userId` from Clerk and is unchanged.

```ts
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json([]);
    }
    await connectToDatabase();
    const submissions = await Submission.find({ userId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json(submissions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

`auth` is already imported at the top of this file.

---

#### 4. `app/page.tsx` — User-scoped dashboard queries

The server component gains a call to `auth()` at the top of the function body. All user-specific stat queries are wrapped in a `userId` guard.

```ts
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();

  let total = 0, easy = 0, medium = 0, hard = 0;
  let solved = 0, attempted = 0, bookmarked = 0;
  let recentProblems: any[] = [];
  let bookmarkedProblems: any[] = [];

  try {
    await connectToDatabase();

    // Total counts are global — unaffected by userId
    [total, easy, medium, hard] = await Promise.all([
      Problem.countDocuments(),
      Problem.countDocuments({ difficulty: "Easy" }),
      Problem.countDocuments({ difficulty: "Medium" }),
      Problem.countDocuments({ difficulty: "Hard" }),
    ]);

    // User-scoped stats — only run when authenticated
    if (userId) {
      const acceptedSlugs = await Submission.distinct("problemSlug", {
        userId,
        status: "Accepted",
      });
      const attemptedSlugs = await Submission.distinct("problemSlug", {
        userId,
        status: { $ne: "Accepted" },
      });
      solved = acceptedSlugs.length;
      attempted = attemptedSlugs.filter((s: string) => !acceptedSlugs.includes(s)).length;
      bookmarked = await Bookmark.countDocuments({ userId });

      if (bookmarked > 0) {
        const bmarks = await Bookmark.find({ userId }).lean();
        const bIds = bmarks.map((b: any) => b.problemId);
        const bDocs = await Problem.find({ _id: { $in: bIds } }).limit(3).lean();
        bookmarkedProblems = JSON.parse(JSON.stringify(bDocs));
      }
    }

    const recentDocs = await Problem.find().sort({ createdAt: -1 }).limit(4).lean();
    recentProblems = JSON.parse(JSON.stringify(recentDocs));
  } catch (e) {
    console.error("Dashboard DB error:", e);
  }

  // Render <GuestMigration userId={userId} /> inside JSX when userId is truthy
}
```

---

#### 5. `app/problems/[slug]/Workspace.tsx` — Guest progress persistence

After the submission POST returns with `finalStatus === "Accepted"`, persist the slug to `localStorage`:

```ts
// Inside handleSubmit, after saving the submission and before refreshing history:
if (finalStatus === "Accepted") {
  try {
    const raw = localStorage.getItem("dwcode_guest_progress");
    const existing: string[] = raw ? JSON.parse(raw) : [];
    if (!existing.includes(problem.slug)) {
      existing.push(problem.slug);
      localStorage.setItem("dwcode_guest_progress", JSON.stringify(existing));
    }
  } catch {
    // localStorage unavailable (private mode, SSR guard) — fail silently
  }
}
```

Authenticated users will have their progress migrated away from `localStorage` on next dashboard load, so no double-counting occurs.

---

#### 6. `app/api/migrate-guest-progress/route.ts` — New migration endpoint

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { slugs }: { slugs: string[] } = await req.json();
    if (!Array.isArray(slugs) || slugs.length === 0) {
      return NextResponse.json({ migrated: 0 });
    }
    await connectToDatabase();

    let migrated = 0;
    for (const slug of slugs) {
      const exists = await Submission.exists({ userId, problemSlug: slug, status: "Accepted" });
      if (exists) continue;

      const problem = await Problem.findOne({ slug }).select("_id").lean() as any;
      if (!problem) continue;

      await Submission.create({
        problemId: problem._id,
        problemSlug: slug,
        userId,
        userName: "Migrated",
        code: "// migrated from guest session",
        input: "{}",
        output: "",
        status: "Accepted",
        executionTime: "0ms",
      });
      migrated++;
    }
    return NextResponse.json({ migrated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

#### 7. `components/GuestMigration.tsx` — New zero-UI client component

```tsx
"use client";

import { useEffect } from "react";

export function GuestMigration({ userId }: { userId: string }) {
  useEffect(() => {
    const raw = localStorage.getItem("dwcode_guest_progress");
    if (!raw) return;
    let slugs: string[];
    try {
      slugs = JSON.parse(raw);
    } catch {
      localStorage.removeItem("dwcode_guest_progress");
      return;
    }
    if (!Array.isArray(slugs) || slugs.length === 0) {
      localStorage.removeItem("dwcode_guest_progress");
      return;
    }
    // Fire-and-forget — does not block the UI
    fetch("/api/migrate-guest-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs }),
    })
      .then(() => localStorage.removeItem("dwcode_guest_progress"))
      .catch(() => {
        // Silent failure — localStorage remains intact for next attempt
      });
  }, [userId]);

  return null;
}
```

Rendered in `app/page.tsx` inside the returned JSX:

```tsx
{userId && <GuestMigration userId={userId} />}
```

---

## Data Models

### Bookmark (updated)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `problemId` | ObjectId (ref Problem) | required | Not unique alone |
| `problemSlug` | String | required | Denormalised for convenience |
| `userId` | String | default `""` | Clerk user ID |
| `createdAt` | Date | default `Date.now` | |

**Index:** `{ problemId: 1, userId: 1 }` — unique compound index

### Submission (unchanged schema)

| Field | Type | Default |
|---|---|---|
| `_id` | ObjectId | auto |
| `problemId` | ObjectId | required |
| `problemSlug` | String | required |
| `userId` | String | `""` |
| `userName` | String | `"Anonymous"` |
| `userImageUrl` | String | `""` |
| `code` | String | required |
| `input` | String | `"{}"` |
| `output` | String | `""` |
| `status` | Enum | `"Attempted"` |
| `executionTime` | String | `"0ms"` |
| `createdAt` | Date | `Date.now` |

Existing submissions with `userId = ""` naturally return no results for any authenticated userId query, so no data migration is needed for the Submission collection.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Redundancy Analysis

Before listing properties, the following redundancies were resolved:

- Requirements 1.5, 2.3, and 2.5 are all edge cases of the general Zero State property. They are consolidated into Property 2.
- Requirements 1.1, 1.2, 1.3, and 1.4 each deal with user-scoped stat correctness and are combined into a single "stat isolation" property (Property 1).
- Requirements 3.5 and 4.1 are the same isolation rule applied to different collections. They are expressed as a single "API response isolation" property (Property 5).
- Requirements 5.5 and 5.6 are both aspects of migration idempotency and are merged into Property 8.

---

### Property 1: User stat isolation

*For any* authenticated userId and any arbitrary mix of Submission and Bookmark documents belonging to multiple distinct users, the dashboard stat queries (solved, attempted, bookmarked) computed for that userId SHALL count only documents where `submission.userId === userId` or `bookmark.userId === userId`, respectively.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

---

### Property 2: Zero state for users with no data

*For any* userId for which there are zero Submission documents and zero Bookmark documents in the database, all three computed stats — solved, attempted, and bookmarked — SHALL equal exactly `0`.

**Validates: Requirements 1.5, 2.1**

---

### Property 3: Guest isolation

*For any* invocation of the dashboard stat computation with `userId` equal to `null` or `undefined`, all three stats (solved, attempted, bookmarked) SHALL equal exactly `0`, regardless of what Submission or Bookmark documents exist in the database.

**Validates: Requirements 2.1, 2.5**

---

### Property 4: Bookmark compound uniqueness

*For any* `userId` and `problemId` pair, the Bookmark collection SHALL contain at most one document with that exact `{ userId, problemId }` combination. Inserting a second document with the same pair SHALL raise a duplicate key error. Inserting with the same `problemId` but a different `userId` SHALL succeed.

**Validates: Requirements 3.1, 3.2**

---

### Property 5: API response isolation

*For any* authenticated userId, the response body of `GET /api/bookmarks` SHALL contain only documents where `bookmark.userId === userId`, and the response body of `GET /api/submissions` SHALL contain only documents where `submission.userId === userId`, regardless of what other users' documents exist in the collections.

**Validates: Requirements 3.5, 4.1**

---

### Property 6: Submissions API sort order

*For any* authenticated userId and any set of their Submission documents, the array returned by `GET /api/submissions` SHALL be ordered by `createdAt` descending — for any adjacent pair `(submissions[i], submissions[i+1])`, `submissions[i].createdAt >= submissions[i+1].createdAt`.

**Validates: Requirements 4.3**

---

### Property 7: Guest progress local persistence

*For any* `problemSlug` string, when a guest user's submission for that slug is evaluated as `"Accepted"`, the slug SHALL appear in the array stored at `localStorage["dwcode_guest_progress"]`. Slugs associated with `"Attempted"` or `"Error"` submissions SHALL NOT be added.

**Validates: Requirements 5.1, 5.2**

---

### Property 8: Migration idempotency

*For any* userId and any array of `problemSlug` strings (including slugs that already have `Accepted` submissions for that userId), calling the migration endpoint SHALL produce exactly one `Accepted` Submission per slug for that userId — no duplicates, regardless of how many times migration is called with the same inputs.

**Validates: Requirements 5.4, 5.5, 5.6**

---

## Error Handling

| Scenario | Handling |
|---|---|
| `auth()` returns `null` userId on dashboard load | Skip all user-scoped queries; stats default to `0` |
| `auth()` returns `null` on `GET /api/bookmarks` | Return `[]` with HTTP 200 |
| `auth()` returns `null` on `POST /api/bookmarks` | Return `{ error: "Unauthorized" }` with HTTP 401 |
| `auth()` returns `null` on `GET /api/submissions` | Return `[]` with HTTP 200 |
| `auth()` returns `null` on `POST /api/migrate-guest-progress` | Return `{ error: "Unauthorized" }` with HTTP 401 |
| Duplicate bookmark insert (compound key violation) | Handled by `findOne` → `deleteOne` / `create` toggle pattern; no raw insert |
| `localStorage` unavailable in `Workspace.tsx` | `try/catch` around all `localStorage` calls; failure is silent |
| Migration POST network failure | `GuestMigration` catches silently; `localStorage` remains intact for next attempt |
| Problem not found during migration | Skip that slug; return partial `migrated` count |
| MongoDB connection error on any route | Existing `try/catch` returns HTTP 500 with `{ error: message }` |

---

## Testing Strategy

### Unit Tests

Focus on pure stat computation logic and the migration deduplication logic.

- Assert `Bookmark` schema has `userId` field with `String` type and `""` default.
- Assert `Bookmark` schema enforces `{ problemId, userId }` compound unique index.
- `computeStats(submissions, bookmarks, userId)` — a pure helper function — returns correct solved/attempted/bookmarked for varied input combinations.
- `computeStats` with `null` or `undefined` userId always returns `{ solved: 0, attempted: 0, bookmarked: 0 }`.
- `dedupeGuestSlugs(existingAcceptedSlugs, guestSlugs)` returns only slugs not already accepted.

### Property-Based Tests

Property-based tests use **fast-check** (TypeScript PBT library). Each test runs a minimum of **100 iterations**.

1. **User stat isolation** (validates Property 1)
   Tag: `Feature: user-progress-dashboard-stats, Property 1: user stat isolation`
   Generate two distinct userIds + arbitrary arrays of Submission/Bookmark records mixed across both users. Assert stats for userA contain no contributions from userB's records.

2. **Zero state** (validates Property 2)
   Tag: `Feature: user-progress-dashboard-stats, Property 2: zero state`
   Generate arbitrary userId strings. Assert `computeStats([], [], userId)` returns all zeros.

3. **Guest isolation** (validates Property 3)
   Tag: `Feature: user-progress-dashboard-stats, Property 3: guest isolation`
   Generate arbitrary arrays of Submission and Bookmark documents. Assert `computeStats(submissions, bookmarks, null)` and `computeStats(submissions, bookmarks, undefined)` always return all zeros.

4. **Bookmark compound uniqueness** (validates Property 4)
   Tag: `Feature: user-progress-dashboard-stats, Property 4: bookmark compound uniqueness`
   Generate arbitrary `userId` + `problemId` pairs. Assert inserting two Bookmark documents with the same pair throws a duplicate key error, and inserting with the same `problemId` but a different `userId` succeeds (using `mongodb-memory-server`).

5. **API response isolation** (validates Property 5)
   Tag: `Feature: user-progress-dashboard-stats, Property 5: API response isolation`
   Generate arbitrary userId + multi-user sets of Bookmark/Submission documents seeded into an in-memory MongoDB. Call the route handler logic directly. Assert all returned items belong to the target userId.

6. **Submissions sort order** (validates Property 6)
   Tag: `Feature: user-progress-dashboard-stats, Property 6: submissions sort order`
   Generate arbitrary arrays of Submission documents with random `createdAt` values for a given userId. Assert the returned array is sorted `createdAt` descending.

7. **Guest progress local persistence** (validates Property 7)
   Tag: `Feature: user-progress-dashboard-stats, Property 7: guest progress persistence`
   Generate arbitrary non-empty `problemSlug` strings. Assert the slug appears in parsed `localStorage["dwcode_guest_progress"]` after an accepted submission. Assert non-accepted statuses do not add the slug.

8. **Migration idempotency** (validates Property 8)
   Tag: `Feature: user-progress-dashboard-stats, Property 8: migration idempotency`
   Generate arbitrary userId + arbitrary slug arrays (including overlap with pre-existing Accepted submissions). Run migration once, then again. Assert the total count of Accepted Submissions per slug per userId equals exactly 1 after both runs.

### Integration Tests

- `POST /api/bookmarks` with a mocked unauthenticated Clerk session returns HTTP 401.
- `GET /api/bookmarks` with a mocked unauthenticated Clerk session returns `[]`.
- `GET /api/submissions` with a mocked unauthenticated Clerk session returns `[]`.
- `app/page.tsx` server render with `userId = null` produces `solved=0, attempted=0, bookmarked=0` in the rendered output.
- Full bookmark round-trip: create via POST, fetch via GET, verify it appears; attempt to create duplicate for same problem/user, verify duplicate is handled gracefully.
