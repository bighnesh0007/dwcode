---
tags: [ops, pending, urgent]
---
# Pending Migrations ⚠️

**Four database steps are staged and NOT run.** Order matters.

```mermaid
graph LR
    D[1 · Deploy code] --> N[2 · migrate:notes]
    N --> C[3 · migrate:comments]
    C --> I[4 · indexes]
    I --> S[5 · seed:expert]
    style N fill:#3a1f1f,stroke:#c44
```

| # | Step | Destructive | Expected |
|---|---|---|---|
| 2 | `migrate:notes` | **yes** (backs up first) | 11 legacy notes, drops `problemId_1` |
| 3 | `migrate:comments` | no | 25 to backfill, 0 orphans |
| 4 | `indexes` | no | 1 missing |
| 5 | `seed:expert` | no (upsert) | 10 problems, 39 verified cases |

> ⚠️ Checked 2026-10-23: `client/package.json` defines `indexes` and
> `seed:expert`, but `client/scripts/ensure-indexes.ts` and
> `seed-expert-problems.ts` **do not exist and never did in git history**. Steps
> 4 and 5 cannot run as written.

Every one supports `-- --dry-run`. Run each dry first and match the numbers.

## Why step 2 is urgent

Master already serves the per-user notes code, but production still carries the
stale unique index — see [[Database]]. **The second user to save a note on any
problem gets a duplicate-key error right now.**

## Why step 5 must come last

`seed:expert` writes `difficulty: "Expert"`. The deployed Mongoose enum has to
accept it first, which it only does once the [[Shared Package]] registry ships.

## Related
`docs/runbooks/database-migrations.md` · [[Database]] · [[Operations]]
