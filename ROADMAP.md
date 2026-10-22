# Roadmap

Where DWCode is going, in the order it gets done. Each stage is a GitHub
**milestone** (defined in [`.github/milestones.yml`](.github/milestones.yml)),
so progress is visible on the [milestones page](https://github.com/bighnesh0007/dwcode/milestones).

Ideas without a milestone live in [Discussions → Ideas](https://github.com/bighnesh0007/dwcode/discussions)
and in [`docs/audit/08-product-roadmap.md`](docs/audit/08-product-roadmap.md).

---

## v1.1 · Data integrity — *now*

Every problem passable, none trivially cheatable.

- [x] Grading keeps quotes on JSON string output (#12)
- [x] Hidden test cases can be graded, behind `GRADE_HIDDEN_TESTS` (#10)
- [x] Hidden test cases are no longer sent to the browser
- [ ] Run migration 003 — fix the odd/even solution (#54)
- [ ] Run `audit:problems`; fix every MISMATCH with a generated migration (#9)
- [ ] Add hidden cases to every problem the audit lists as CHEATABLE
- [ ] Turn on `GRADE_HIDDEN_TESTS` in production (#10)

## PostgreSQL migration (#23)

The persistence layer moves from MongoDB/Mongoose to PostgreSQL/Drizzle. It is
staged so that **no phase is irreversible until the last one**, and production
keeps running on MongoDB until cutover.

### Phase 1 — repository layer ✅

All client data access goes through `client/lib/repositories/`, and ESLint forbids
Mongoose anywhere else. The database swap becomes "reimplement 14 repository modules",
not "edit 36 route handlers".

### Phase 2 — schema and tooling ✅

See [`docs/runbooks/postgres-copy.md`](docs/runbooks/postgres-copy.md). Done except the
host decision and `DATABASE_URL` in the validated config, which move to Phase 3.
The copy script from Phase 3 was pulled forward so the schema is proven against real data.

- Drizzle schema with foreign keys, unique constraints and indexes for every
  collection; `jsonb` only for genuinely document-shaped data (test cases,
  playground files)
- Versioned migrations with Drizzle Kit, committed and reviewed like code
- `DATABASE_URL` in the validated config; a Postgres service in `docker-compose.yml`
- Schema tests against a throwaway database in CI
- Decide hosting (Neon / Supabase / Render) — the code stays host-agnostic

### Phase 3 — data migration and dual-read

- An idempotent, `--dry-run`-able Mongo → Postgres copy script with an explicit
  ObjectId → id mapping
- Verification: row counts and per-table checksums, reported side by side
- Repositories reimplemented on Drizzle behind a flag; **shadow reads** compare
  both databases in production without serving from Postgres
- Writes that must be atomic (coins, follows, contest membership) become
  transactions

### Phase 4 — cutover and Mongo removal

- A written runbook with a rollback that has been rehearsed
- Short maintenance window: final sync, flip the flag, verify
- After a soak period: remove Mongoose, `client/models/`, `MONGODB_URI` and the
  Mongo CI services

Rules for every phase follow [`docs/runbooks/database-migrations.md`](docs/runbooks/database-migrations.md):
dry-run first, idempotent, backwards-compatible with the release before it.

## Later

- Leaderboard aggregated in the database instead of in memory
- Port the remaining client API routes to the Express `/api/v1` backend (REF-03..05)
- End-to-end tests with Playwright (TEST-04)
- Daily challenges, company-tagged sets, team leagues
