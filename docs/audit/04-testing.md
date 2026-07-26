# DWCode — Testing Strategy (Phase 3)

> Current state: **6 test files, ~1,457 lines, covering roughly 3% of the codebase.**
> Target: 70% unit coverage on logic, 100% integration coverage on API routes,
> and a security regression suite that makes every finding in
> [02-security.md](02-security.md) permanently un-reintroducible.

---

## 1. Where the tests are today

| File | Type | Verdict |
|---|---|---|
| [server/tests/integration/legacy-transform.contract.test.ts](../../server/tests/integration/legacy-transform.contract.test.ts) | Contract | ✅ **Exemplary.** Locks byte-compatibility of the frozen legacy endpoints, including the deliberately-reproduced `status` key collision. This is the model for the rest. |
| [server/tests/unit/sponsorship.signature.test.ts](../../server/tests/unit/sponsorship.signature.test.ts) | Unit | ✅ HMAC verification, the right thing to test first on a payment path |
| [server/tests/unit/weeklyContest.test.ts](../../server/tests/unit/weeklyContest.test.ts) | Unit | ✅ Scheduler logic with an injected clock |
| [server/tests/unit/interop.test.ts](../../server/tests/unit/interop.test.ts) | Unit | ✅ CJS/ESM default-import normalisation |
| [client/__tests__/property-1-bug-condition.test.ts](../../client/__tests__/property-1-bug-condition.test.ts) | Property | ⚠️ Placeholder-named, narrow scope |
| [client/__tests__/property-2-preservation.test.ts](../../client/__tests__/property-2-preservation.test.ts) | Property | ⚠️ Same |

### The gap

**Zero tests exist for:**
- all 34 Next.js API route handlers — the entire de-facto backend
- authentication and authorization on any endpoint
- grading, coins, leaderboard ranking, contest logic
- the markdown renderer (which has a confirmed stored-XSS bug)
- every Mongoose model
- any React component or page
- any end-to-end user journey

The tooling is already in place and unused: `vitest` in both packages,
`supertest`, `mongodb-memory-server`, and `fast-check` are all declared as
dependencies. Nothing needs to be chosen — only written.

### Why the ordering below is what it is

The riskiest code has the least coverage, and the correlation is exact: every
Critical finding in [02-security.md](02-security.md) is in an untested file. So
the strategy starts with a **security regression suite** rather than with
coverage percentage. A test that pins `DELETE /api/problems/:id → 401` is worth
more than fifty component snapshots.

---

## 2. Test pyramid

```
        ╱╲          E2E — Playwright · ~25 specs · 10 min
       ╱  ╲         critical journeys only
      ╱────╲
     ╱      ╲       Integration — vitest + supertest + mongodb-memory-server
    ╱        ╲      ~120 specs · 3 min · every API route
   ╱──────────╲
  ╱            ╲    Unit — vitest · ~350 specs · 30 s
 ╱              ╲   services, utilities, middleware, hooks, models
╱────────────────╲

     ┌──────────────────────────────────────────┐
     │ SECURITY REGRESSION — cuts every layer.  │
     │ One spec per finding in 02-security.md.  │
     │ Runs on every PR. Never skipped.         │
     └──────────────────────────────────────────┘
```

---

## 3. Unit tests

**Runner:** `vitest` · **Location:** `*.test.ts` beside the unit under test
**Rule:** no network, no database, no filesystem. Dependencies injected or mocked.

### 3.1 Server services

