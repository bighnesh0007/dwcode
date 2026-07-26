# DWCode — Engineering Backlog (Phase 2)

> Derived from [01-architecture.md](01-architecture.md) and [02-security.md](02-security.md).
> 68 tasks · estimated **~74 engineer-days** for P0–P2.

## How to read this

| Field | Meaning |
|---|---|
| **Priority** | P0 = ship now (active exploit path) · P1 = this sprint · P2 = next quarter · P3 = backlog |
| **Difficulty** | XS ≤1h · S ≤4h · M ≤1d · L 2–4d · XL 1–2w |
| **Deps** | Task IDs that must land first |

**Category prefixes:** `SEC` security · `BUG` defect · `PERF` performance ·
`REF` refactor · `FEAT` feature · `TEST` testing · `DOC` documentation ·
`OPS` devops.

### Estimate by priority

| Priority | Tasks | Effort |
|---|---|---|
| P0 | 9 | ~4 days |
| P1 | 22 | ~26 days |
| P2 | 24 | ~44 days |
| P3 | 13 | not estimated |

---

## P0 — Ship now

> Every P0 closes an **unauthenticated** path to production data. They are small,
> independent, and can land in a single afternoon by one engineer. Do these before
> anything else in this document.

### SEC-01 · Require authorization on problem mutation
- **Category** Security (fixes [C-1](02-security.md#c-1--unauthenticated-problem-modification-and-deletion)) · **Priority** P0 · **Difficulty** S · **Est** 2h · **Deps** —
- **Files** [client/app/api/problems/[id]/route.ts](../../client/app/api/problems/[id]/route.ts)
- **Do** Add `requireAdmin()` to `PUT` and `DELETE`. Replace `findByIdAndUpdate(id, data)` with an explicit allowlisted field map.
- **Accept**
  - `PUT`/`DELETE` without a session → `401`; with a non-admin session → `403`
  - Body fields outside the allowlist are ignored, not persisted
  - `slug` is regenerated only when `title` changes, and collisions return `409`
  - Regression test covers all three status codes

### SEC-02 · Authenticate or remove `POST /api/generate`
- **Category** Security (fixes [C-2](02-security.md#c-2--unauthenticated-ai-generation-on-the-platforms-gemini-key)) · **Priority** P0 · **Difficulty** S · **Est** 2h · **Deps** —
- **Files** [client/app/api/generate/route.ts](../../client/app/api/generate/route.ts)
- **Do** Preferred: **delete the route** — [generate-public](../../client/app/api/generate-public/route.ts) supersedes it with a BYO-key model. If it must stay, require `requireAdmin()` and a per-user daily cap.
- **Accept**
  - No unauthenticated path reaches `GoogleGenAI` on the platform key
  - `grep -rn "api/generate\"" client/` shows no remaining callers if deleted
  - Gemini spend attributable to a user id in logs

### SEC-03 · Scope notes to their owner
- **Category** Security + Bug (fixes [C-3](02-security.md#c-3--unauthenticated-readwrite-of-every-users-notes)) · **Priority** P0 · **Difficulty** M · **Est** 4h · **Deps** —
- **Files** [client/app/api/notes/route.ts](../../client/app/api/notes/route.ts), [client/models/Note.ts](../../client/models/Note.ts), migration script
- **Do** Require auth. Drop `unique` on `problemId`; add compound unique `{userId, problemId}`. Scope every query by session `userId`.
- **Accept**
  - Anonymous `GET`/`PUT` → `401`
  - User A cannot read or write user B's note for the same problem (integration test)
  - Migration decides existing ownerless notes explicitly (documented: discard or assign)
  - Old `problemId_1` unique index dropped in the migration, not left behind

### SEC-04 · Require authentication on problem creation
- **Category** Security (fixes [M-1](02-security.md#m-1--problem-creation-open-to-unauthenticated-callers)) · **Priority** P0 · **Difficulty** XS · **Est** 1h · **Deps** —
- **Files** [client/app/api/problems/route.ts](../../client/app/api/problems/route.ts)
- **Do** Replace the swallowed `try { auth() } catch {}` with a hard `401`.
- **Accept** Anonymous `POST` → `401`; `createdBy` is never `""` on new documents.

### SEC-05 · Reject client-supplied submission verdicts
- **Category** Security (mitigates [C-4](02-security.md#c-4--client-side-grading--the-achievement-economy-is-forgeable)) · **Priority** P0 · **Difficulty** S · **Est** 3h · **Deps** —
- **Files** [client/app/api/submissions/route.ts](../../client/app/api/submissions/route.ts)
- **Do** **Interim stopgap while FEAT-01 is built.** Stop paying out on a client-declared status: persist the submission but force `status: "Attempted"` unless a server-side grade exists. Gate coin awards and GitHub push behind a server grade.
- **Why interim** Real fix is FEAT-01. This stops the bleeding in hours instead of weeks.
- **Accept**
  - `POST` with `status:"Accepted"` awards zero coins and does not increment solved count
  - Existing UI still records attempts without a crash
  - Documented as temporary, linked to FEAT-01

### SEC-06 · Cap and gate guest-progress migration
- **Category** Security (fixes [C-5](02-security.md#c-5--bulk-solve-forgery-via-guest-progress-migration)) · **Priority** P0 · **Difficulty** S · **Est** 2h · **Deps** —
- **Files** [client/app/api/migrate-guest-progress/route.ts](../../client/app/api/migrate-guest-progress/route.ts)
- **Do** Disable the endpoint (feature-flag off) until FEAT-01 can re-grade claims. If it must stay live: cap `slugs.length ≤ 50`, one call per user lifetime, and record migrated solves with a distinct `source: "migrated"` excluded from the leaderboard.
- **Accept** Bulk forgery is not reachable; migrated rows are distinguishable in the data.

### SEC-07 · Escape quotes in the markdown renderer
- **Category** Security (mitigates [H-1](02-security.md#h-1--stored-xss-via-attribute-injection-in-the-markdown-renderer)) · **Priority** P0 · **Difficulty** XS · **Est** 1h · **Deps** —
- **Files** [client/lib/markdown.ts](../../client/lib/markdown.ts)
- **Do** **Interim stopgap while SEC-11 is built.** Add `.replace(/'/g,"&#39;").replace(/"/g,"&quot;")` to the escape pass, and validate the captured link URL with `new URL()` against an `http:`/`https:` allowlist.
- **Accept**
  - `[x](https://e.com'onmouseover='location=name)` renders with no `onmouseover` attribute
  - Unit test asserts the exploit string from [H-1](02-security.md#h-1--stored-xss-via-attribute-injection-in-the-markdown-renderer) is inert
  - Existing markdown fixtures still render identically

### OPS-01 · Fix the container base image
- **Category** DevOps (fixes [H-8](02-security.md#h-8--container-image-runs-an-eol-node-major-the-app-does-not-support)) · **Priority** P0 · **Difficulty** XS · **Est** 1h · **Deps** —
- **Files** [Dockerfile](../../Dockerfile)
- **Do** `node:18-alpine` → `node:22-alpine`; convert `ENV KEY value` → `ENV KEY=value`; add `HEALTHCHECK`.
- **Accept** `docker build .` succeeds; the container serves `/` on the mapped port; no deprecation warnings.

### OPS-02 · Secure the local MongoDB container
- **Category** DevOps (fixes [H-7](02-security.md#h-7--mongodb-exposed-without-authentication-in-local-development)) · **Priority** P0 · **Difficulty** XS · **Est** 1h · **Deps** —
- **Files** [docker-compose.yml](../../docker-compose.yml), [README.md](../../README.md)
- **Do** Bind `127.0.0.1:27017:27017`; pin `mongo:8.0`; set `MONGO_INITDB_ROOT_USERNAME`/`_PASSWORD`; add a healthcheck; drop the obsolete `version:` key.
- **Accept** Mongo is unreachable from another host on the LAN; README documents the new connection string.

---

## P1 — This sprint

### OPS-07 · Own the DataWeave runtime ⬆️ **raised P2 → P1**
- **Category** DevOps + Reliability · **Priority** P1 · **Difficulty** XL · **Est** 10d · **Deps** — (Phase A has none)
- **Why raised** Week 1's SEC-05 put the compiler on the **critical request path**. An outage now fails every submission and persists `Error` against the user. The runtime is a third-party Render free-tier service that sleeps after 15 min and takes 30–60s to wake, against a 15s timeout — so the first submission after any quiet period fails by arithmetic ([W1-R1](README.md#new-risks-discovered-during-implementation)).
- **Full plan** → [09-runtime-ownership.md](09-runtime-ownership.md)
- **Phase A is urgent and separable (1.5d)** — keep-warm pinger, availability alert, circuit breaker, and distinguishing infrastructure failure from user error so downtime stops polluting submission history. **Ship Phase A before Week 1 reaches production.**
- **Accept (Phase A)**
  - No cold-start timeout observed over 48h of monitoring
  - Runtime unavailability returns `503` and persists **no** submission
  - Circuit breaker opens after 5 consecutive failures and fails fast
  - Alert fires within 60s of the runtime going down
- **Accept (B–F)** Runtime in-repo and version-pinned · byte-identical output over a golden corpus · shadow-run diff clean · no network egress from the sandbox · all `LIMITS.grading` values enforced · metrics and a correctness canary live

### FEAT-01 · Server-side grading service ⭐
- **Category** Feature + Security (fixes [C-4](02-security.md#c-4--client-side-grading--the-achievement-economy-is-forgeable), [C-5](02-security.md#c-5--bulk-solve-forgery-via-guest-progress-migration)) · **Priority** P1 · **Difficulty** XL · **Est** 8d · **Deps** SEC-05 ✅, REF-01
- **Note** SEC-05 landed in Week 1 and already closed C-4 for visible test cases. FEAT-01's remaining scope is: hidden-test execution, the warm compiler pool, `LIMITS.grading` concurrency, and the items below.
- **Files** new `server/src/services/grading/`, `server/src/routes/v1/submission.routes.ts`, `server/src/repositories/submission.repository.ts`; rewrite [Workspace.tsx](../../client/app/problems/[slug]/Workspace.tsx) submit path
- **Why** This is the keystone task. Until it lands, the leaderboard, coins, ranks, streaks and contests are all decorative, and the product's core claim — ranked competitive DataWeave practice — is unenforceable.
- **Do**
  - `POST /api/v1/submissions` accepting `{ problemId, code }` **only**
  - Server loads `testCases` **and** `hiddenTestCases`, executes via the sandbox, compares with the same normalisation the client used
  - Honour [`LIMITS.grading`](../../server/src/config/constants.ts): `maxTests: 24`, `totalBudgetMs: 25_000`, `concurrency: 3`
  - Server computes the verdict, writes the submission, awards from `COIN_RULES`
  - Apply the `submission` rate-limit policy (12/min/user)
  - Client posts code and renders the returned per-test results
- **Must also fix — [W1-R7](README.md#new-risks-discovered-during-implementation): coin awards are not idempotent under concurrency.**
  Two simultaneous accepted submissions can both read `prevAccepted === 0` and each award a first-solve bonus. This is a read-then-write race, and Week 1 made it easier to trigger by making verdicts real. Fix it the same way [api/store](../../client/app/api/store/route.ts) already handles the debit side — with an atomic conditional update, not a check followed by a write:
  - Add a unique index on `{ userId, problemId, type: "first_solve" }` over an award-ledger collection (or on `UserCoins.transactions` via a dedicated `awards` collection), so a duplicate first-solve insert is rejected by the database rather than prevented by application logic.
  - Award via a single conditional `findOneAndUpdate` / `insertOne` and treat `E11000` as "already awarded", not as an error.
  - **Never** gate an award on a prior `countDocuments` — that is the current bug.
- **Accept**
  - `status` supplied in a request body is rejected (`400`), never honoured
  - A wrong solution cannot produce `Accepted` by any client-side manipulation
  - Hidden tests execute and are never returned to the client
  - A submission exceeding the time budget returns a deterministic `Timeout` verdict
  - **Coins are awarded exactly once per first solve under CONCURRENT duplicate submits** — verified by a test that fires N simultaneous accepted submissions for the same problem and asserts the balance increased by exactly one first-solve bonus
  - **Balance can never go negative and never double-credits** — `fast-check` property over random interleavings
  - Infrastructure failure (runtime unavailable) persists no submission and returns `503`, distinct from a user `Error` — see [OPS-07 §5.1](09-runtime-ownership.md#51-the-verdict-integrity-rule)
  - Load test: 50 concurrent submissions complete without exhausting the compiler pool

### SEC-11 · Replace the markdown renderer
- **Category** Security (fixes [H-1](02-security.md#h-1--stored-xss-via-attribute-injection-in-the-markdown-renderer)) · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** SEC-07
- **Files** [client/lib/markdown.ts](../../client/lib/markdown.ts) and its 3 call sites
- **Do** Swap the hand-rolled regex chain for `marked` + `DOMPurify` (or `remark`/`rehype-sanitize`) with an explicit tag/attribute allowlist.
- **Accept** A stored-XSS corpus (attribute injection, `javascript:`, `data:`, SVG, entity-encoded handlers) renders inert; existing content renders visually unchanged.

### SEC-12 · Encrypt GitHub tokens and reduce OAuth scope
- **Category** Security (fixes [H-2](02-security.md#h-2--github-oauth-tokens-stored-in-plaintext-with-excessive-scope)) · **Priority** P1 · **Difficulty** L · **Est** 2d · **Deps** —
- **Files** [models/GitHubIntegration.ts](../../client/models/GitHubIntegration.ts), [api/auth/github/*](../../client/app/api/auth/github/), [lib/github.ts](../../client/lib/github.ts), new `lib/crypto/tokenCipher.ts`
- **Do** AES-256-GCM using the already-provisioned `TOKEN_ENCRYPTION_KEY`; store `{iv, ciphertext, authTag}`. Change scope `repo` → `public_repo`. Invalidate existing integrations and force reconnect (this also revokes the over-scoped grants).
- **Accept**
  - No plaintext token in any document (verified by a collection scan in the migration test)
  - Decryption failure degrades to "not connected", never to a crash
  - Key rotation is documented and testable

### SEC-13 · Rate limiting across the platform
- **Category** Security (fixes [H-3](02-security.md#h-3--no-rate-limiting-on-any-user-facing-endpoint)) · **Priority** P1 · **Difficulty** L · **Est** 3d · **Deps** OPS-05
- **Files** new `client/lib/rateLimit.ts`, all high-cost routes, [server/src/routes/legacy/dataweave.legacy.routes.ts](../../server/src/routes/legacy/dataweave.legacy.routes.ts)
- **Do** Apply the existing policies where they were designed to go. Wire `createLimiter("legacy")` onto the Express `/api/transform`. Add a Redis/Upstash-backed limiter for the Next.js routes — in-memory is useless on serverless.
- **Accept**
  - `compiler`, `ai`, `generation`, `submission`, `write`, `legacy` policies all applied
  - `429` carries `RateLimit-*` + `Retry-After`
  - Limits hold across serverless instances (verified with concurrent clients)

### SEC-14 · Content-Security-Policy
- **Category** Security (fixes [H-4](02-security.md#h-4--no-content-security-policy-on-the-html-application)) · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** SEC-11
- **Files** [client/next.config.ts](../../client/next.config.ts) or [client/proxy.ts](../../client/proxy.ts)
- **Do** Nonce-based CSP. Monaco needs `worker-src blob:`; Clerk needs its `frame-src`/`connect-src`. Ship report-only for one week, then enforce. Add HSTS, `Permissions-Policy`, COOP.
- **Accept** Enforced CSP with no `unsafe-inline` in `script-src`; playground, Clerk and the editor all function; violation reports collected.

### SEC-15 · Zod validation on every write endpoint
- **Category** Security (fixes [H-5](02-security.md#h-5--mass-assignment-on-every-document-creating-route)) · **Priority** P1 · **Difficulty** L · **Est** 3d · **Deps** REF-02
- **Files** new `client/lib/validation/*.ts`, all `POST`/`PUT`/`DELETE` routes
- **Do** A schema per endpoint; build documents from `result.data` with explicit field mapping. Eliminate every `new Model({...body})` and `findByIdAndUpdate(id, body)`.
- **Accept** `grep -rn '\.\.\.data\|\.\.\.body' client/app/api/` returns nothing; unknown fields are dropped; validation failures return `400` with field-level detail.

### SEC-16 · Error envelope and log hygiene
- **Category** Security (fixes [H-6](02-security.md#h-6--verbose-error-messages-returned-to-clients)) · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** —
- **Files** [client/lib/errors.ts](../../client/lib/errors.ts), all routes; reuse [server/src/errors/](../../server/src/errors/)
- **Do** Log the full error with a request id server-side; return `{success:false,error:{code,message,requestId}}`. Stop logging user script content in [api/transform:96](../../client/app/api/transform/route.ts#L96).
- **Accept** No raw exception text, Mongo field path, or upstream body reaches a client; every 5xx carries a correlatable request id.

### PERF-01 · Leaderboard aggregation and indexes
- **Category** Performance (fixes [M-9](02-security.md#m-9--unauthenticated-full-collection-scans)) · **Priority** P1 · **Difficulty** L · **Est** 2d · **Deps** PERF-02
- **Files** [api/leaderboard/route.ts](../../client/app/api/leaderboard/route.ts)
- **Do** Replace `Submission.find().lean()` + in-memory grouping with a `$group`/`$sort`/`$facet` pipeline. Cache 30–60s. Keep the existing canonical-rank and page-independent-`me` semantics exactly.
- **Accept** Constant memory regardless of collection size; p95 < 200 ms at 100k submissions; identical output to the current implementation on a fixture dataset.

### PERF-02 · Add the missing indexes
- **Category** Performance · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** —
- **Files** all [client/models/](../../client/models/), new `scripts/ensure-indexes.ts`
- **Do** Add every index listed in [01-architecture.md §6](01-architecture.md#6-database-inventory). Highest value: `submissions.{userId,problemSlug}`, `submissions.{userId,status}`, `submissions.createdAt`, `problems.{difficulty,category}`, `blogs.{published,createdAt}`.
- **Accept** `explain()` shows `IXSCAN` (not `COLLSCAN`) for every query in the hot paths; index creation is idempotent and runs in deploy.

### BUG-01 · Contest scoring does not exist
- **Category** Bug · **Priority** P1 · **Difficulty** L · **Est** 3d · **Deps** FEAT-01
- **Files** [models/Contest.ts](../../client/models/Contest.ts), [api/contests/[id]](../../client/app/api/contests/[id]/route.ts), new contest-scoring service
- **Why** `participants[].score` and `.solvedProblems` are declared in the schema and **written by no code path**. Contests can be created and joined but never scored or ranked — including the auto-scheduled weekly contest.
- **Do** On an accepted submission during an active contest the participant is in, update `score` and `solvedProblems`. Add contest standings and a tiebreak rule (time-to-solve).
- **Accept** Solving during a contest updates that participant's score; standings order correctly; solving outside the window does not score; late joiners cannot backfill.

### BUG-02 · Handle uniqueness races instead of 500ing
- **Category** Bug (fixes [M-7](02-security.md#m-7--toctou-races-on-uniqueness-checks)) · **Priority** P1 · **Difficulty** S · **Est** 3h · **Deps** —
- **Files** [api/profile/username](../../client/app/api/profile/username/route.ts), [api/blog](../../client/app/api/blog/route.ts), [api/profile/setup](../../client/app/api/profile/setup/route.ts)
- **Do** Write first, catch `E11000` → `409`. Replace the unbounded `while (findOne)` slug loops with a bounded suffix-and-retry, following the pattern already used correctly in [api/store](../../client/app/api/store/route.ts).
- **Accept** Concurrent identical username/slug submissions produce one success and one `409`, never a `500`.

### BUG-03 · Stop deriving public usernames from email
- **Category** Bug + Privacy (fixes [M-6](02-security.md#m-6--username-enumeration-and-email-derived-default-usernames)) · **Priority** P1 · **Difficulty** S · **Est** 3h · **Deps** —
- **Files** [api/profile/setup/route.ts](../../client/app/api/profile/setup/route.ts)
- **Do** Default to `dw_<8 random chars>`; prompt the user to choose on first visit.
- **Accept** No new profile exposes an email local-part; existing users are offered a rename; changing username is rate-limited.

### SEC-17 · Validate GitHub repo/path parameters
- **Category** Security (fixes [M-3](02-security.md#m-3--path-traversal-into-arbitrary-github-api-endpoints)) · **Priority** P1 · **Difficulty** S · **Est** 2h · **Deps** —
- **Files** [api/playground/github/import/route.ts](../../client/app/api/playground/github/import/route.ts)
- **Do** `repo` must match `^[\w.-]{1,39}/[\w.-]{1,100}$`; reject `..` in `path`; `encodeURIComponent` each segment.
- **Accept** `repo=../../user` → `400`; legitimate `owner/name` imports still work.

### FEAT-09 · Live compile Phase 2 — rate limit the compiler proxies ⬆️
- **Category** Security + Feature · **Priority** P1 · **Difficulty** M · **Est** 3h · **Deps** OPS-05 (Redis)
- **Why raised** Playground live compile (Phase 1) shipped, making ~1 req/s/tab the *designed* behaviour of an unauthenticated, unrated endpoint. A human clicking Run was self-limiting; this removes that.
- **Plan** → [docs/plans/playground-live-compile.md §3](../plans/playground-live-compile.md#3-the-server-side-prerequisite)
- **Do** IP-keyed limit on `POST /api/transform` and `POST /api/execute` (≈90/min — 1.5×/s, above one active tab, below a script). Return `429` + `Retry-After`. Body cap + `AbortSignal.timeout` on the upstream fetch. `RATE_LIMIT_POLICIES.compiler` already exists and is applied to nothing — this is its enforcement point.
- **Client is already ready:** `runTransform` throws `RateLimitedError` on `429` and live compile suspends itself immediately. No client change needed when this lands.
- **Accept** N+1 requests in a window → `429` with `Retry-After`; the limit holds across concurrent clients (proves distributed state, not per-instance memory); live compile pauses rather than retrying into the limit.

### SEC-21 · Move page protection off middleware onto the resources
- **Category** Security · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** —
- **Why** `@clerk/nextjs` 7.6.1 deprecates `createRouteMatcher`, and its stated reason is the same class as [W1-R8](README.md#-new-finding--w1-r8-real-cves-in-the-production-dependency-tree): *"Middleware-based auth checks rely on path matching, which can diverge from how Next.js routes requests and leave protected resources reachable."* Two independent sources now say middleware path-matching is the wrong place for authorisation.
- **Current risk is LOW** — every protected *action* already enforces authorisation in its own route handler (SEC-01…SEC-04). [proxy.ts](../../client/proxy.ts) only decides who may LOAD a page, so a bypass exposes an empty shell, not data. The deprecation is suppressed there with a comment pointing here.
- **Do** Replace the matcher with `auth.protect()` (or an equivalent server-side check) inside `/profile`, `/create`, `/admin` and `/blog/new`. Remove the `eslint-disable` and the `createRouteMatcher` import.
- **Accept**
  - No `createRouteMatcher` usage remains; the lint suppression is gone
  - Anonymous access to each of the four routes still redirects to sign-in
  - `/profile/[username]`, `/blog` and `/sponsor` remain reachable signed-out (the regression [proxy.ts](../../client/proxy.ts) was rewritten to fix)
  - An E2E test covers both the protected and the public list

### SEC-18 · Authenticate and quota the compiler proxies
- **Category** Security (fixes [M-4](02-security.md#m-4--unauthenticated-compiler-proxies)) · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** SEC-13
- **Files** [api/execute](../../client/app/api/execute/route.ts), [api/transform](../../client/app/api/transform/route.ts)
- **Do** Require auth on `/api/execute`. Keep `/api/transform` anonymous only if the playground must work signed-out — then IP-keyed limit + body cap + `AbortSignal.timeout`. Add a generous anonymous daily quota.
- **Accept** Anonymous compile volume is bounded and observable; signed-in users get the `compiler` policy.

### SEC-19 · Quota and expire playground share links
- **Category** Security (fixes [M-5](02-security.md#m-5--unauthenticated-unbounded-storage-growth-via-share-links)) · **Priority** P1 · **Difficulty** S · **Est** 4h · **Deps** SEC-13
- **Files** [api/playground/share/route.ts](../../client/app/api/playground/share/route.ts), [models/PlaygroundSnippet.ts](../../client/models/PlaygroundSnippet.ts)
- **Do** Record `userId`; per-user quota; TTL index on anonymous snippets (30 days).
- **Accept** Anonymous snippets expire; a single client cannot grow the collection without bound.

### SEC-20 · Sign the OAuth state parameter
- **Category** Security (fixes [M-8](02-security.md#m-8--oauth-state-not-bound-to-the-user-or-signed)) · **Priority** P1 · **Difficulty** S · **Est** 4h · **Deps** —
- **Files** [api/auth/github/route.ts](../../client/app/api/auth/github/route.ts), [callback](../../client/app/api/auth/github/callback/route.ts)
- **Do** HMAC `{userId, nonce, exp}` with the already-provisioned `OAUTH_STATE_SECRET`. Verify signature **and** that `userId` matches the session. Replace hand-rolled cookie parsing with Next's `cookies()`.
- **Accept** A state minted for user A is rejected in user B's session; expired state is rejected.

### OPS-03 · Gate CI on pull requests and add security jobs
- **Category** DevOps (fixes [L-6](02-security.md#-low), [L-7](02-security.md#-low)) · **Priority** P1 · **Difficulty** S · **Est** 4h · **Deps** —
- **Files** [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- **Do** Add `pull_request: branches: [master]`. Add jobs: `npm audit --omit=dev`, CodeQL, `gitleaks`, and a `docker build` (which would have caught OPS-01). Enable Dependabot.
- **Accept** A PR with a failing typecheck cannot merge; a known-vulnerable dependency fails the build; the image builds in CI.

### OPS-04 · Health and readiness endpoints for the frontend
- **Category** DevOps · **Priority** P1 · **Difficulty** S · **Est** 3h · **Deps** —
- **Files** new `client/app/api/health/route.ts`, `client/app/api/ready/route.ts`
- **Do** `/api/health` = liveness, dependency-free. `/api/ready` = readiness, checks Mongo and the compiler. Mirror the split [render.yaml](../../render.yaml) already gets right on the server.
- **Accept** Liveness stays `200` while a dependency is degraded; readiness reports `503` with which dependency failed.

### OPS-05 · Provision managed Redis
- **Category** DevOps · **Priority** P1 · **Difficulty** S · **Est** 4h · **Deps** —
- **Do** Upstash (serverless-friendly) or Render Redis. Wire into the container as a `KeyValueStore` implementation.
- **Why** Prerequisite for SEC-13 (distributed rate limiting), PERF-01 (caching) and later job queues. [MemoryKeyValueStore](../../server/src/lib/store/memoryStore.ts) already sits behind the right interface, so this is a swap, not a rewrite.
- **Accept** Both processes read/write Redis; failure degrades gracefully rather than 500ing.

### REF-01 · Extract shared domain types and constants
- **Category** Refactor · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** —
- **Files** new `packages/shared/`, [client/lib/types.ts](../../client/lib/types.ts), [server/src/config/constants.ts](../../server/src/config/constants.ts)
- **Do** Convert the repo to npm workspaces. Move `DIFFICULTIES`, `SUBMISSION_STATUSES`, `SCORE_WEIGHTS`, `COIN_RULES`, `RANK_TIERS`, `LIMITS` and the DTO types into one package consumed by both halves.
- **Accept** Score weights and coin rules are defined exactly once; both packages typecheck against the shared source.

### REF-02 · Deduplicate the Mongoose models
- **Category** Refactor · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** REF-01
- **Files** [client/models/](../../client/models/), [server/src/models/](../../server/src/models/)
- **Why** `Problem` and `Contest` are defined **twice** against the same collections. Two processes can write divergent shapes to the same documents.
- **Do** Single definition in `packages/shared/models`; both import it.
- **Accept** No schema is declared in two places; a field added once is visible to both processes.

### TEST-01 · Regression tests for every P0 fix
- **Category** Testing · **Priority** P1 · **Difficulty** M · **Est** 1d · **Deps** SEC-01…SEC-07
- **Do** One failing-before/passing-after test per P0 finding.
- **Accept** Reverting any P0 fix turns its test red.

### DOC-01 · Document the two-backend split and the migration path
- **Category** Documentation · **Priority** P1 · **Difficulty** S · **Est** 4h · **Deps** —
- **Files** [README.md](../../README.md), [CLAUDE.md](../../CLAUDE.md), new `docs/architecture/migration.md`
- **Do** Make the Next.js-routes-vs-Express-server split explicit, state which surface is authoritative for what, and record the intended end state. Today a contributor cannot tell where a new endpoint belongs.
- **Accept** A new contributor can answer "where does this endpoint go?" from the docs alone.

---

## P2 — Next quarter

### Architecture and migration

| ID | Task | Diff | Est | Deps |
|---|---|---|---|---|
| **REF-03** | Port problems + submissions to `/api/v1`; Next.js routes become thin proxies | XL | 6d | FEAT-01, REF-02 |
| **REF-04** | Port contests + leaderboard to `/api/v1` | L | 4d | REF-03 |
| **REF-05** | Port blog, comments, bookmarks, notes to `/api/v1` | L | 4d | REF-03 |
| **REF-06** | Repository layer for all client-side data access (no Mongoose in route handlers) | L | 3d | REF-02 |
| **REF-07** | Validated config module for the client, mirroring [server/src/config/env.ts](../../server/src/config/env.ts) | M | 1d | — |
| **REF-08** | Structured logging in the client (pino), request-id correlation across both halves | M | 1d | SEC-16 |
| **REF-09** | Central RBAC module: `can(user, action, resource)` replacing ad-hoc `isAdmin` checks | M | 1d | — |

### Performance

| ID | Task | Diff | Est | Deps |
|---|---|---|---|---|
| **PERF-03** | Aggregate profile stats server-side instead of loading all submissions | M | 1d | PERF-02 |
| **PERF-04** | Paginate comments and blog listings ([L-4](02-security.md#-low)) | S | 4h | — |
| **PERF-05** | Cache problem list/detail (ISR or Redis); invalidate on write | M | 1d | OPS-05 |
| **PERF-06** | Move GitHub push off the request path into a job queue | M | 1d | OPS-06 |
| **PERF-07** | Denormalise per-user solve counters to remove leaderboard recomputation | L | 2d | FEAT-01 |

### Features

| ID | Task | Diff | Est | Deps |
|---|---|---|---|---|
| **FEAT-02** | Moderation queue for user- and AI-generated problems | L | 3d | SEC-02, SEC-04 |
| **FEAT-03** | AI code review (named in the brief, not implemented) | L | 4d | SEC-13 |
| **FEAT-04** | Learning paths (named in the brief and README, not implemented) | XL | 8d | — |
| **FEAT-05** | Admin moderation actions + append-only audit log ([M-10](02-security.md#m-10--admin-authorization-depends-on-an-env-var-with-a-silent-failure-path)) | M | 1d | REF-09 |
| **FEAT-06** | Role revocation (`DELETE /api/admin/roles`) — grant exists, revoke does not | S | 3h | REF-09 |
| **FEAT-07** | Daily challenge | M | 1d | FEAT-01 |
| **FEAT-08** | Solution editorials with spoiler gating | M | 1d | — |

### DevOps

| ID | Task | Diff | Est | Deps |
|---|---|---|---|---|
| **OPS-06** | Job queue (BullMQ on Redis) for GitHub pushes, AI generation, contest scoring | L | 3d | OPS-05 |
| **OPS-08** | Gateway deployment (Traefik) — see [05-environments-runtime.md](05-environments-runtime.md) | L | 4d | — |
| **OPS-09** | Observability: OpenTelemetry traces, Prometheus metrics, Grafana dashboards | L | 3d | REF-08 |
| **OPS-10** | Staging environment with seeded data | M | 1d | OPS-08 |
| **OPS-11** | Automated MongoDB backups + a documented, *tested* restore drill | M | 1d | — |
| **OPS-12** | Secrets manager (Doppler / Infisical / Vault) replacing per-platform env vars | M | 1d | — |

### Testing and docs

| ID | Task | Diff | Est | Deps |
|---|---|---|---|---|
| **TEST-02** | Unit coverage ≥70% on services and utilities | L | 4d | — |
| **TEST-03** | Integration tests for every API route (`mongodb-memory-server` is already a dependency) | XL | 6d | REF-06 |
| **TEST-04** | E2E suite (Playwright) — see [04-testing.md](04-testing.md) | L | 4d | OPS-10 |
| **TEST-05** | Automated security regression suite | L | 3d | TEST-03 |
| **DOC-02** | OpenAPI spec generated from zod schemas | M | 1d | SEC-15 |
| **DOC-03** | Runbooks: incident response, restore, key rotation, rollback | M | 1d | OPS-11 |

---

## P3 — Backlog

Not estimated; revisit after P2.

**Product** — Company-tagged problems · streaks and achievements · certificates ·
mock-interview mode · organization/team accounts · private question banks ·
classroom mode · candidate assessments. See [08-product-roadmap.md](08-product-roadmap.md).

**Platform** — Multi-region deployment · read replicas · CDN for problem content ·
WebSocket live contest standings · GraphQL or tRPC layer · feature-flag service ·
A/B testing · i18n.

**Technical debt** — Move `shadcn` to `devDependencies` ([L-5](02-security.md#-low)) ·
delete `server/dist/` from the working tree · consolidate the three `.kiro/specs`
directories · remove the dead `client/__tests__/property-*.test.ts` placeholders ·
prune unused `RATE_LIMIT_POLICIES` entries once the migration lands.

---

## Critical path

The dependency chain that gates everything else:

```
OPS-05 (Redis)          ──┐
REF-01 (shared types)   ──┼──► REF-02 (dedupe models) ──► FEAT-01 (server-side grading) ──┬──► BUG-01 (contest scoring)
SEC-05 (reject verdicts)──┘                                                                ├──► PERF-07 (denormalised counters)
                                                                                           └──► REF-03 (port to v1) ──► REF-04, REF-05
```

**FEAT-01 is the keystone.** Contest scoring, honest leaderboards, the coin
economy and the whole `/api/v1` migration all sit behind it. It is also the
single largest task in the backlog (8 days). Start REF-01, REF-02 and OPS-05 in
parallel with the P0 fixes so FEAT-01 is unblocked the moment the P0s land.
