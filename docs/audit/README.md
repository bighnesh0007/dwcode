# DWCode — Production Readiness Audit

> **Audit date** 2026-07-26 · **Commit** `5a91223` · **Branch** `master`
> **Scope** Full repository, excluding `node_modules`, `.git`, `.next`, `dist`, `coverage`, `build`, `.cache`
> **Method** Manual source review — all 34 Next.js route handlers, all Express routes and middleware, all 19 Mongoose models, both auth integrations, the OAuth flow, the markdown renderer, and every deployment config.
> **No application code was modified.** This audit is read-only by design.

---

## The three-sentence version

DWCode is a **feature-rich product on an unfinished foundation**: the feature
surface is genuinely impressive, and the `server/` package shows a correct picture
of where the architecture is meant to go — but the migration to it has barely
started, so 96% of traffic runs through Next.js API routes with no authorization
layer, no rate limiting, and no validation layer.

Six endpoints accept **unauthenticated writes to production data**, including
`DELETE /api/problems/:id`, which lets anyone on the internet delete the entire
problem bank with `curl`.

And the platform's core promise — ranked competitive DataWeave practice — is
currently unenforceable, because **grading runs in the browser** and the server
stores whatever verdict the client reports.

---

## Documents

| # | Document | Phase | What it answers |
|---|---|---|---|
| 1 | [Architecture Audit](01-architecture.md) | 1 | What exists, what works, what's broken, how it fits together |
| 2 | [Security Report](02-security.md) | 6 | 31 ranked findings with evidence and fixes |
| 3 | [Engineering Backlog](03-backlog.md) | 2 | 68 tasks with priority, files, effort, deps, acceptance criteria |
| 4 | [Testing Strategy](04-testing.md) | 3 | Unit / integration / E2E / security-regression plan |
| 5 | [Environments & Runtime](05-environments-runtime.md) | 4, 7 | Local/dev/prod, gateway choice, DataWeave sandbox |
| 6 | [Domains, DNS & TLS](06-domains-dns-tls.md) | 5 | Subdomain strategy, DNS records, certificate strategy |
| 7 | [Architecture Improvements](07-architecture-improvements.md) | 8 | Target layering and the migration path to it |
| 8 | [Product Roadmap](08-product-roadmap.md) | 9 | What to build, what not to build, how to measure it |

---

## Findings at a glance

### Security — 31 findings

| Severity | Count | Representative |
|---|---|---|
| 🔴 Critical | 5 | Unauthenticated `PUT`/`DELETE` on problems · browser-side grading |
| 🟠 High | 8 | Confirmed stored XSS · plaintext GitHub tokens · zero rate limiting · no CSP |
| 🟡 Medium | 11 | Mass assignment · prompt injection · TOCTOU races · info disclosure |
| 🟢 Low | 7 | Missing HSTS · no PR gating · CVE status unknown |

**24 of 31 are on the Next.js API surface.** That correlation is the whole story:
the Express side has authorization, validation, rate limiting and an error
envelope; the Next.js side re-implements security per route, or doesn't.

### Feature status — 30 features

**13 complete** · **8 partial** · **9 broken or missing**

Three that are declared but do not function:
- **Contest scoring** — `participants[].score` is in the schema and written by no code path
- **Notes** — unauthenticated *and* globally shared, not per-user
- **AI code review / learning paths** — named in the brief and README, not implemented

### Architecture

- Two backends against one database, with `Problem` and `Contest` **defined twice**
- Business rules (`SCORE_WEIGHTS`, `COIN_RULES`, `RANK_TIERS`) live on the server and are imported by nothing
- Seven of nine rate-limit policies are defined and applied to nothing
- The DataWeave execution sandbox — the component that runs untrusted code — **is not in this repository**

### What is genuinely well built

Worth stating plainly, because it shapes the recommendation: `server/src`
layering, [config/env.ts](../../server/src/config/env.ts),
[api/store](../../client/app/api/store/route.ts) (atomic debit with refund-on-race),
[blog voting](../../client/app/api/blog/[slug]/vote/route.ts) (correct
delta-derived counters), the frozen legacy contract with its contract test, and
**secret hygiene** — no `.env` has ever been committed, verified against full git
history.

The recommendation in [07-architecture-improvements.md](07-architecture-improvements.md)
is therefore *finish the second architecture*, not *design a third*.

---

## Implementation order

### 🔥 Week 1 — Stop the bleeding · ~4 days · ✅ **COMPLETE**

Nine small, independent, low-risk edits that close **every unauthenticated write
path** in the application.