| Unit | Cases |
|---|---|
| [dataweave.client.ts](../../server/src/services/dataweave/dataweave.client.ts) | Non-string script → exact legacy message · non-array inputs → exact message · input missing `name` → indexed message · timeout → `AbortError` branch and its exact text · non-OK response appends upstream body · `result.error` as string **and** as object · output JSON-parse fallback |
| [upstreamHealth.service.ts](../../server/src/services/dataweave/upstreamHealth.service.ts) | Heartbeat start/stop idempotency · degraded upstream reporting · injected clock |
| [sponsorship.service.ts](../../server/src/services/payment/sponsorship.service.ts) | Order creation · signature verify pass/fail · webhook idempotency (replayed event) · currency handling · not-configured → `503` |
| [razorpay.client.ts](../../server/src/services/payment/razorpay.client.ts) | Auth header construction · error mapping · undefined-config path |
| [weeklyContest.service.ts](../../server/src/services/contest/weeklyContest.service.ts) | ✅ exists — extend with: short-bucket backfill · skip below `minProblems` · DST-independent Saturday 15:00 UTC · no duplicate contest for the same week |
| [clerkTokenVerifier.ts](../../server/src/services/identity/clerkTokenVerifier.ts) | Valid token → identity · missing `sub` → `UnauthenticatedError` · expired/malformed/bad-signature all map to `INVALID_TOKEN` · `DisabledTokenVerifier` always rejects |
| [legacy.mapper.ts](../../server/src/services/dataweave/legacy.mapper.ts) | Legacy shapes A and B · MIME-type branching · non-string coercion |

### 3.2 Server middleware

