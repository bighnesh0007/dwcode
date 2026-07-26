---
tags: [adr]
status: accepted
---
# ADR-004 · npm workspaces

**Context.** [[ADR-003 Difficulty Registry]] needs a package both halves import.

**Decision.** Convert to npm workspaces: one lockfile at the root,
`packages/shared` linked into both.

**The bill, paid knowingly.** `npm ci` inside `client/` or `server/` stops
working — there is no lockfile there. Both deploy configs needed changing, and
one change is dashboard-only.

## Three things that broke, and why they were non-obvious

| Symptom | Actual cause |
|---|---|
| `Cannot find module '@dwcode/shared'` in 11 files | `turbopack.root` was pinned to `client/`, blocking resolution above it |
| `Invariant: Expected workStore to be initialized. This is a bug in Next.js.` | **Not** a Next bug — a stale `client/node_modules/next` alongside the hoisted one. Two framework instances. |
| Difficulty colours would vanish | Tailwind does not scan `node_modules` — needed `@source` |

The second is the nastiest: the error blames the framework and appears *after*
"Compiled successfully". Anyone pulling the change hits it. Fix:
`rm -rf client/node_modules server/node_modules && npm install`.

**Robustness added later.** Rather than depend on a platform running the right
command, `packages/shared` has a `prepare` script and both consumers have
`prebuild` — so shared builds no matter how the build is invoked. This was
prompted by a real Render failure where the blueprint had not been re-applied.

## Related
[[Shared Package]] · [[Deployment]] · [[ADR-003 Difficulty Registry]]
