The Next.js application lives in `client/`. Its agent rules are imported below.

@client/AGENTS.md

---

## This is an npm workspace

Install from the **repository root**, never with `--prefix client`. There is one
lockfile, at the root.

`@dwcode/shared` is consumed as compiled `dist/`, so **it must build first**:
`npm run build:shared`.

## Before committing

Run the full gate — use the **`verify`** skill, or:
`npm run typecheck && npm run lint && npm test && npm run build`

## Skills

| Skill | When |
|---|---|
| `verify` | Run the quality gate across all three workspaces |
| `migrate-safely` | Any database migration, index or seed — dry-run first |
| `run-locally` | Start the app to check a change for real |
| `add-pr` | Open a pull request |
| `clerk-cli` | Clerk operations |

## Rules that are not obvious

- **Never hardcode `"Easy" | "Medium" | "Hard"`.** Difficulty comes from
  `@dwcode/shared` — one registry array drives enum, scoring, coins, colours and
  filters.
- **Never import `models/*` from a `"use client"` component.** It pulls Mongoose
  into the browser bundle and fails the build. Shared constants go in `lib/`.
- **Never spread a request body into a Mongoose constructor.** That is how mass
  assignment happens. Validate and map fields explicitly.
- **Authorise in the route handler**, not in middleware path matching.
- **Never hand-write a problem's `expectedOutput`.** Generate it by running the
  solution through the compiler — a wrong expectation makes a problem unpassable.
- **`MONGODB_URI` points at production.** Dry-run every migration first.

## Context

`docs/vault/` is an Obsidian vault of the project's architecture, decisions,
findings and open work as a linked graph. Start at `docs/vault/DWCode.md`.
Authoritative detail lives in `docs/audit/`, `docs/runbooks/`, `docs/plans/`.
