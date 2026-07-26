---
name: migrate-safely
description: Run or plan a DWCode database migration safely. Use when asked to run a migration, apply pending DB changes, create indexes, seed problems, or when a schema/index change needs deploying. Enforces dry-run-first, the correct ordering, and the rule that migrations run WITH a release and never ahead of one.
---

# Migrate DWCode safely

## The rule

**Migrations run as part of a release, never ahead of one.**

A migration that changes a schema the *currently deployed* code depends on must
run in the same window as the deploy that needs it. Running early means
production serves old code against a new schema.

Corollary: every migration must be backwards-compatible with the release
immediately before it, so both can run during a rolling deploy.

## ⚠️ MONGODB_URI points at PRODUCTION

`.env.local` in this repo targets **MongoDB Atlas production**, not localhost.
Confirm before any destructive run:

```bash
grep -E '^MONGODB_URI=' client/.env.local | sed -E 's|//[^@]*@|//<credentials>@|'
```

`mongodb+srv://…mongodb.net` is production. **Never run a destructive migration
without explicit approval for that specific run.**

## Always dry-run first

Every migration supports `-- --dry-run` and is idempotent.

```bash
npm --prefix client run migrate:notes    -- --dry-run
npm --prefix client run migrate:comments -- --dry-run
npm --prefix client run indexes          -- --dry-run
npm --prefix client run seed:expert      -- --dry-run
```

Show the numbers and wait for confirmation before executing.

## Order matters

```
1. Deploy the code
2. migrate:notes       (destructive — backs up to notes_legacy_backup first)
3. migrate:comments    (additive)
4. indexes             (additive)
5. seed:expert         (upsert)
```

Step 5 must follow the deploy: it writes `difficulty: "Expert"`, which the
Mongoose enum only accepts once the shared registry ships.

## Writing a new migration

Put it in `client/scripts/migrations/NNN-description.mjs`. It must be:

- **idempotent** — a partial failure has to be recoverable by re-running
- **`--dry-run` capable** — read-only, reporting what it *would* do
- **backwards compatible** — keep the old field and index until nothing reads
  them, then drop them in a *later* migration
- **non-destructive where possible** — if it deletes, back up to a
  `*_legacy_backup` collection first and say so

## autoIndex

`client/lib/db.ts` sets `autoIndex: false` deliberately. Mongoose otherwise
builds indexes on model load against whatever `MONGODB_URI` names — a local dev
server once created 13 production indexes this way, and left `notes` in a
half-migrated state it could not repair. Index creation is `npm run indexes`,
not a side effect.

## Reference

`docs/runbooks/database-migrations.md` — current pending state and expected
dry-run numbers.
