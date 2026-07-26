---
name: verify
description: Run the full DWCode quality gate across all three workspaces — typecheck, lint, test, build for packages/shared, client and server. Use before committing, before pushing, after a refactor, or whenever asked to "check it works", "verify", "run the checks", or "is it green". Knows the workspace build order and the traps that make a green run misleading.
---

# Verify DWCode

The gate CI enforces. Run it before committing — a broken `master` blocks
everyone, and the ruleset requires all six checks to pass anyway.

## Build order is not optional

`@dwcode/shared` is consumed as compiled `dist/`, **not** as TypeScript source.
It must build first or everything else fails with
`Cannot find module '@dwcode/shared'`.

```bash
npm run build:shared        # ALWAYS first
```

`prepare`/`prebuild` hooks handle this automatically in most paths, but run it
explicitly so a failure here is obvious rather than surfacing as a confusing
downstream error.

## The gate

```bash
npm run build:shared

# client
npm run typecheck -w dwcode-client
npm run lint      -w dwcode-client
npm test          -w dwcode-client
npm run build     -w dwcode-client      # needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# server
npm run typecheck -w dwcode-server
npm run lint      -w dwcode-server
npm test          -w dwcode-server
npm run build     -w dwcode-server
```

`next build` needs a Clerk publishable key even though it is public. Use the CI
dummy when you do not have one:

```bash
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='pk_test_Y2ktZHVtbXktZm9yLWJ1aWxkLW9ubHkk'
export NEXT_PUBLIC_API_URL='http://localhost:4000'
export NEXT_PUBLIC_APP_URL='http://localhost:8000'
```

## Expected

| Check | Expected |
|---|---|
| client tests | 125 passing |
| server tests | 58 passing |
| everything else | exit 0 |

A **drop** in test count means tests were removed or silently skipped — treat it
as a failure even if the run is green.

## Traps that make a green run lie

- **Stale `node_modules`.** If the build fails with
  `Invariant: Expected workStore to be initialized. This is a bug in Next.js.`
  it is not a Next bug — it is a duplicate `next` install left over from before
  the workspace conversion:
  `rm -rf client/node_modules server/node_modules && npm install`
- **A check that cannot fail.** If you add a CI grep or scanner, self-test it
  against a known-bad input first. A broken regex plus a swallowed exit code
  makes a job green while verifying nothing.
- **Do not report a partial run as passing.** Say which steps ran.

## Also worth running

- `npm --prefix client run indexes -- --dry-run` — index drift (read-only)
- `node scripts/audit-gate.mjs client && node scripts/audit-gate.mjs server`