| Unit | Cases |
|---|---|
| [auth.ts](../../server/src/middleware/auth.ts) | Missing header → `401` · non-bearer scheme → `401` · `Bearer` with empty token → `401` · valid → `req.auth` populated · **`req.auth.userId` is never read from body/query/header** · `optionalAuth` passes through on absent **and** on invalid token (documents [M-11](02-security.md#m-11--invalid-tokens-silently-accepted-as-anonymous-on-optional-auth-routes)) |
| [rateLimit.ts](../../server/src/middleware/rateLimit.ts) | `keyBy:"user"` uses `u:<id>` · anonymous falls back to `ip:` · **IPv6 normalises to /56** (a `fast-check` property over generated IPv6 addresses: two addresses in the same /56 must share a key) · `429` shape and `Retry-After` |
| [security.ts](../../server/src/middleware/security.ts) | `stripOperators` removes `$`-prefixed and dotted keys at every depth · depth cap at 20 · arrays preserved · CORS allowlist hit/miss · no-Origin request allowed |
| [validate.ts](../../server/src/middleware/validate.ts) | Body/params/query populate `req.validated` · **`req.query` is never assigned to** (Express 5 lazy getter) · all issues reported at once, not just the first |
| [errorHandler.ts](../../server/src/middleware/errorHandler.ts) | `AppError` → correct code/status · unknown error → `500` with generic message · `requestId` always present · **stack traces never in the body** |

### 3.3 Client libraries

| Unit | Cases |
|---|---|
| **[markdown.ts](../../client/lib/markdown.ts)** ⚠️ | **Highest priority unit target.** A stored-XSS corpus: attribute injection (`[x](https://e.com'onmouseover='location=name)`), `javascript:`/`data:` URLs, SVG payloads, entity-encoded handlers, nested/unbalanced backticks, ReDoS inputs against the fence regex. Plus formatting fidelity: headings, bold, italic, blockquote, lists, fences. Property test: **for all inputs, output contains no `on\w+=` attribute and no `<script`.** |
| [coins.ts](../../client/lib/coins.ts) | Zero amount is a no-op · empty userId is a no-op · transaction log capped at 200 · never throws · `isAdmin` super-admin path and DB path |
| [ranks.ts](../../client/lib/ranks.ts) | Tier boundaries exactly at 0/3/10/25/50/100 · negative and huge scores |
| [adminCheck.ts](../../client/lib/adminCheck.ts) | Super-admin via env · DB role · **fails closed on DB error** · unset `SUPER_ADMIN_USER_ID` does not grant |
| [github.ts](../../client/lib/github.ts) | Path sanitisation in `slugify` · repo-create-on-404 branch · SHA handling for update-vs-create · **token never appears in a thrown message** |
| [errors.ts](../../client/lib/errors.ts) | Every error shape produces a safe string |
| [themes.ts](../../client/lib/themes.ts) | `isFreeSkin` · catalogue integrity (unique ids, non-negative costs) |

### 3.4 Models

For each of the 15 schemas: required-field enforcement, enum rejection,
default values, index declarations present, and — after SEC-15 — that
server-owned fields (`status`, `userId`, `createdAt`) cannot be set from input.

### 3.5 Grading (after FEAT-01)

The most important new unit surface. Output normalisation (whitespace, key order,
number formatting, trailing newline), partial pass/fail, timeout → deterministic
verdict, budget exhaustion across tests, concurrency cap honoured, hidden tests
included in the verdict but excluded from the response.

---

## 4. Integration tests

**Runner:** `vitest` + `supertest` + `mongodb-memory-server` (all already installed)
**Rule:** real HTTP against a real in-memory Mongo; only third parties are faked.

### 4.1 Fixtures to build first

```
tests/helpers/
  buildTestApp.ts        # ✅ exists for server/ — extend to client route handlers
  seedDatabase.ts        # deterministic users, problems, submissions, contests
  authFixtures.ts        # anonymous · user · secondUser · admin · superAdmin
  fakeCompiler.ts        # deterministic DataWeave responses incl. timeout/error
  fakeGemini.ts          # canned AI responses incl. malformed JSON + injected output
  fakeGitHub.ts          # OAuth exchange, repo create, contents PUT
  fakeRazorpay.ts        # order create + signed webhook payloads
```

`authFixtures` matters more than it looks: **every route gets tested against all
five identities.** That single matrix is what would have caught C-1, C-2, C-3 and
M-1 mechanically.

### 4.2 The authorization matrix

For every one of the 34 Next.js routes and 8 Express routes, assert the expected
status for each identity:

| | anonymous | user | otherUser | admin | superAdmin |
|---|---|---|---|---|---|
| `GET /api/problems` | 200 | 200 | 200 | 200 | 200 |
| `POST /api/problems` | **401** | 201 | 201 | 201 | 201 |
| `PUT /api/problems/:id` | **401** | **403** | **403** | 200 | 200 |
| `DELETE /api/problems/:id` | **401** | **403** | **403** | 200 | 200 |
| `GET /api/notes?problemId=X` | **401** | own only | **not A's** | own only | own only |
| `PUT /api/notes` | **401** | own only | **not A's** | own only | own only |
| `POST /api/generate` | **401** | **403** | **403** | 200 | 200 |
| `GET /api/admin/users` | 403 | 403 | 403 | 200 | 200 |
| `POST /api/admin/roles` | 403 | 403 | 403 | **403** | 200 |
| `DELETE /api/comments?id=X` | 401 | own only | **403** | own only | own only |
| `DELETE /api/blog/:slug` | 401 | author only | **403** | 200 | 200 |
| `DELETE /api/contests/:id` | 401 | creator only | **403** | creator only | creator only |
| … | | | | | |

Bold cells are the ones that currently fail. Write the table first, let it go red,
then fix.

### 4.3 Backend → database

- Connection lifecycle: connect before listen, graceful disconnect, reconnect after drop
- Every index in [01-architecture.md §6](01-architecture.md#6-database-inventory) exists after startup
- **Query-plan assertions**: `explain()` returns `IXSCAN` (not `COLLSCAN`) for leaderboard, profile and problem-list queries — this is a *performance regression test*, and it is cheap
- Concurrency: two simultaneous store purchases debit exactly once; two simultaneous first-votes produce one vote row; two identical username claims yield one `409`
- Transaction/rollback: a failed `StorePurchase` insert refunds the debit

### 4.4 Backend → DataWeave runtime

Compiler unreachable → graceful `503`, no crash · timeout honoured ·
non-JSON upstream response · upstream 5xx · malformed output ·
**oversized payload rejected before dispatch** · concurrency cap respected.

### 4.5 Backend → external services

| Service | Cases |
|---|---|
| **Clerk** | Valid/expired/malformed/wrong-issuer tokens · unconfigured → fails closed |
| **Gemini** | Valid JSON · markdown-fenced JSON · malformed JSON · **prompt-injected output must not reach the database unvalidated** · quota error |
| **GitHub** | Full OAuth round trip · state mismatch → rejected · token refresh/revocation · repo-exists and repo-missing branches · API rate-limit response |
| **Razorpay** | Order create · valid webhook signature · **invalid signature rejected** · replayed webhook is idempotent |

### 4.6 Domain flows

**Grading (after FEAT-01)** — correct solution → `Accepted` · wrong → `Attempted` ·
hidden test fails while visible passes → `Attempted` · **`status` in the request
body is rejected** · coins awarded exactly once for a first solve · duplicate
concurrent submissions award once.

**Contest** — create/join/leave · private requires invite · full contest rejects ·
ended contest rejects joins · **solving during a contest updates the score**
(BUG-01) · standings order · late join cannot backfill.

**Leaderboard** — rank is canonical under all three sorts · `me` is
page-independent · pagination boundaries · ties broken deterministically ·
output identical to the pre-PERF-01 implementation on a fixture set.

**Coins/store** — award rules match `COIN_RULES` · insufficient balance → `402` ·
double purchase is idempotent · refund on lost race · **balance can never go
negative** (`fast-check` property over random operation sequences).

---

## 5. E2E tests

**Runner:** Playwright · **Environment:** staging (OPS-10) with seeded data
**Rule:** critical journeys only. E2E is the slowest, flakiest layer — keep it thin.

| # | Journey | Assertions |
|---|---|---|
| 1 | **Signup → profile created** | Clerk signup, profile auto-created, default username is **not** email-derived (BUG-03) |
| 2 | **Login → dashboard** | Session persists across reload; protected pages reachable |
| 3 | **Anonymous browsing** | `/`, `/problems`, `/blog`, `/leaderboard`, `/profile/[username]`, `/sponsor` all load signed-out — these are the exact routes [proxy.ts](../../client/proxy.ts) was rewritten to keep public, so they need a guard |
| 4 | **Playground run** | Write DW, execute, see output; multi-file input; XML/CSV input |
| 5 | **Playground share** | Create link, open in a fresh context, state restored |
| 6 | **Solve a problem** | Open, write solution, run, submit, see `Accepted`, coins increase, appears in submissions |
| 7 | **Fail a problem** | Wrong answer → `Attempted`, **no coins awarded** |
| 8 | **Contest** | Create, join, solve, standings update (BUG-01) |
| 9 | **Leaderboard** | Ranks render, sorting works, "my rank" card correct from page 3 |
| 10 | **Public profile** | `/profile/[username]` renders signed-out; follow/unfollow signed-in |
| 11 | **Blog** | Write, publish, vote, comment, delete own post |
| 12 | **Store** | Buy a skin, balance decreases, skin applies, re-buy is idempotent |
| 13 | **GitHub connect** | OAuth round trip (mocked), status shows connected, disconnect works |
| 14 | **Admin** | Admin sees the user directory; a normal user gets `403` on `/admin` |
| 15 | **404 + maintenance** | Unknown URL renders the 404 page (not a sign-in redirect); maintenance banner toggles |

Accessibility (`axe`) and mobile-viewport checks run as assertions inside these
specs rather than as separate journeys.

---

## 6. Security regression suite

**This is the highest-value suite in the plan.** One spec per finding, named for
its finding id, kept forever. Runs on every PR; never skipped, never `.only`'d out.

```
tests/security/
  access-control.spec.ts       C-1 C-2 C-3 C-5 M-1 M-10
  grading-integrity.spec.ts    C-4 C-5 H-5
  xss.spec.ts                  H-1 H-4
  secrets.spec.ts              H-2 H-6
  rate-limit.spec.ts           H-3 M-4 M-5
  injection.spec.ts            M-2 M-3
  auth-flows.spec.ts           M-8 M-11
  headers.spec.ts              H-4 L-3
```

### Representative cases

**Access control** — for each mutating endpoint, anonymous → `401`, wrong-user →
`403`. Explicitly: `DELETE /api/problems/:id` anonymous → `401` (C-1);
`POST /api/generate` anonymous → `401` (C-2); user A cannot read user B's note
(C-3).

**Grading integrity** — `POST /api/submissions {status:"Accepted"}` awards zero
coins and does not appear as solved (C-4). `POST /api/migrate-guest-progress`
with 500 slugs is rejected (C-5). A `fast-check` property: **for any request body,
the persisted `status` equals the server-computed verdict.**

**XSS** — the confirmed payload `[x](https://e.com'onmouseover='location=name)`
must render with no event-handler attribute (H-1). A property test asserting no
`on\w+=` in output for any input. Plus a rendered-page assertion in Playwright
that the payload does not execute.

**Secrets** — no response body from any endpoint contains `mongodb://`,
`sk_`, `ghp_`, `AIza`, or a stack trace (H-6). No document in
`githubintegrations` contains a plaintext token after SEC-12 (H-2).

**Rate limiting** — N+1 requests to a limited endpoint returns `429` with
`Retry-After`; limits hold across two concurrent clients (proving distributed
state, not per-instance memory).

**Injection** — `$gt`/`$ne`/dotted-key bodies do not alter query semantics;
`repo=../../user` → `400` (M-3); a prompt-injected `topic` cannot cause an
unvalidated document write (M-2).

**Headers** — CSP present with no `unsafe-inline` in `script-src`; HSTS,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` all present.

---

## 7. Coverage targets

| Area | Now | Target | Gate |
|---|---|---|---|
| Server services | ~40% | 90% | PR blocks below 85% |
| Server middleware | ~10% | 95% | PR blocks below 90% |
| Client `lib/` | ~5% | 85% | PR blocks below 80% |
| API routes (integration) | 0% | **100% of routes** | any uncovered route blocks |
| Models | 0% | 80% | — |
| Components | 0% | 50% | — |
| **Security suite** | — | **100% of findings** | **any failure blocks merge** |

Coverage percentage is a weak signal on its own — "100% of routes have an
authorization test" is the number that actually matters, and it is the one gated
hardest.

---

## 8. CI pipeline

```yaml
on: [pull_request, push]        # ← the pull_request trigger is currently missing (OPS-03)

jobs:
  lint-typecheck:    # both packages · ~2 min
  unit:              # vitest --coverage · ~1 min · uploads to Codecov
  integration:       # mongodb-memory-server · ~3 min
  security:          # the suite in §6 · ~2 min · NEVER allowed to fail
  build:             # next build + tsc + docker build  ← docker build is missing (OPS-01 slipped through)
  e2e:               # Playwright vs staging · ~10 min · main + nightly only
  audit:             # npm audit --omit=dev · CodeQL · gitleaks   ← all missing today
```

**Branch protection:** `lint-typecheck`, `unit`, `integration`, `security` and
`build` required before merge to `master`.

---

## 9. Rollout

| Phase | Work | Effort | Outcome |
|---|---|---|---|
| **1** | Fixtures (§4.1) + security suite (§6) | 3d | Every finding permanently pinned |
| **2** | Authorization matrix (§4.2) for all 42 routes | 4d | No route can lose its authz check silently |
| **3** | Unit tests for `lib/` and services (§3) | 4d | Logic regressions caught in 30s |
| **4** | Domain-flow integration (§4.6) | 4d | Grading, coins, contests trustworthy |
| **5** | E2E (§5) | 4d | Journeys verified before release |
| **6** | Coverage gates + CI wiring (§7–8) | 2d | Standards enforced mechanically |

**Total ~21 engineer-days.**

Phase 1 is worth starting **before** the P0 fixes in
[03-backlog.md](03-backlog.md), not after: writing
`expect(res.status).toBe(401)` against `DELETE /api/problems/:id` takes ten
minutes, goes red immediately, and turns green the moment SEC-01 lands. That is
the cheapest possible proof that the fix is real — and the cheapest possible
insurance that it stays that way.
