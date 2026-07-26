# Runbook — Database migrations

## Pending steps — run in THIS order

Four database steps are staged for the next release window. **Order matters:**
seeding Expert problems before the difficulty enum ships would fail validation,
because `problems.difficulty` only accepts `Expert` once the deployed code
includes the registry entry.

| # | Step | Command | Destructive | Verified state |
|---|---|---|---|---|
| 1 | **Deploy the code first** | — | — | The Expert tier must exist in the deployed enum before step 4 |
| 2 | Notes → per-user | `npm --prefix client run migrate:notes` | **Yes** (backs up first) | 10 legacy notes, `problemId_1` present |
| 3 | Comments → generalised | `npm --prefix client run migrate:comments` | No (additive) | 25 to backfill, 0 orphans |
| 4 | Indexes | `npm --prefix client run indexes` | No (additive) | 14 missing |
| 5 | Seed Expert problems | `npm --prefix client run seed:expert` | No (upsert) | 10 problems, 39 cases verified |

Every one supports `-- --dry-run`. Run each dry first; the numbers above are what
you should see.

Steps 3–5 are additive and independently re-runnable. Step 2 is the only
destructive one.

---

## Rule

**Migrations run as part of a release, not ahead of one.**

A migration that changes a schema the currently-deployed code depends on must run
in the same maintenance step as the deploy that needs it — never earlier. Running
early means production is serving old code against a new schema, which is a
self-inflicted outage.

The corollary: **every migration must be backwards-compatible with the code
running immediately before it**, or the deploy must be sequenced so both never
overlap.

---

## Running a migration

Migrations live in [client/scripts/migrations/](../../client/scripts/migrations/)
and read `MONGODB_URI` from `client/.env.local` (or the environment).

They are under `client/` rather than the repo root because ESM resolves
dependencies from the script's own directory upward, and `mongoose` is a client
dependency — the repo root only carries the `concurrently` dev runner.

```bash
# ALWAYS dry-run first. Read-only: reports counts and current indexes.
npm --prefix client run migrate:notes -- --dry-run

# Then execute.
npm --prefix client run migrate:notes
```

Every migration must be **idempotent** — safe to re-run — because a partial
failure mid-release has to be recoverable by running it again.

### Confirm the target before executing

`MONGODB_URI` in this repo points at **MongoDB Atlas (production)**, not
localhost. Verify before any destructive run:

```bash
grep -E '^MONGODB_URI=' client/.env.local | sed -E 's|//[^@]*@|//<credentials>@|'
```

`mongodb+srv://…mongodb.net` is **production**. Treat any migration against it as
a production change: announce it, take the backup, run it in the release window.

---

## 001 — scope notes to their owner

**Status: NOT YET RUN. Scheduled for the Week 1 release.**

| | |
|---|---|
| Script | [client/scripts/migrations/001-scope-notes-to-user.mjs](../../client/scripts/migrations/001-scope-notes-to-user.mjs) |
| Closes | [C-3](../audit/02-security.md#c-3--unauthenticated-readwrite-of-every-users-notes) |
| Required by | The `userId`-scoped `/api/notes` shipped in Week 1 |
| Destructive | **Yes** — deletes rows (after copying them to `notes_legacy_backup`) |
| Idempotent | Yes |

### What it does

1. Copies every legacy note into `notes_legacy_backup`
2. Deletes them from `notes`
3. Drops the stale unique index `problemId_1`
4. Creates the unique index `{ userId, problemId }`

### Why step 3 is mandatory

The old index enforces **one note per problem across all users**. If it survives,
the first user to save a note for a given problem succeeds and every other user
gets a duplicate-key error. Shipping the new code without this migration breaks
notes in production.

### Why the data is discarded rather than migrated

There is no ownership data to migrate — no field anywhere records who wrote a
note. The contents were also world-writable before this fix, so they cannot be
attributed to any individual with confidence. The backup collection keeps them
recoverable; nothing is destroyed outright.

### Verified state (dry run, 2026-07-26, Atlas `dwcode`)

```
notes: 10 total, 0 already scoped, 10 legacy
current indexes: _id_, problemId_1
```

10 notes will be backed up and removed. The stale index is present and will be
dropped.

### Release sequence

Run in this order. Notes are briefly unavailable between steps 3 and 4; that
window should be seconds, not minutes.

```
1. Announce a short maintenance window
2. Take an Atlas snapshot (belt and braces — the script's own backup is
   collection-level, a snapshot covers the whole database)
3. npm --prefix client run migrate:notes -- --dry-run     # confirm the numbers
4. npm --prefix client run migrate:notes                  # execute
5. npm --prefix client run indexes                        # see "Indexes" below
6. Deploy the Week 1 code
7. Smoke test: sign in, open a problem, save a note, reload, confirm it persists
8. Second account: confirm it sees ITS OWN note, not the first account's
```

Step 8 is the one that actually proves C-3 is closed.

### Rollback

```js
// Restore the pre-migration rows
db.notes_legacy_backup.find().forEach(d => db.notes.insertOne(d));
db.notes.dropIndex("userId_1_problemId_1");
db.notes.createIndex({ problemId: 1 }, { unique: true });
```

Then redeploy the previous release. Note this reinstates C-3 — only do it if the
new code is failing badly enough to be worse than the vulnerability.

### Cleanup

Drop `notes_legacy_backup` once the release has been stable for 30 days and
nobody has asked for a note back.

---

## Indexes

Separate from migrations, and safe to run more often.

```bash
npm --prefix client run indexes -- --dry-run   # report drift, exit 1 if any
npm --prefix client run indexes                # create what is missing
```

The script imports the Mongoose schemas directly, so **the schemas are the
single source of truth** — there is no second list to keep in sync. It exits
non-zero on drift in dry-run mode, which is what lets CI gate on it.

### Why this is not `autoIndex`

Mongoose's `autoIndex` builds indexes on model initialisation: on every cold
start, racing across serverless instances, at whatever moment the first request
happens to arrive. Index creation belongs in a deliberate, observable deploy
step.

### Current state (verified 2026-07-26, Atlas `dwcode`)

**14 declared indexes are missing in production** (PERF-02):

| Collection | Missing |
|---|---|
| `submissions` | `{userId, createdAt}`, `{userId, problemId, status}`, `{userId, problemSlug, status}` |
| `contests` | `{isPublic, startTime}`, `{createdBy}`, `{participants.userId}` |
| `problems` | `{difficulty, category}`, `{createdAt}` |
| `blogs` | `{published, createdAt}`, `{authorId}` |
| `comments` | `{problemSlug, createdAt}` |
| `bookmarks` | `{userId}` |
| `userroles` | `{role}` |
| `notes` | `{userId, problemId}` unique — **created by migration 001, not here** |

Until these exist, the queries behind the profile page, submission history,
contest listing and problem filtering are all collection scans.

### Timing

Index builds are additive and non-destructive, and MongoDB 4.2+ holds only a
brief exclusive lock. But on a large collection a build still takes real time —
run it in the release window, not at peak. `submissions` is the one to watch, as
it is both the largest collection and the one gaining three indexes.

### Rollback

```js
db.<collection>.dropIndex("<indexName>");
```

Dropping an index never loses data — only the query performance it provided.
