# PostgreSQL: schema, copy and shadow mode (issue #23)

Phase 2 added the PostgreSQL schema, its migrations and a repeatable copy from
MongoDB. Phase 3 reimplemented every repository on Drizzle behind
`DATA_BACKEND`, with shadow reads to compare the two stores in production.
**With the default `DATA_BACKEND=mongo` nothing reads or writes PostgreSQL.**

| Piece | Where |
|---|---|
| Schema (Drizzle) | `client/db/postgres/schema.ts` |
| Migrations (SQL, committed) | `client/db/postgres/migrations/` |
| Mongo → Postgres mapping | `client/db/postgres/transform.ts` |
| Plan + upsert | `client/db/postgres/copy.ts` |
| Script | `client/scripts/pg/copy-from-mongo.ts` |
| Repository facades | `client/lib/repositories/*.ts` |
| Mongoose / Drizzle implementations | `client/lib/repositories/mongo/`, `client/lib/repositories/pg/` |
| Backend switch, shadow compare | `client/lib/repositories/backend.ts` |
| Tests | `client/__tests__/postgres/` — see [Tests](#tests) |

## Design decisions

- **Ids are preserved.** Every migrated row keeps its Mongo `_id` as a 24-char
  hex `text` key, so problem URLs, bookmarks and contest links keep working.
  New rows get an id of the same shape.
- **Relationships are tables**: `follows` replaces the mirrored
  `followers`/`following` arrays; `contest_problems` and `contest_participants`
  replace embedded arrays; `coin_transactions` is the full, uncapped ledger.
- **`jsonb` only for document-shaped data**: problem examples and test cases,
  playground files and test cases.
- **Constraints the app used to enforce by hand** are now in the database:
  foreign keys to `problems`, one open report per user per problem (partial
  unique index), no self-follow, vote value ±1, contest end after start.
- **Balances are copied as stored**, not recomputed — Mongo capped the ledger at
  200 entries, so summing it would undercount.

## Changing the schema

```bash
# edit client/db/postgres/schema.ts, then:
npm -w dwcode-client run pg:generate -- --name <what-changed>
npm -w dwcode-client run pg:check        # CI runs this too
```

Never edit a migration that has been applied anywhere; add a new one.

## Running the copy

`MONGODB_URI` points at production. The copy only **reads** Mongo, but always
dry-run first.

```bash
docker compose up -d postgres            # or a hosted database
export DATABASE_URL=postgresql://dwcode:dwcode-local-dev@127.0.0.1:5432/dwcode

npm -w dwcode-client run pg:migrate      # create tables
npm -w dwcode-client run pg:copy         # DRY RUN: counts per table + skipped rows
npm -w dwcode-client run pg:copy -- --apply
```

`--apply` upserts by primary key inside one transaction, then compares every
copied row with its Postgres row by primary key and prints, per table, the row
counts and a checksum over the copied columns side by side:

```
  ok   problems                   412 →     412  3f9c0a1b2c4d5e6f = 3f9c0a1b2c4d5e6f
  BAD  submissions              18204 →   18190  a1b2…  ≠ c3d4…  (missing 14, different 0)
```

Any `BAD` row exits non-zero. It is safe to re-run; it converges rather than
duplicating.

### Skipped rows

The dry run lists every row it cannot represent, by reason — for example
anonymous bookmarks saved before sign-in was required, or submissions for a
problem that has been deleted. Review that list before `--apply`; a reason you
do not expect is a bug in `transform.ts`, not data to drop.

## Choosing the backend — `DATA_BACKEND`

| Value | Served from | Postgres |
|---|---|---|
| `mongo` (default) | MongoDB | untouched |
| `shadow` | MongoDB | every read also runs on Postgres and is compared; every write is mirrored after Mongo succeeds |
| `postgres` | PostgreSQL | the only store — the Phase 4 cutover |

`shadow` and `postgres` require `DATABASE_URL`; a deploy without it fails at boot
(`lib/config.ts`), not on the first request.

### What shadow mode guarantees

- **Users only ever get Mongo's answer.** A Postgres error or mismatch is
  logged and swallowed; a Mongo error still fails the request, as today.
- **Reads run concurrently**, so the added latency is the slower of the two, not
  their sum.
- **Writes go to Mongo first.** The mirror reuses Mongo's id and timestamp for
  creates, so the stores keep the same ids. Bookmark toggles mirror Mongo's
  *outcome*, not a second toggle, so a drifted row converges.
- **Logs carry no values** — only the operation and the first differing path,
  because some reads return access tokens:

  ```json
  {"shadow":"mismatch","op":"contests.findById","path":"participants.length"}
  {"shadow":"read-error","op":"problems.listPublic","error":"connect ECONNREFUSED"}
  {"shadow":"write-error","op":"submissions.create","error":"…violates foreign key…"}
  ```

### What counts as a difference

Compared after normalising: ObjectIds as hex, `__v` dropped, `_id` dropped from
embedded subdocuments (Postgres has no column for them), records sorted by
`_id`, timestamps equal within 5 s (a mirrored write stamps its own time).
User-keyed reads (profiles, wallets, roles, bookmarks, notes, GitHub
connections) are compared without `_id`, which no caller reads; their lists,
and arrays like `followers`, are compared as sets.

### Expected differences

These are real data that the copy deliberately does not carry over (see
*Skipped rows*). Each is pinned by the parity suite, so a new kind of
difference fails a test instead of hiding among these:

| Op | Path | Cause |
|---|---|---|
| `submissions.listByUser` | `.length` | submissions for a deleted problem |
| `submissions.slugsByOutcome` | `notAccepted.length` | the same |
| `contests.findById` | `participants.length` / `problems.length` | a duplicate participant; a deleted problem |
| `comments.listForTarget` | `[0].targetId` | comments from before migration 002 — run `migrate:comments` |
| `profiles.findByUserId` | `following.length` | a duplicated follow or a self-follow |

### Rolling out

1. `pg:migrate`, then `pg:copy` (dry run), then `pg:copy -- --apply` until it prints
   only `ok`.
2. Set `DATABASE_URL` and `DATA_BACKEND=shadow` on one deployment.
3. Watch the logs for `"shadow":`. Anything outside *Expected differences* is a
   bug in `lib/repositories/pg/` or `db/postgres/transform.ts`: fix it, re-run
   the copy, repeat.
4. **Rollback is one variable:** `DATA_BACKEND=mongo`. Mongo stayed the source
   of truth throughout, so nothing is lost.

Do not go to `postgres` from here — that is Phase 4, with its own runbook and a
final sync.

### Atomic writes

Postgres turns the read-modify-write sequences into transactions or single
statements: a debit and its ledger entry commit together, and the balance check
is the same conditional update; follows are one edge row; joining a contest is
one row with a primary key, so joining twice is a no-op; a vote change locks
its row. Deleting a problem cascades to its submissions, bookmarks, notes and
reports — Mongo left those orphaned.

## Tests

| Suite | Needs | Covers |
|---|---|---|
| `transform.test.ts`, `backend.test.ts` | nothing | mapping, the dispatcher, the comparison rules |
| `copy.integration.test.ts` | `PG_TEST_URL` | migrations, copy, checksums, constraints |
| `repositories.integration.test.ts` | `PG_TEST_URL` | every repository function in `postgres` mode |
| `parity.integration.test.ts` | `PG_TEST_URL` + `MONGO_TEST_URL` | every function in `shadow` mode: zero differences on clean data, exactly the expected ones on dirty data |

`PG_TEST_URL` must point at a disposable server: each file creates and drops its
own database there. CI runs all four with Postgres and Mongo service containers.

```bash
PG_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres \
MONGO_TEST_URL=mongodb://localhost:27017/dwcode_parity \
npm -w dwcode-client test -- __tests__/postgres
```

## Not yet done

- Choosing a host (Neon / Supabase / Render) — the code is host-agnostic
- Phase 4: the cutover runbook, a rehearsed rollback, then removing Mongoose