| Task | Fixes | Status |
|---|---|---|
| [SEC-01](03-backlog.md#sec-01--require-authorization-on-problem-mutation) Auth on problem `PUT`/`DELETE` | [C-1](02-security.md#c-1--unauthenticated-problem-modification-and-deletion) | ✅ |
| [SEC-02](03-backlog.md#sec-02--authenticate-or-remove-post-apigenerate) Auth or delete `POST /api/generate` | [C-2](02-security.md#c-2--unauthenticated-ai-generation-on-the-platforms-gemini-key) | ✅ |
| [SEC-03](03-backlog.md#sec-03--scope-notes-to-their-owner) Scope notes to their owner | [C-3](02-security.md#c-3--unauthenticated-readwrite-of-every-users-notes) | ✅ |
| [SEC-04](03-backlog.md#sec-04--require-authentication-on-problem-creation) Auth on problem creation | [M-1](02-security.md#m-1--problem-creation-open-to-unauthenticated-callers) | ✅ |
| [SEC-05](03-backlog.md#sec-05--reject-client-supplied-submission-verdicts) Reject client verdicts | [C-4](02-security.md#c-4--client-side-grading--the-achievement-economy-is-forgeable) | ✅ |
| [SEC-06](03-backlog.md#sec-06--cap-and-gate-guest-progress-migration) Gate guest migration | [C-5](02-security.md#c-5--bulk-solve-forgery-via-guest-progress-migration) | ✅ |
| [SEC-07](03-backlog.md#sec-07--escape-quotes-in-the-markdown-renderer) Escape quotes in markdown *(interim)* | [H-1](02-security.md#h-1--stored-xss-via-attribute-injection-in-the-markdown-renderer) | ✅ |
| [OPS-01](03-backlog.md#ops-01--fix-the-container-base-image) `node:18` → `node:22` | [H-8](02-security.md#h-8--container-image-runs-an-eol-node-major-the-app-does-not-support) | ✅ |
| [OPS-02](03-backlog.md#ops-02--secure-the-local-mongodb-container) Secure local MongoDB | [H-7](02-security.md#h-7--mongodb-exposed-without-authentication-in-local-development) | ✅ |
| [TEST-01](03-backlog.md#test-01--regression-tests-for-every-p0-fix) Regression tests | — | ✅ |

**→ See the [Week 1 changelog](#week-1-changelog) below** for what changed,
deviations from the plan, and new risks found during implementation.

### 🏗 Weeks 2–3 — Foundations · ~8 days

Unblocks everything downstream. Run in parallel with Week 1 where possible.

[REF-01](03-backlog.md#ref-01--extract-shared-domain-types-and-constants) workspaces + shared package ·
[REF-02](03-backlog.md#ref-02--deduplicate-the-mongoose-models) dedupe models ·
[OPS-05](03-backlog.md#ops-05--provision-managed-redis) Redis ·
[PERF-02](03-backlog.md#perf-02--add-the-missing-indexes) indexes ·
[SEC-16](03-backlog.md#sec-16--error-envelope-and-log-hygiene) error envelope ·
[OPS-03](03-backlog.md#ops-03--gate-ci-on-pull-requests-and-add-security-jobs) CI gating

### ⭐ Weeks 4–7 — Server-side grading · ~10 days

[FEAT-01](03-backlog.md#feat-01--server-side-grading-service-) — **the keystone.**
Contest scoring, honest leaderboards, the coin economy, certificates and the whole
`/api/v1` migration all sit behind it.

Then [BUG-01](03-backlog.md#bug-01--contest-scoring-does-not-exist) contest scoring
and [PERF-01](03-backlog.md#perf-01--leaderboard-aggregation-and-indexes)
leaderboard aggregation, both of which become straightforward once grading is
trustworthy.

### 🛡 Weeks 8–10 — Harden · ~10 days

[SEC-11](03-backlog.md#sec-11--replace-the-markdown-renderer) real markdown sanitiser ·
[SEC-12](03-backlog.md#sec-12--encrypt-github-tokens-and-reduce-oauth-scope) encrypt GitHub tokens ·
[SEC-13](03-backlog.md#sec-13--rate-limiting-across-the-platform) rate limiting ·
[SEC-14](03-backlog.md#sec-14--content-security-policy) CSP ·
[SEC-15](03-backlog.md#sec-15--zod-validation-on-every-write-endpoint) zod validation ·
[REF-09](03-backlog.md#p2--next-quarter) RBAC module

### 🚀 Weeks 11–16 — Platform · ~20 days

[OPS-07](03-backlog.md#p2--next-quarter) own the DataWeave runtime ·
[OPS-08](03-backlog.md#p2--next-quarter) Traefik gateway ·
[OPS-06](03-backlog.md#p2--next-quarter) job queue ·
[OPS-09](03-backlog.md#p2--next-quarter) observability ·
[OPS-10](03-backlog.md#p2--next-quarter) staging ·
[REF-03](03-backlog.md#p2--next-quarter)–[REF-05](03-backlog.md#p2--next-quarter) API migration

### 📈 Month 4+ — Product

Per [08-product-roadmap.md](08-product-roadmap.md): curated problem set →
**certification prep** (the flagship) → learning paths → AI tutor → teams and
assessments.

---

## Milestones

| # | Milestone | When | Definition of done |
|---|---|---|---|
| **M0** | **No unauthenticated writes** ✅ | Week 1 | Every mutating endpoint returns 401/403 to an anonymous caller; regression tests pin it — **met, see [changelog](#week-1-changelog)** |
| **M1** | **Foundations in place** | Week 3 | One shared package; models defined once; Redis live; indexes present; CI gates PRs |
| **M2** | **Honest platform** ⭐ | Week 7 | Grading is server-side; a forged verdict cannot earn a coin, a rank, or a solve; contests score |
| **M3** | **Hardened** | Week 10 | No XSS; tokens encrypted; rate limits enforced; CSP live; every write validated |
| **M4** | **Operable** | Week 16 | Runtime owned and sandboxed; gateway live; staging exists; metrics, logs, traces and alerts in place |
| **M5** | **Production-ready** | Week 20 | 70% unit coverage; 100% of routes have authorization tests; E2E green; runbooks written; restore drill *performed* |
| **M6** | **Differentiated** | Month 6 | Certification prep shipped; curated problem set live; learning paths in beta |

**M2 is the one that matters.** Before it, DWCode is a demo with a scoreboard
anyone can edit. After it, it is a platform.

---

## Week 1 changelog

> Implemented 2026-07-26. **Verified:** `typecheck` ✅ · `lint` ✅ · 63/63 client
> tests ✅ · 58/58 server tests ✅ · `next build` ✅. Every regression test was
> mutation-checked — reverting the fix turns the test red.
>
> **`server/` was not touched.** All changes are in `client/`, plus three
> repo-root infrastructure files and one migration script.

### Decisions taken before implementation

Three tasks carried breaking changes and were escalated rather than assumed:

| Decision | Chosen | Rejected alternative |
|---|---|---|
| **Grading gap (SEC-05)** | Re-verify server-side **now** | Forcing `Attempted` for ~6 weeks until FEAT-01, which would have frozen the leaderboard and stopped all coin awards |
| **Existing notes (SEC-03)** | Discard, with a backup collection | Keeping ownerless rows readable by everyone |
| **Guest migration (SEC-06)** | Disable behind a flag | Capping and quarantining forged solves |

### What changed

| # | Files | Change |
|---|---|---|
| **SEC-01** | [problems/[id]/route.ts](../../client/app/api/problems/[id]/route.ts) | `requireAdmin()` on `PUT` and `DELETE`. Replaced `findByIdAndUpdate(id, rawBody)` with a 12-field allowlist (`MUTABLE_FIELDS`) applied via `$set`, so `createdBy`/`createdAt`/`createdByAI`/`_id` are no longer settable. `slug` is derived from `title`, never accepted from the caller; a collision now returns `409` instead of an unhandled E11000. Invalid ObjectIds return `404` rather than throwing. |
| **SEC-02** | [generate/route.ts](../../client/app/api/generate/route.ts) | `requireAdmin()` gate. `difficulty` validated against the schema enum, `category` length-capped, `topic` stripped of `` ` ``/`{}`/`<>`/`\` and capped at 120 chars (closes [M-2](02-security.md#m-2--prompt-injection-in-ai-problem-generation) prompt injection). Added a guard for model output with no usable `title`, which previously crashed the handler. |
| **SEC-03** | [notes/route.ts](../../client/app/api/notes/route.ts), [models/Note.ts](../../client/models/Note.ts), [001-scope-notes-to-user.mjs](../../scripts/migrations/001-scope-notes-to-user.mjs) | Auth required on both handlers. Added `userId`; dropped `unique` from `problemId`; added compound unique `{userId, problemId}`. Every query scoped by session `userId` on both filter **and** update, so an upsert cannot claim another user's row. Content capped at 20 KB. |
| **SEC-04** | [problems/route.ts](../../client/app/api/problems/route.ts) | Replaced the swallowed `try { auth() } catch {}` with a hard `401`. Added a `title` presence check (it was dereferenced unguarded). |
| **SEC-05** | **new** [lib/grading.ts](../../client/lib/grading.ts), [submissions/route.ts](../../client/app/api/submissions/route.ts), [Workspace.tsx](../../client/app/problems/[slug]/Workspace.tsx) | Grading moved from the browser to the server. Body is now `{problemId, code, input?}`; a body carrying `status` is **rejected with 400**, not ignored. Test cases are read from the database. Coins and the GitHub push are gated on the server's verdict. ~80 lines of grading logic deleted from `Workspace.tsx`. |
| **SEC-06** | [migrate-guest-progress/route.ts](../../client/app/api/migrate-guest-progress/route.ts), [lib/config.ts](../../client/lib/config.ts) | Gated behind `GUEST_MIGRATION_ENABLED` (default off) → `503`. Deliberately **not** a `NEXT_PUBLIC_` var, so it is not readable from the browser bundle. |
| **SEC-07** | [lib/markdown.ts](../../client/lib/markdown.ts) | Escape `'` and `"` in the first pass; validate link URLs with `new URL()` against an http(s) allowlist. The URL is decoded only for validation and emitted in escaped form, so `?a=1&b=2` still works. |
| **OPS-01** | [Dockerfile](../../Dockerfile) | `node:18-alpine` → `node:22-alpine`; `ENV KEY value` → `ENV KEY=value`; added `HEALTHCHECK`. |
| **OPS-02** | [docker-compose.yml](../../docker-compose.yml) | Pinned `mongo:8.0`, bound to `127.0.0.1`, root credentials required, healthcheck added, obsolete `version:` key removed. |
| **TEST-01** | **new** `client/__tests__/security/` ×3 | 47 regression tests: `markdown-xss` (16), `grading-integrity` (14), `access-control` (17). |

### Deviations from the plan

1. **SEC-02 — gated instead of deleted.** The backlog preferred deleting the
   route. Its only caller turned out to be the admin dashboard
   ([admin/page.tsx:111](../../client/app/admin/page.tsx#L111)), so it was always
   *intended* to be admin-only. Gating restores the intended contract with no
   functionality lost; deleting would have removed a working admin feature.

2. **SEC-05 — scope enlarged from ~3h to ~1d, by agreement.** The backlog
   specced an interim stopgap that forced `Attempted`. That would have stopped
   anyone solving a problem until FEAT-01. Server-side re-verification was built
   instead, so C-4 is genuinely closed rather than deferred.

3. **SEC-05 — grading semantics deliberately unchanged.** `lib/grading.ts`
   reproduces the browser's logic exactly: same JSON normalisation, same
   sequential order, same early-break on compiler error, same *visible* test
   cases. `hiddenTestCases` are still **not** executed. Running them would make
   problems genuinely harder than they were the day before — a product decision,
   not a security fix — and belongs to FEAT-01 with the warm compiler pool that
   makes 24 tests per submission affordable. No user's verdict changes as a
   result of Week 1.

4. **SEC-05 — anonymous submissions no longer accepted.** They previously saved
   with `userId: ""`, producing rows no feature could attribute and that the
   admin directory already had to filter out as "legacy anonymous". Now `401`.

5. **Two extra fixes folded in**, because they were one-line additions inside
   files already being rewritten: the [M-2](02-security.md#m-2--prompt-injection-in-ai-problem-generation)
   prompt-injection guard (SEC-02) and part of
   [H-5](02-security.md#h-5--mass-assignment-on-every-document-creating-route)
   mass assignment (SEC-01's allowlist). H-5 is **not** fully closed — the
   remaining `{...data}` spreads in `problems` POST and `generate-public` still
   need SEC-15.

### ⚠️ Required deployment actions

These are **not optional**. Deploying the code without them will break things.

1. **Run the notes migration before or with deploy:**
   ```bash
   node scripts/migrations/001-scope-notes-to-user.mjs --dry-run   # inspect first
   node scripts/migrations/001-scope-notes-to-user.mjs
   ```
   The old `problemId_1` unique index **must** be dropped. If it survives, the
   first user to save a note for a problem succeeds and every other user gets a
   duplicate-key error. Existing notes are copied to `notes_legacy_backup`, then
   deleted.

2. **Update local `MONGODB_URI`** in `client/.env.local` and `server/.env`:
   ```
   MONGODB_URI=mongodb://dwcode:dwcode-local-dev@127.0.0.1:27017/dwcode?authSource=admin
   ```
   `MONGO_INITDB_*` only provisions users on an empty data directory, so existing
   checkouts need `docker compose down -v` (**deletes local data**) before
   `docker compose up -d`.

3. **Do not set `GUEST_MIGRATION_ENABLED`** until FEAT-01 lands.

### New risks discovered during implementation

| # | Risk | Severity | Action |
|---|---|---|---|
| **W1-R1** | **Submissions now depend on the DataWeave compiler being up.** Grading runs on the request path, so a compiler outage turns every submit into `Error` — previously the browser absorbed this. Combined with Render free-tier cold starts (30–60s against a 15s timeout, [05-environments-runtime.md §7](05-environments-runtime.md#7-dataweave-runtime)), the first submit after an idle period will likely fail. | **High** | Raises the priority of [OPS-07](03-backlog.md#p2--next-quarter) (own the runtime). Consider a keep-warm ping as an immediate mitigation. |
| **W1-R2** | **Submit latency is now server-side and serial.** Up to 24 sequential compiler calls under a 25s budget. On Vercel, a submission approaching the budget may hit the platform's function timeout. | Medium | Parallelise at `concurrency: 3` per `LIMITS.grading` in FEAT-01; monitor p95 submit latency. |
| **W1-R3** | **The solution-viewed guard is still client-side only.** `solutionWasViewed` in `Workspace.tsx` is trivially bypassed; the server has no way to know. Now the *only* remaining client-trusted input in the submit path. | Medium | Track viewing server-side in FEAT-01. |
| **W1-R4** | **Anonymous users can no longer take notes.** Correct behaviour — notes were never meant to be global — but the problem page is public, so a signed-out visitor sees a notes box that silently does nothing. | Low | Add a "sign in to save notes" affordance. |
| **W1-R5** | **Grading limits are duplicated.** `MAX_TESTS`/`TOTAL_BUDGET_MS`/`MAX_CODE_LENGTH` in `lib/grading.ts` restate `LIMITS.grading` from [server/src/config/constants.ts](../../server/src/config/constants.ts), which the client cannot import until the repo becomes a workspace. | Low | Resolved by [REF-01](03-backlog.md#ref-01--extract-shared-domain-types-and-constants). Comment in the file flags it. |
| **W1-R6** | **`/api/execute` remains unauthenticated** and now duplicates the compiler-call logic in `lib/grading.ts`. Left untouched to keep the diff contained. | Medium | [SEC-18](03-backlog.md#sec-18--authenticate-and-quota-the-compiler-proxies) + [M-4](02-security.md#m-4--unauthenticated-compiler-proxies). |
| **W1-R7** | **Coin awards are still not idempotent under concurrency.** Two simultaneous accepted submissions can both read `prevAccepted === 0` and each award a first-solve bonus. Pre-existing, unchanged by Week 1, but now easier to trigger since verdicts are real. | Medium | Needs a conditional update or unique index in FEAT-01. |

### Feature pass — problems & blog (2026-07-26)

Plan: [docs/plans/problems-and-blog-improvements.md](../plans/problems-and-blog-improvements.md).
Scope chosen: dead-default fix + formatted I/O + gamification. Blog discussion and
the Expert tier deferred to the next pass (Expert tier gated behind REF-01 by
decision).

| Change | Detail |
|---|---|
| **🔴 Dead compiler default** | `lib/config.ts` fell back to `https://dwlbackend.onrender.com`, which **404s on every path** (verified — responds in ~1s, so alive but no longer serving). Repointed to `https://dataweave-playground-h1p7.onrender.com`, the upstream the server already uses successfully. Added a production warning when the var is unset. |
| **Formatted I/O** | New [lib/format.ts](../../client/lib/format.ts) — `formatPayload()` pretty-prints JSON, indents XML, leaves CSV/YAML/text alone, and **returns the input unchanged whenever it cannot parse**. Applied to problem examples (label above value, block `<pre>`), run output, submission history, and the seeded custom-input box. Display-only; grading is untouched. 22 tests including idempotence and JSON-semantics-preservation properties. |
| **Gamified problem list** | Difficulty-tinted left accent on unsolved rows, amber "In progress" chip on attempted, solved rows de-emphasised. Progress header showing *what is left* (`N to go`) plus per-difficulty counts. Shuffle now picks from **unsolved** problems. |

**Accessibility held to:** every status has a glyph **and** an `sr-only` label
(never colour-only, WCAG 1.4.1); the progress bar carries proper `role` and
`aria-value*`; the animated fill honours `prefers-reduced-motion`; solved titles
use `muted-foreground` rather than a low-contrast grey.

### 🔴 W1-R9 — the default compiler URL was dead

Worth calling out separately because of the interaction with Week 1.

Before SEC-05, a dead compiler broke the playground. **After** SEC-05 moved
grading onto the request path, it also makes **every submission return `Error`** —
the core product loop. Any deployment not explicitly setting `DWL_BACKEND_URL`
was silently pointed at a 404.

Fixed in code. **Action for the operator:** confirm `DWL_BACKEND_URL` is set
explicitly in the Vercel project rather than relying on the default, and confirm
the playground and a submission both work in production.

### REF-01 — single source of truth for difficulty (2026-07-26) ✅

**Verified:** shared build ✅ · client typecheck/lint/build ✅ · **125/125** client
tests ✅ · server typecheck/lint/build ✅ · 58/58 server tests ✅.

**⚠️ Deployment configuration is required before the next deploy — see
[docs/runbooks/deployment-prerequisites.md](../runbooks/deployment-prerequisites.md).**

#### What was built

`packages/shared` (`@dwcode/shared`) — a dependency-free package holding the
domain rules both halves need. The centrepiece is
[difficulty.ts](../../packages/shared/src/difficulty.ts): **one array of tier
objects**, each carrying id, label, order, `scoreWeight`, `coinReward`,
description and Tailwind classes. Everything else is derived — the Mongoose
enum, API validation, filter bars, badge colours, progress breakdowns, the AI
generator's vocabulary, and the contest scoring blurb.

**Adding `Master` or `Legendary` is now one array entry.**

#### Duplicates eliminated

| Was duplicated | Copies | Now |
|---|---|---|
| `SCORE_WEIGHTS` | `client/lib/ranks.ts` + `server/config/constants.ts` | registry-derived |
| Coin table | inline `diffCoins` in the submissions route + `COIN_RULES` server-side | `coinRewardFor()` |
| `DIFFICULTIES` | `api/generate`, `models/Problem`, `problems/page`, `create/page` ×2 | `DIFFICULTIES` / `DIFFICULTY_ENUM` |
| Colour ternaries | Workspace, problems list, contests ×2 | `difficultyClassName()` |
| `RANK_TIERS` | `client/lib/ranks.ts` + `server/config/constants.ts` | shared, client adds only colour/icon |
| Grading limits | hand-copied into `lib/grading.ts` (risk M1-R5) | `LIMITS` — **M1-R5 closed** |
| **Scoring prose** | `"Hard x5, Medium x3, Easy x1"` in the weekly-contest description | derived — a fifth copy, in text, that would have silently lied |

`server/src/config/constants.ts` now re-exports from the package, so every
existing server import kept working unchanged.

#### Three problems hit during the migration — worth recording

1. **Turbopack could not resolve the package.** `next.config.ts` pinned
   `turbopack.root` to `client/` — added originally because two lockfiles made
   root inference ambiguous. That pin blocked resolution above `client/`,
   failing the build in 11 files. Both that and `outputFileTracingRoot` now point
   at the repo root (correct, and unambiguous now there is one lockfile).

2. **Duplicate `next` install → a misleading "bug in Next.js".** A checkout that
   installed *before* workspaces keeps `client/node_modules/next`, while the
   workspace install hoists another copy to the root. Two framework instances
   produced:
   `Invariant: Expected workStore to be initialized. This is a bug in Next.js.`
   on `/_global-error`, *after* "Compiled successfully". The message blames
   Next.js; the cause is the stale tree. Fix is `rm -rf client/node_modules
   server/node_modules && npm install`. **Documented prominently in the runbook —
   anyone pulling this change will hit it.**

3. **Tailwind would have purged the registry's classes.** Tailwind v4 only
   generates classes it can see, and does not scan `node_modules`. Without an
   `@source` directive the difficulty colours would have vanished silently — the
   build would pass and the UI would render unstyled. Added
   `@source "../../packages/shared/src"` to `globals.css` and **verified against
   the emitted CSS bundle**: `before:bg-green-500`, `before:bg-yellow-500` and
   `before:bg-red-500` exist *only* in the registry and are all present.

#### New risks

| # | Risk | Severity | Action |
|---|---|---|---|
| **R1-R1** | **Deployment will break without config changes.** `npm ci` inside `client/`/`server/` no longer works (no lockfile there). Vercel additionally needs the dashboard-only "Include source files outside of the Root Directory". `render.yaml` is already updated but the blueprint must be **re-applied**. | **High** | [deployment-prerequisites.md](../runbooks/deployment-prerequisites.md) — operator action |
| **R1-R2** | Regenerating the lockfile drifted **8 direct client dependencies** within their caret ranges: `@clerk/nextjs` 7.5.7→7.6.1, `lucide-react` 1.21→1.27, `react-resizable-panels` 4.11→4.12, plus eslint/vitest/fast-check patches. All minor/patch; full suite passes. | Medium | Verified green; watch the first preview deploy |
| **R1-R3** | `@clerk/nextjs` 7.6.1 **deprecates `createRouteMatcher`**, citing the same weakness as W1-R8: middleware path-matching "can diverge from how Next.js routes requests and leave protected resources reachable". Suppressed with a comment, not ignored. Low risk today because every protected action enforces authorisation in its own handler (SEC-01…04) — the matcher only gates page *loads*. | Medium | New backlog item **[SEC-21](03-backlog.md#sec-21--move-page-protection-off-middleware-onto-the-resources)** |
| **R1-R4** | Per-tier config maps are now **partial** by type (`problemMix` in the weekly contest). Intentional — it is what lets a new tier avoid touching them — but a tier absent from such a map is silently not drawn. | Low | Documented at each site; backfill logic already covers it |

### Feature pass — Expert tier, content, discussion, reports (2026-07-26)

**Verified:** shared build ✅ · client typecheck/lint/build ✅ · **125/125** client
tests ✅ · server typecheck/lint/build ✅ · 58/58 server tests ✅.

#### Expert tier — REF-01 paid off

Adding the tier was **one entry** in
[packages/shared/src/difficulty.ts](../../packages/shared/src/difficulty.ts).
No other file changed. Verified propagating automatically to:
`DIFFICULTIES`, `DIFFICULTY_ENUM` (Mongoose), `SCORE_WEIGHTS` (8),
`COIN_REWARDS` (35), `isDifficulty`, badge/accent/text colours, the problems
filter bar, both create-page selectors, per-tier progress counts, the AI
generator's validation, and the weekly-contest scoring blurb.

The violet classes exist **only** in the registry and are present in the emitted
CSS — confirming `@source` keeps working for tiers added later, which was the
main thing that could have silently broken.

> **Naming note:** the difficulty `Expert` collides with the existing *rank*
> `Expert` (score ≥ 25). Different contexts — a problem badge vs a user badge —
> and Codeforces has the same overlap, so it is liveable. If you want it gone,
> rename the **rank**, not the difficulty: rank ids are computed from score and
> stored nowhere, whereas `problems.difficulty` is persisted and renaming it is a
> data migration.

#### 10 Expert problems — every expected output compiler-verified

[client/scripts/seed/expert-problems.ts](../../client/scripts/seed/expert-problems.ts)
holds the definitions; [seed-expert-problems.ts](../../client/scripts/seed-expert-problems.ts)
runs each reference solution against the live compiler and stores **what the
compiler actually produced**. Hand-written expected outputs are how a seeded
problem becomes unpassable — one difference in spacing or key order fails every
submission with no way for the solver to tell why.

**Dry run: 10/10 problems, 39 test cases verified.** The script refuses to write
unless all of them pass. Coverage: namespaced SOAP/XML, recursion, `reduce`
indexing, CSV with malformed rows, EDI/HL7 segments, two-level null-safe
grouping, dedup-latest-per-key, deep merge, money precision, dynamic key
reshaping. Each has 1 visible + 3 hidden cases (hidden ones activate with FEAT-01).

Every DataWeave script was validated against the compiler *before* being written
down, not after.

**Not yet run** — staged with the other release-window steps:
`npm --prefix client run seed:expert`.

#### Blog discussion

`Comment` generalised to `{ targetType, targetId }` so blog posts reuse the same
model, API, moderation and coin rules rather than growing a parallel
`BlogComment`. `<Comments>` now serves both surfaces.

Backwards-compatible throughout, per the migrations runbook:
- the API accepts **both** the new and the legacy `problemSlug` shape
- problem comments **dual-write** `problemSlug`
- the read query matches documents in either shape via `$or`, so existing
  discussions do not vanish mid-deploy
- migration 002 **retains** `problemSlug` and its index for rollback safety

**Migration 002 dry run: 25 comments to backfill, 0 orphans.** Not yet run.

#### Report a problem *(added mid-pass on request)*

New `ProblemReport` model, `/api/problems/report` (GET own / POST / admin PATCH),
and a collapsed report control on every problem page.

This matters more than it looks: until FEAT-01 executes hidden tests, a problem
with a wrong `expectedOutput` is **unpassable**, and the solver cannot tell
whether they are wrong or the problem is. Reports are the only signal that
separates the two.

- Authenticated only — an anonymous report queue is a spam queue
- **Partial** unique index on `{problemId, userId}` filtered to `status: "open"`,
  so a duplicate report is impossible while one is open but a user may report
  again if a resolved problem regresses. A plain unique index would block that
  forever.
- Duplicate submissions return `alreadyReported`, not a 500
- Reports are private moderation data, deliberately **not** merged into `Comment`

#### A bug I introduced and caught

`ReportProblem.tsx` is a client component and first imported its constants from
`models/ProblemReport.ts` — which imports Mongoose. That dragged `async_hooks`
and `child_process` into the browser bundle and failed the build with 24
module-not-found errors.

Fixed by extracting the vocabulary to [client/lib/reports.ts](../../client/lib/reports.ts),
which has no dependencies. **Rule worth remembering: never import a `models/*`
file from a `"use client"` component.**

#### Dependency note — Clerk 7.5.7 → 7.6.1

Picked up when REF-01 regenerated the lockfile (one of 8 caret-range bumps; see
R1-R2). It deprecates `createRouteMatcher` and its stated reason matches W1-R8:
*"Middleware-based auth checks rely on path matching, which can diverge from how
Next.js routes requests and leave protected resources reachable."*

Suppressed in [proxy.ts](../../client/proxy.ts) with a comment pointing at
**[SEC-21](03-backlog.md#sec-21--move-page-protection-off-middleware-onto-the-resources)**,
kept as a separate task rather than folded into this work. Low risk today: every
protected *action* enforces authorisation in its own handler (SEC-01…04), so the
matcher only gates page loads.

#### New risks

| # | Risk | Severity | Action |
|---|---|---|---|
| **F2-R1** | Migration 002 and the Expert seed are **staged, not run** — as are the notes migration and index creation. Four pending steps now share one release window; running them out of order (seed before the difficulty enum ships) would fail validation. | Medium | Ordering documented in [database-migrations.md](../runbooks/database-migrations.md) |
| **F2-R2** | Seeded problems are only as good as the reference solutions. Verification proves a solution is self-consistent, **not** that the problem is well-posed or the intended difficulty. | Low | The new report feature is exactly this feedback channel |
| **F2-R3** | `Comment` now carries both `targetId` and `problemSlug` with two overlapping indexes. Intentional for rollback safety, but it is duplication with a shelf life. | Low | Drop in a follow-up migration once no deployed code reads `problemSlug` |
| **F2-R4** | Report queue has an API but **no admin UI** — reports will accumulate unseen until one is built. | Medium | `GET /api/problems/report?status=open` works today; UI is a follow-up |

### 🔴 F2-R5 — Mongoose `autoIndex` silently wrote to production

Found while confirming nothing had been run against the database. It had been —
just not by me.

**`client/lib/db.ts` never set `autoIndex`, and Mongoose defaults it to `true`.**
Loading a model therefore builds every index its schema declares, against
whatever `MONGODB_URI` points at, whenever the process starts. This repo's
`.env.local` points at **production Atlas**, and a local `next dev` was running
(ports 8000 and 4000 both listening).

Result: **13 of the 14 PERF-02 indexes were created in production** the moment
the new schemas were saved — outside the controlled `npm run indexes` step, at an
uncontrolled moment.

Additive indexes are mostly benign. The dangerous part is the **half-migrated
`notes` collection**:

```
problemId_1            UNIQUE   ← stale; migration 001 must drop it
userId_1_problemId_1   UNIQUE   ← created by autoIndex
```

autoIndex created the new index but **cannot drop the old one**. That is exactly
the state the migration runbook warns about: deploy the per-user notes code now
and the first user to save a note for a problem succeeds while every other user
gets a duplicate-key error.

**Fixed** — `lib/db.ts` now defaults `autoIndex` to `false` (opt back in with
`MONGOOSE_AUTO_INDEX=true` against a scratch database), mirroring what
[server/src/db/connection.ts](../../server/src/db/connection.ts) already did.

**Two things follow for the release:**

1. **Migration 001 is now more urgent, not less.** It remains correct and
   idempotent — it drops `problemId_1` and re-creates the compound index — but
   production is currently in the broken intermediate state, so the notes code
   must not ship before it runs.
2. **A dev server pointed at production is the underlying hazard**, not just
   autoIndex. The local-Mongo procedure in
   [local-mongo-auth.md](../runbooks/local-mongo-auth.md) §4 is the fix; this is
   the concrete argument for doing it.

### Finding status after Week 1

| Finding | Before | After |
|---|---|---|
| [C-1](02-security.md#c-1--unauthenticated-problem-modification-and-deletion) unauthenticated problem write | 🔴 Critical | ✅ Closed |
| [C-2](02-security.md#c-2--unauthenticated-ai-generation-on-the-platforms-gemini-key) unauthenticated AI generation | 🔴 Critical | ✅ Closed |
| [C-3](02-security.md#c-3--unauthenticated-readwrite-of-every-users-notes) global unauthenticated notes | 🔴 Critical | ✅ Closed *(migration required)* |
| [C-4](02-security.md#c-4--client-side-grading--the-achievement-economy-is-forgeable) client-side grading | 🔴 Critical | ✅ Closed for visible tests; hidden tests → FEAT-01 |
| [C-5](02-security.md#c-5--bulk-solve-forgery-via-guest-progress-migration) bulk solve forgery | 🔴 Critical | ✅ Closed *(feature disabled)* |
| [M-1](02-security.md#m-1--problem-creation-open-to-unauthenticated-callers) anonymous problem creation | 🟡 Medium | ✅ Closed |
| [M-2](02-security.md#m-2--prompt-injection-in-ai-problem-generation) prompt injection | 🟡 Medium | ✅ Closed |
| [H-1](02-security.md#h-1--stored-xss-via-attribute-injection-in-the-markdown-renderer) stored XSS | 🟠 High | 🟡 Mitigated — real sanitiser is [SEC-11](03-backlog.md#sec-11--replace-the-markdown-renderer) |
| [H-5](02-security.md#h-5--mass-assignment-on-every-document-creating-route) mass assignment | 🟠 High | 🟡 Partial — `problems/[id]` only; rest is [SEC-15](03-backlog.md#sec-15--zod-validation-on-every-write-endpoint) |
| [H-7](02-security.md#h-7--mongodb-exposed-without-authentication-in-local-development) exposed local Mongo | 🟠 High | ✅ Closed |
| [H-8](02-security.md#h-8--container-image-runs-an-eol-node-major-the-app-does-not-support) EOL Node base image | 🟠 High | ✅ Closed |

**7 of 8 findings tagged for Week 1 are fully closed; 2 are deliberately partial
with named follow-ups.** All five Criticals are no longer exploitable.

**Milestone M0 — "no unauthenticated writes" — is met.** Every mutating endpoint
now rejects anonymous callers, and the regression suite fails if any guard is
removed.

---

## M1 changelog (in progress)

> Started 2026-07-26, immediately after Week 1. **Verified after each step:**
> `typecheck` ✅ · `lint` ✅ · 63/63 client tests ✅.

### Deployment actions — resolved

| Action | Outcome |
|---|---|
| Notes migration | **Dry-run only. Deliberately NOT executed.** See below. |
| Local `MONGODB_URI` | **Not changed.** Documented procedure written instead. See below. |
| `GUEST_MIGRATION_ENABLED` | ✅ Verified absent from all env and deploy config → endpoint returns `503`. |

**Two facts changed the plan.** Both env files point at **MongoDB Atlas
production**, not localhost — the "local MONGODB_URI" framing did not match
reality. And the local Mongo on `127.0.0.1:27017` is a *separate*, currently
**unauthenticated** instance holding a `dwcode` database with 10 collections.

- **Migration deferred to the release window.** Production still runs the old
  code, which reads the 10 notes the migration deletes. Running it now would
  remove real user data with no compensating benefit until deploy. Dry-run
  confirms the expected state (`10 total, 0 already scoped, 10 legacy`;
  `problemId_1` present). Sequenced in
  [docs/runbooks/database-migrations.md](../runbooks/database-migrations.md).
- **Local Mongo left untouched.** Adopting the hardened compose file needs
  `docker compose down -v`, which would destroy those 10 local collections.
  A dump → recreate → restore procedure is documented in
  [docs/runbooks/local-mongo-auth.md](../runbooks/local-mongo-auth.md) for the
  operator to run (I have no Docker access from this environment).
- The migration script moved to `client/scripts/migrations/` — ESM resolves
  dependencies from the script's own directory upward, and `mongoose` is a client
  dependency; the repo root only has `concurrently`.

### Completed

| Task | Change |
|---|---|
| **OPS-07 plan** | [09-runtime-ownership.md](09-runtime-ownership.md) — health checks, keep-warm, retries + circuit breaker, resource limits, monitoring, 6-phase migration. **Raised P2 → P1.** Phase A (1.5d) is separable and should ship *before* Week 1 reaches production. |
| **W1-R7** | Folded into [FEAT-01](03-backlog.md#feat-01--server-side-grading-service-) with an explicit atomic-award design: unique index on the award ledger + conditional `findOneAndUpdate`, treat `E11000` as "already awarded". Acceptance criterion now requires a **concurrent** duplicate-submit test. |
| **PERF-02** | 14 indexes declared across 8 models, each justified by an observed query. Removed a redundant duplicate index declaration on `PlaygroundSnippet.slug`. New `npm --prefix client run indexes` script imports the schemas (single source of truth) and **exits non-zero on drift** so CI can gate it. |
| **OPS-03** | `pull_request` trigger added (checks previously ran only *after* merge). New `dependencies` job (`npm audit`) and `image` job that builds the Dockerfile and asserts its Node major satisfies `engines` — the exact drift that produced H-8. |
| **REF-07** | [lib/config.ts](../../client/lib/config.ts) rewritten as the client's single validated config module, mirroring [server/src/config/env.ts](../../server/src/config/env.ts): all issues reported at once, capability gating, fail-fast on the server. Existing export names unchanged, so no call site moved. |

**Correction to the audit:** [L-6](02-security.md#-low) said CI had "no secret
scanning". That was wrong — a `security` job already checks for tracked env/key
files and committed live API keys. The real gaps were the `pull_request` trigger,
`npm audit`, and the image build, and those are now closed.

### 🔴 NEW FINDING — W1-R8: real CVEs in the production dependency tree

[L-7](02-security.md#-low) recorded dependency CVE status as **unknown** because
no Node runtime was available during the audit. It is now known, and it is not
clean.

**Client production tree: 15 advisories (6 high, 9 moderate).**
**Server production tree: 1 moderate.**

The one that matters most:

> **`next` 16.2.9 — "Middleware / Proxy bypass in App Router applications using
> Turbopack and single locale" (HIGH).**
>
> This app's page-level authorization *is* middleware:
> [client/proxy.ts](../../client/proxy.ts) is what gates `/admin`, `/create`,
> `/profile` and `/blog/new`. The app also runs Turbopack
> ([next.config.ts](../../client/next.config.ts)). A proxy bypass in this
> configuration is directly applicable, not theoretical.
>
> Mitigating factor: the API routes behind those pages do their own server-side
> checks (`requireAdmin()`, `auth()`), which Week 1 strengthened. So this is a
> **page-guard** bypass, not a data-access bypass. Fixed in `next@16.2.12`.

| Severity | Package | Direct | Issue |
|---|---|---|---|
| **HIGH** | `next` | ✅ | Middleware/Proxy bypass (App Router + Turbopack); Server Actions DoS |
| **HIGH** | `postcss` | via next | XSS via unescaped `</style>`; arbitrary file read via `sourceMappingURL` |
| **HIGH** | `sharp` | via next | libvips CVE-2026-33327/33328/35590/35591 |
| **HIGH** | `brace-expansion` | transitive | DoS — exponential expansion, OOM |
| **HIGH** | `fast-uri` | transitive | Host confusion via backslash authority / IDN canonicalisation |
| **HIGH** | `js-yaml` | transitive | Quadratic CPU via merge-key chains |
| **MOD** | `mongoose` 9.7.1 | ✅ **both packages** | **Prototype pollution in update casting via `__proto__`-prefixed dotted paths** |
| **MOD** | `dompurify` | via monaco | XSS; `FORBID_TAGS` bypass |
| **MOD** | `@google/genai` → `@modelcontextprotocol/sdk` → `hono` | ✅ | Path traversal; cross-request context disclosure |
| **MOD** | `protobufjs` | transitive | DoS via infinite loop |

**The mongoose advisory compounds an existing finding.** Prototype pollution via
`__proto__`-prefixed dotted paths is reachable through exactly the pattern
[H-5](02-security.md#h-5--mass-assignment-on-every-document-creating-route)
describes — `findByIdAndUpdate(id, rawBody)` and `new Model({...body})`. Week 1's
SEC-01 removed that pattern from `problems/[id]`, and the Express side strips
`$`-prefixed and dotted keys via `sanitizeBody`. But `problems` POST and
`generate-public` still spread raw input on the client side, where no such
stripping exists. **This raises the priority of
[SEC-15](03-backlog.md#sec-15--zod-validation-on-every-write-endpoint).**

**Resolution — upgrades applied** (decision: apply both now):

| Package | Before | After | Clears |
|---|---|---|---|
| `next` (client) | 16.2.9 | **16.2.12** | Middleware/Proxy bypass, Server Actions DoS, plus the `sharp` and `postcss` chains |
| `eslint-config-next` (client) | 16.2.9 | **16.2.12** | keeps the lint config aligned with the framework version |
| `mongoose` (client) | ^9.7.1 | **^9.8.0** | prototype pollution in update casting |
| `mongoose` (server) | 9.7.1 | **9.8.0** | same |

Patch and minor only — no major bumps, and `npm audit fix` was run **without**
`--force` so nothing outside a stated dependency range was pulled in.

**Verified after upgrading:** client typecheck ✅ · lint ✅ · 63/63 tests ✅ ·
`next build` ✅ (53 routes) · server typecheck ✅ · lint ✅ · 58/58 tests ✅ ·
build ✅.

**Result:**

| Tree | Before | After |
|---|---|---|
| server production | 1 moderate | **0 vulnerabilities** |
| client production | 15 (6 high, 9 moderate) | 9 (3 high, 5 moderate, 1 low) |

**The Next.js middleware/proxy bypass and Server Actions DoS are fixed** —
`next` at 16.2.12 carries no direct advisory. The three remaining HIGHs are
`postcss` and `sharp` **bundled inside Next.js**, plus `next` itself flagged only
as their parent.

**They have no forward fix: 16.2.12 is the newest published 16.x.** npm's only
suggested remedy is `next@9.3.3` — a downgrade from Next 16 to Next 9, which
would destroy the application. This is why `--force` was not used.

Neither is reachable in this app's configuration:

- **`postcss`** — the advisory is XSS via an unescaped `</style>` in the CSS
  stringifier, which needs attacker-controlled CSS. PostCSS runs at build time
  over this repo's own Tailwind sources only.
- **`sharp`** — the libvips CVEs are reached through `next/image` *optimization*.
  Every `<Image>` in the app passes `unoptimized`, and `next.config.ts` declares
  no `images.remotePatterns`, so the optimizer never touches a user-supplied
  image. **Re-check if `unoptimized` is ever removed.**

Rather than weaken the CI gate or leave it permanently red, these are recorded as
**expiring risk acceptances** in [scripts/audit-gate.mjs](../../scripts/audit-gate.mjs) —
each with a justification, a reference, and an expiry of **2026-10-31**, after
which CI fails again and forces a re-review.

### Deferred by decision — REF-01 / REF-02

Workspaces and the shared package are **not** done, and that is deliberate.
REF-01 cannot be implemented without changing deployment: Vercel installs with
`Root Directory = client` and Render with `rootDir = server`, so neither would
see a workspace sibling package. Vercel additionally needs "Include source files
outside of the Root Directory" enabled — a dashboard setting, not something
expressible in `vercel.json`.

Since neither platform can be tested from this environment, M1 was kept
deploy-neutral. Consequences carried forward:

- `Problem` and `Contest` remain defined **twice** ([client/models/](../../client/models/) and [server/src/models/](../../server/src/models/)) against the same collections
- `SCORE_WEIGHTS`, `COIN_RULES`, `RANK_TIERS`, `LIMITS` remain server-side only, restated by hand where the client needs them (`lib/grading.ts` documents its copies)
- **REF-02 is blocked on REF-01**, and [FEAT-01](03-backlog.md#feat-01--server-side-grading-service-) lists REF-01 as a dependency

### New risks

| # | Risk | Severity | Action |
|---|---|---|---|
| **W1-R8** | Real CVEs in the production tree, incl. a Next.js middleware bypass affecting the app's page-auth guard | **High** | ✅ **Resolved** — upgrades applied and verified |
| **M1-R1** | The new `dependencies` CI job would have gone red on its first run — correctly, because W1-R8 was real | Medium | ✅ Resolved by the upgrades; job should now pass |
| **M1-R2** | Index creation is **not** applied to production. 14 indexes are declared in code but absent in Atlas, so the queries they target are still collection scans. | Medium | `npm --prefix client run indexes` added to the release runbook alongside the migration |
| **M1-R3** | `tsx` added as a client devDependency so ops scripts can import the app's Mongoose schemas rather than restating them. Dev-only; already used by `server/`. | Low | Accepted |
| **M1-R4** | `lib/config.ts` now **throws at import time** on the server for a malformed value. That is intended (a bad deploy should fail completely rather than 500 per-request), but it means a typo in `DWL_BACKEND_URL` takes the app down at boot instead of degrading. Absent values only warn, so `next build` without secrets still succeeds. | Low | Accepted — documented in the file header |
| **M1-R5** | Duplicated grading limits: `MAX_TESTS` / `TOTAL_BUDGET_MS` / `MAX_CODE_LENGTH` in `lib/grading.ts` restate `LIMITS.grading`. Unresolved because REF-01 is deferred. | Low | Resolved by REF-01 when it lands |
| **M1-R6** | **Playground live compile (Phase 1) shipped**, making ~1 req/s/tab the designed behaviour of the still-unrated `POST /api/transform`. Mitigated client-side (default OFF, failure backoff, visibility pause, unchanged-input skip, `429` handling), but the server-side limit is still outstanding. | Medium | [FEAT-09](03-backlog.md#feat-09--live-compile-phase-2--rate-limit-the-compiler-proxies-️) — blocked on OPS-05 (Redis) |

---

## Effort summary

| Track | Days |
|---|---|
| Security (P0 + P1) | ~18 |
| Architecture and migration | ~64 |
| Testing | ~21 |
| DevOps and infrastructure | ~25 |
| **Total to M5** | **~128 engineer-days** |

At one engineer: ~6 months. At two: ~3 months. At three, with the parallelism the
[critical path](03-backlog.md#critical-path) allows: ~10 weeks.

---

## Constraints honoured

The brief set four constraints. For the record:

- ✅ **No code changed before the audit completed.** This directory contains
  documentation only; no application file was modified.
- ✅ **Secure, maintainable, production-ready solutions preferred** — including
  recommending Traefik over the more familiar NGINX, and *finishing* the existing
  server architecture rather than proposing a fashionable rewrite.
- ✅ **Existing functionality preserved.** No fix in this backlog removes a
  feature. Where behaviour must change (client-side grading, global notes), the
  user-visible capability is retained and only its enforcement moves server-side.
  The frozen legacy contract stays frozen.
- ✅ **Trade-offs explained before implementation** — see
  [07-architecture-improvements.md §7](07-architecture-improvements.md#7-trade-offs-worth-stating-plainly)
  and the gateway justification in
  [05-environments-runtime.md §3](05-environments-runtime.md#3-gateway-which-technology).

### Known gaps in this audit

Stated plainly rather than buried:

1. **No dependency CVE scan.** `npm audit` could not run — no Node/npm binary was
   available in the audit environment. Nothing here should be read as "no known
   vulnerabilities," only as "not checked." Filed as
   [L-7](02-security.md#-low) / [OPS-03](03-backlog.md#ops-03--gate-ci-on-pull-requests-and-add-security-jobs).
2. **The DataWeave runtime could not be reviewed.** It is not in this repository.
   Phase 7's questions about isolation, cgroups, and container escape are
   unanswerable from here — which is itself the most important Phase 7 finding.
   See [05-environments-runtime.md §7](05-environments-runtime.md#7-dataweave-runtime).
3. **No runtime testing.** Findings are from source review. The one exception is
   [H-1](02-security.md#h-1--stored-xss-via-attribute-injection-in-the-markdown-renderer),
   which was verified by executing the renderer's transformation against a
   crafted payload. A penetration test against a live staging environment should
   follow M3.
4. **No load testing.** Performance findings
   ([M-9](02-security.md#m-9--unauthenticated-full-collection-scans),
   [PERF-01](03-backlog.md#perf-01--leaderboard-aggregation-and-indexes)) are
   derived from query shape and missing indexes, not measurement.
