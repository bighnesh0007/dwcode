# Contributing to DWCode

Thanks for being here. DWCode exists because DataWeave had no practice
platform, and it gets better every time someone adds a problem, fixes a bug, or
explains a pattern that took them three hours to crack.

---

## Quick start

**This is an npm workspace. Install from the repository root — not from
`client/` or `server/`.**

```bash
git clone https://github.com/bighnesh0007/dwcode.git
cd dwcode

npm install          # installs ALL workspaces; do not use --prefix client
npm run setup        # install + build the shared package
npm run dev          # client on :8000, server on :4000
```

If you see `Cannot find module '@dwcode/shared'`, the shared package has not
been built:

```bash
npm run build:shared
```

### Upgrading a checkout from before the workspace conversion

```bash
rm -rf client/node_modules server/node_modules
npm install
```

An old checkout keeps `client/node_modules/next` while the workspace hoists
another copy to the root. Two framework instances produce a confusing
`Invariant: Expected workStore to be initialized. This is a bug in Next.js.`
during the build. It is not a Next.js bug — it is the stale tree.

---

## Repository layout

```
dwcode/
├── packages/shared/   @dwcode/shared — domain rules used by BOTH halves
├── client/            Next.js app (Vercel) — pages AND most API routes
├── server/            Express API (Render) — layered; the migration target
└── docs/              architecture audit, runbooks, plans
```

Two things that surprise newcomers:

1. **Most API routes live in `client/app/api/`, not `server/`.** The Express
   service is where they are gradually moving. New endpoints should generally
   go to `server/` — ask in the issue first.
2. **`packages/shared` is the single source of truth for difficulty tiers,
   scoring and coin rules.** Never hardcode `"Easy" | "Medium" | "Hard"`.

---

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All four must pass. CI runs the same commands plus a dependency audit, a secret
scan and a Docker build.

---

## Adding a problem

The highest-value contribution, and the one with the strictest rule:

> **Never hand-write an `expectedOutput`.** Run your solution through the
> compiler and use exactly what it returns.

A hand-typed expectation that differs by one space or key order makes the
problem **unpassable**, and the solver cannot tell whether they are wrong or the
problem is.

The seeder does this for you — it executes every reference solution and stores
the real output, refusing to write anything if a single case fails:

```bash
npm --prefix client run seed:expert -- --dry-run
```

See [`client/scripts/seed/expert-problems.ts`](client/scripts/seed/expert-problems.ts)
for the shape. Give each problem 3–4 visible cases and 3–4 hidden ones.

Difficulty tiers come from
[`packages/shared/src/difficulty.ts`](packages/shared/src/difficulty.ts). Adding
a whole new tier is one entry in that array — everything else derives from it.

---

## Code conventions

- **TypeScript strict.** `any` needs a comment explaining why.
- **Comment the non-obvious.** Explain *why*, not *what*. The existing code does
  this well — match it.
- **Never import `models/*` from a `"use client"` component.** It pulls Mongoose
  (and `async_hooks`) into the browser bundle and fails the build. Put shared
  constants in `client/lib/`.
- **Validate at the boundary.** Never spread a request body into a Mongoose
  constructor — `new Model({ ...req.body })` is how mass assignment happens.
- **Authorisation belongs in the route handler**, not in middleware path
  matching.

---

## Database changes

Migrations live in `client/scripts/migrations/`, are **idempotent**, and support
`--dry-run`. Read [`docs/runbooks/database-migrations.md`](docs/runbooks/database-migrations.md)
first.

The rule that matters: **a migration must be backwards-compatible with the code
running immediately before it**, so old and new can overlap during a deploy.

---

## Reporting a security issue

Please do **not** open a public issue. See [SECURITY.md](SECURITY.md).

---

## Commit messages

Conventional-commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
`chore:`, `ci:`). Explain **why** in the body — the git history is documentation.

---

## Licence

By contributing you agree that your contributions are licensed under the
[MIT Licence](LICENSE).
