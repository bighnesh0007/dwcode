# PostgreSQL schema and copy (issue #23)

Phase 2 adds the PostgreSQL schema, its migrations and a repeatable copy from
MongoDB. **The app does not read or write PostgreSQL yet** — MongoDB stays the
source of truth until the Phase 3 cutover, so nothing here can affect users.

| Piece | Where |
|---|---|
| Schema (Drizzle) | `client/db/postgres/schema.ts` |
| Migrations (SQL, committed) | `client/db/postgres/migrations/` |
| Mongo → Postgres mapping | `client/db/postgres/transform.ts` |
| Plan + upsert | `client/db/postgres/copy.ts` |
| Script | `client/scripts/pg/copy-from-mongo.ts` |
| Tests | `client/__tests__/postgres/` (integration runs when `PG_TEST_URL` is set) |

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

`--apply` upserts by primary key inside one transaction, then prints Postgres
row counts beside the copied counts (`LOW` and a non-zero exit if short). It is
safe to re-run; it converges rather than duplicating.

### Skipped rows

The dry run lists every row it cannot represent, by reason — for example
anonymous bookmarks saved before sign-in was required, or submissions for a
problem that has been deleted. Review that list before `--apply`; a reason you
do not expect is a bug in `transform.ts`, not data to drop.

## Not yet done (Phase 3)

- Repositories reimplemented on Drizzle behind a flag, with shadow reads
- `DATABASE_URL` in the validated config (it must mirror the server's list)
- Per-table checksums beside the row counts
- Choosing a host (Neon / Supabase / Render) — the code is host-agnostic
