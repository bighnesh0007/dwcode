# Runbook — Deployment prerequisites after REF-01 (npm workspaces)

> **Read this before the next deploy.** REF-01 converted the repository to npm
> workspaces. Both Vercel and Render need configuration changes, and **one of
> them cannot be expressed in a config file** — it is a dashboard setting.

---

## What changed

```
dwcode/
├── package.json          ← now declares "workspaces": ["packages/*", "client", "server"]
├── package-lock.json     ← THE ONLY LOCKFILE NOW
├── packages/
│   └── shared/           ← NEW: @dwcode/shared (difficulty registry, scoring, limits)
├── client/               ← depends on @dwcode/shared
│   └── package-lock.json ← DELETED
└── server/               ← depends on @dwcode/shared
    └── package-lock.json ← DELETED
```

Three consequences:

1. **`npm ci` inside `client/` or `server/` no longer works.** There is no
   lockfile there. Installs must run from the repository root.
2. **`packages/shared` must be present at build time.** Both packages import it.
3. **`@dwcode/shared` must be BUILT before either package compiles.** It is
   consumed as compiled `dist/` output, so `npm run build:shared` has to run
   first. The root `build`, `typecheck` and `test` scripts already do this.

---

## Vercel (client)

### ⚠️ `vercel.json` cannot contain comments

Both `vercel.json` files previously used `"//"` keys as pseudo-comments. JSON has
no comment syntax and Vercel's schema **rejects unknown properties**, so the
deploy fails before it starts:

```
The `vercel.json` schema validation failed with the following message:
should NOT have additional property `//`
```

Fixed. Do not reintroduce them — put the explanation in this file instead.

### Which file Vercel reads

Vercel reads `vercel.json` from the project's **Root Directory**. Both are now
valid and workspace-aware, so either setting works:

| Root Directory | File used | Install | Build |
|---|---|---|---|
| **repo root** *(recommended)* | `vercel.json` | `npm ci` | `npm run build:shared && npm run build:client` |
| `client` | `client/vercel.json` | `npm ci --prefix ..` | `npm run build:shared --prefix .. && npm run build` |

### Recommended: set Root Directory to the repo root

**This removes the need for the "Include source files outside of the Root
Directory" dashboard toggle entirely** — with the repo root as the context,
`packages/shared` is already in scope.

| Setting | Value |
|---|---|
| Root Directory | *(empty — the repo root)* |
| Install / Build / Output | leave empty; `vercel.json` supplies them |

If you keep Root Directory = `client`, you **must** enable
**Settings → General → Root Directory → "Include source files outside of the
Root Directory in the Build Step"**. It is dashboard-only and cannot be
expressed in `vercel.json`. Without it Vercel uploads only `client/` and the
build fails with `Cannot find module '@dwcode/shared'`.

### Why the commands are what they are

- `build:shared` must run **first** — both packages consume `@dwcode/shared` as
  compiled `dist/`, not as TypeScript source.
- `installCommand` runs at the workspace root because that is where the only
  lockfile lives. `npm --prefix client ci` (the old value) referenced
  `client/package-lock.json`, deleted by REF-01.
- `ignoreCommand` now also watches `packages/` and the root lockfile. Previously
  it watched only `client/`, so a change to the shared package would have
  skipped the frontend build and shipped a stale bundle.

### Verifying

The build log should show:
1. an install that mentions all three workspaces
2. `> @dwcode/shared build` before `> dwcode-client build`
3. `✓ Compiled successfully`

### Rollback

Disable the dashboard setting and redeploy the previous commit. REF-01 touches
no runtime behaviour — it is a build-time reorganisation — so a rollback is safe
and does not need a database change.

---

## Render (server)

Handled in [render.yaml](../../render.yaml), already updated — no dashboard change
required, but **the blueprint must be re-applied** for the new commands to take
effect.

| Setting | Before | After |
|---|---|---|
| `rootDir` | `server` | *(removed — repo root)* |
| `buildCommand` | `npm ci && npm run build` | `npm ci && npm run build:shared && npm run build:server` |
| `startCommand` | `npm start` | `npm run start:server` |
| `healthCheckPath` | `/health` | unchanged |

`rootDir` had to go: with it set, Render runs `npm ci` inside `server/`, which no
longer has a lockfile.

### Verifying

Render's deploy log should show the install resolving three workspaces, then
`@dwcode/shared` building before `dwcode-server`, then the service binding its
port and `/health` returning 200.

---

## CI

[.github/workflows/main.yml](../../.github/workflows/main.yml) is already updated:

- `cache-dependency-path` → the root `package-lock.json`
- installs run at the root with `npm ci`
- a `Build shared package` step precedes typecheck/lint/test in both jobs
- the lockfile-hygiene check now asserts the root lockfile exists **and** that
  the per-package ones are gone (they would silently shadow the root otherwise)

---

## Local development

### ⚠️ First time after pulling REF-01: delete the old node_modules

**This one is not optional and the failure it causes is deeply confusing.**

```bash
rm -rf client/node_modules server/node_modules
npm install          # from the repo root
npm run build:shared
```

A checkout that installed before REF-01 has `client/node_modules/next` from the
old per-package install. The workspace install ALSO hoists `next` to
`node_modules/next` at the root. You then have two copies, and Node resolves the
stale one from `client/` while the CLI runs the hoisted one.

The symptom is not "duplicate package" — it is:

```
✓ Compiled successfully
Error [InvariantError]: Invariant: Expected workStore to be initialized.
                        This is a bug in Next.js.
Export encountered an error on /_global-error/page, exiting the build.
```

Two React/Next instances break the framework's internal module state. The message
blames Next.js; the cause is the duplicated install. Hit during REF-01 itself.

CI and fresh deploys are unaffected — they start from a clean checkout.

### Normal use

```bash
npm install          # once, from the repo root — installs all workspaces
npm run setup        # install + build the shared package
npm run dev          # builds shared, then starts client and server
```

`npm --prefix client install` no longer does what it used to. Always install from
the root.

If you see `Cannot find module '@dwcode/shared'`, the package has not been built:

```bash
npm run build:shared
```

### Turbopack / file tracing

`client/next.config.ts` pins `turbopack.root` and `outputFileTracingRoot` to the
REPO root. It previously pinned them to `client/`, which made Turbopack refuse to
resolve anything above that directory — `@dwcode/shared` then failed to resolve
in eleven files. Do not point these back at `client/`.

---

## Pre-deploy checklist

- [ ] Vercel: "Include source files outside of the Root Directory" **enabled**
- [ ] Vercel: a preview deploy succeeds before promoting to production
- [ ] Render: blueprint re-applied so the new build/start commands take effect
- [ ] Render: `/health` returns 200 after deploy
- [ ] CI green on the PR (it exercises the same install path)
- [ ] `DWL_BACKEND_URL` set explicitly in Vercel — the old default was a dead
      host and after SEC-05 that breaks **every submission**, not just the
      playground. See [audit W1-R9](../audit/README.md).

### Still staged, deliberately NOT run

These remain pending for the planned release window:

- `npm --prefix client run migrate:notes` — see [database-migrations.md](database-migrations.md)
- `npm --prefix client run indexes` — 14 indexes still missing in production
