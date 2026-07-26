# DWCode — Architecture Audit (Phase 1)

> Audit date: 2026-07-26 · Commit: `5a91223` · Branch: `master`
> Scope: full repository excluding `node_modules`, `.git`, `.next`, `dist`, `coverage`, `build`, `.cache`.
> ~21,000 LOC across 125 `.ts` + 60 `.tsx` files.

---

## 1. The headline finding

**DWCode has two backends, and they are not the same backend.**

```
                    ┌──────────────────────────────┐
                    │  client/  Next.js 16.2.9     │
                    │  (Vercel, port 8000)         │
                    │                              │
   browser ────────►│  • 26 pages / RSC            │
                    │  • 34 API route handlers  ───┼──┐  direct Mongoose
                    │  • 15 Mongoose models        │  │
                    └───────────┬──────────────────┘  │
                                │ ONLY 4 calls        │
                                │ (sponsorship)       │
                                ▼                     │
                    ┌──────────────────────────────┐  │
                    │  server/  Express 5 + TS ESM │  │
                    │  (Render, port 4000)         │  │
                    │                              │  │
                    │  • routes → controllers →    │  │
                    │    services → repositories   │  │
                    │  • 4 Mongoose models      ───┼──┤
                    │  • DI container, zod env,    │  │
                    │    pino, helmet, rate limits │  │
                    └───────────┬──────────────────┘  │
                                │                     │
                                ▼                     ▼
                                        ┌─────────────────────┐
                                        │   MongoDB (shared)  │
                                        │  Contest + Problem  │
                                        │  defined TWICE      │
                                        └─────────────────────┘
```

The `server/` package is genuinely well-engineered — layered, dependency-injected,
fail-fast config, structured logging, typed error envelope, contract-frozen legacy
routes. **It handles roughly 4% of the platform's traffic surface.** Everything a
user actually does — problems, submissions, contests, leaderboard, profiles, blog,
coins, store, GitHub, AI — runs through `client/app/api/**/route.ts`, which has
none of that infrastructure: no shared validation, no rate limiting, no
authorization layer, no structured logging, no error taxonomy.

This is the single most important structural fact in the codebase. Every
security finding in [02-security.md](02-security.md) that is ranked Critical
lives on the Next.js side, and every piece of machinery needed to fix it already
exists on the Express side, unused.

### Evidence

| Claim | Evidence |
|---|---|
| Client talks to server only for sponsorship | `grep apiRequest` → 4 hits, all in [client/app/sponsor/page.tsx](../../client/app/sponsor/page.tsx) |
| Client owns its own DB access | [client/lib/db.ts](../../client/lib/db.ts) + 15 models in [client/models/](../../client/models/) |
| Models are duplicated | `Contest.ts` and `Problem.ts` exist in **both** [client/models/](../../client/models/) and [server/src/models/](../../server/src/models/) |
| Both connect to the same cluster | `MONGODB_URI` present in both `client/.env.local` and `server/.env` |
| Server's business rules are dead code | `SCORE_WEIGHTS`, `COIN_RULES`, `RANK_TIERS`, `ABUSE_RULES`, `ATTEMPT_TTL_MS` in [config/constants.ts](../../server/src/config/constants.ts) are imported by **nothing** |

---

## 2. Repository layout

```
dwcode/
├── package.json              # monorepo runner (concurrently) — no workspaces
├── docker-compose.yml        # MongoDB only
├── Dockerfile                # builds client/ only — node:18-alpine (see §7)
├── render.yaml               # server/ → Render blueprint
├── vercel.json               # client/ → Vercel
├── .github/workflows/ci.yml  # push-to-master only, no PR gate
│
├── client/                   # Next.js 16.2.9 · React 19.2.4 · Tailwind 4 · port 8000
│   ├── proxy.ts              # Clerk middleware (Next 16 renamed middleware.ts → proxy.ts)
│   ├── app/
│   │   ├── api/              # 34 route.ts — THE de-facto backend
│   │   ├── playground/       # editor + 7 sub-components, monarch grammar
│   │   ├── problems/[slug]/  # Workspace.tsx — the grader (see §5)
│   │   ├── admin/ blog/ contests/ leaderboard/ profile/ store/ sponsor/ create/
│   ├── components/           # 15 app components + 14 shadcn/ui primitives
│   ├── lib/                  # db, config, coins, github, markdown, ranks, themes, apiClient
│   ├── models/               # 15 Mongoose schemas
│   └── __tests__/            # 2 property tests
│
└── server/                   # Express 5 · TS ESM · port 4000
    ├── src/
    │   ├── app.ts            # buildApp() — never listens (supertest-friendly)
    │   ├── server.ts         # listen, heartbeat, graceful shutdown
    │   ├── container.ts      # composition root, constructor injection
    │   ├── config/           # env.ts (only place reading process.env), constants.ts
    │   ├── routes/           # legacy (frozen) + v1
    │   ├── controllers/ services/ repositories/ models/
    │   ├── middleware/       # auth, validate, rateLimit, security, errorHandler, requestContext
    │   ├── errors/           # AppError taxonomy + codes + toAppError
    │   └── lib/              # logger (pino), hmac, memoryStore, interop
    └── tests/                # 3 unit + 1 integration
```

### Notable conventions

- **`client/AGENTS.md` warns that this Next.js version has breaking changes** and
  that `node_modules/next/dist/docs/` must be read before writing code. Confirmed:
  `middleware.ts` is now `proxy.ts`, and `params` is a `Promise` in route handlers.
- The root `package.json` is a task runner, **not** an npm workspace. Each package
  has its own lockfile. `npm run setup` installs all three.
- `server/` is ESM (`"type": "module"`) and imports with explicit `.ts` extensions,
  run via `tsx` in dev and compiled `dist/` in prod.

---

## 3. Feature inventory

| # | Feature | Status | Where | Notes |
|---|---|---|---|---|
| 1 | **Authentication** (Clerk) | ✅ Complete | [proxy.ts](../../client/proxy.ts), [clerkTokenVerifier.ts](../../server/src/services/identity/clerkTokenVerifier.ts) | Two separate integrations: cookies (client) + bearer JWT (server). Server fails closed when unconfigured. |
| 2 | **Problems — read** | ✅ Complete | [api/problems](../../client/app/api/problems/route.ts) | Hides `solution`/`hiddenTestCases` on detail; `testCases` still shipped to browser. |
| 3 | **Problems — write** | 🔴 Broken | [api/problems/[id]](../../client/app/api/problems/[id]/route.ts) | `PUT` and `DELETE` have **no auth whatsoever**. `POST` treats auth as optional. |
| 4 | **Submissions / grading** | 🔴 Broken | [Workspace.tsx:176-252](../../client/app/problems/[slug]/Workspace.tsx#L176) | **Grading runs in the browser.** Client computes the verdict and POSTs it. See §5. |
| 5 | **Playground** | ✅ Complete | [app/playground/](../../client/app/playground/) | Monaco, monarch DW grammar, multi-file inputs, test runner, samples, settings, history. Strong feature. |
| 6 | **Execution engine** | 🟡 Partial | [api/execute](../../client/app/api/execute/route.ts), [api/transform](../../client/app/api/transform/route.ts) | Thin unauthenticated proxies to an external compiler. No auth, no rate limit, no quota. |
| 7 | **Contests — CRUD/join** | 🟡 Partial | [api/contests](../../client/app/api/contests/route.ts) | Create, join, leave, invite codes, public/private all work. |
| 8 | **Contests — scoring** | 🔴 Missing | — | `participants[].score` and `.solvedProblems` are **never written by any code path**. Contests are join-only shells with no ranking. |
| 9 | **Weekly contest scheduler** | ✅ Complete | [weeklyContest.service.ts](../../server/src/services/contest/weeklyContest.service.ts) | Server-side, Saturday 15:00 UTC, auto-draws problems. Writes to the shared collection. Inherits #8's gap. |
| 10 | **Leaderboard** | 🟡 Partial | [api/leaderboard](../../client/app/api/leaderboard/route.ts) | Correct semantics (canonical rank, page-independent "me"). But loads the **entire** `submissions` + `problems` collections into memory per request. |
| 11 | **Profile (own)** | ✅ Complete | [api/profile](../../client/app/api/profile/route.ts) | Stats, 30-day activity, streak, recent log. Same full-scan pattern. |
| 12 | **Public profiles + follow** | ✅ Complete | [api/profile/follow](../../client/app/api/profile/follow/route.ts) | Follower/following arrays on `UserProfile`. |
| 13 | **Coins — earn** | ✅ Complete | [lib/coins.ts](../../client/lib/coins.ts) | Atomic `$inc` + capped 200-entry transaction log. |
| 14 | **Store — spend** | ✅ Complete | [api/store](../../client/app/api/store/route.ts) | **Best-written route in the client.** Conditional atomic debit, unique-index idempotency, refund-on-race. Prices server-side. |
| 15 | **Blog + voting** | ✅ Complete | [api/blog](../../client/app/api/blog/route.ts) | Denormalised counters kept correct via unique-index single-writer + delta arithmetic. Well done. |
| 16 | **Comments / discussion** | ✅ Complete | [api/comments](../../client/app/api/comments/route.ts) | Per-problem. Owner-only delete. No pagination. |
| 17 | **Bookmarks** | ✅ Complete | [api/bookmarks](../../client/app/api/bookmarks/route.ts) | Unique compound index. |
| 18 | **Notes** | 🔴 Broken | [api/notes](../../client/app/api/notes/route.ts) | **No auth, and notes are global per-problem, not per-user.** Any visitor can read and overwrite everyone's notes. |
| 19 | **AI problem generation (platform key)** | 🔴 Broken | [api/generate](../../client/app/api/generate/route.ts) | **No authentication.** Anyone can burn the platform `GEMINI_API_KEY` and write to the problem bank. |
| 20 | **AI generation (user key)** | 🟡 Partial | [api/generate-public](../../client/app/api/generate-public/route.ts) | Auth'd, BYO key — good design. But LLM output is mass-assigned into the model unvalidated. |
| 21 | **AI code review** | 🔴 Missing | — | Named in the brief; no implementation exists. |
| 22 | **GitHub integration** | 🟡 Partial | [lib/github.ts](../../client/lib/github.ts) | Solution auto-push, playground publish, repo browse/import. **OAuth tokens stored in plaintext** with `repo` scope. |
| 23 | **Sponsorship / payments** | ✅ Complete (dormant) | [server/src/services/payment/](../../server/src/services/payment/) | Razorpay orders, HMAC-verified webhook, raw-body handling. Correct. Not enabled — no keys set. |
| 24 | **Admin panel** | 🟡 Partial | [api/admin/](../../client/app/api/admin/) | User directory + role grant. No moderation, no content actions, no audit log. |
| 25 | **Store skins / theming** | ✅ Complete | [lib/themes.ts](../../client/lib/themes.ts), [SkinProvider](../../client/components/SkinProvider.tsx) | |
| 26 | **Guest progress migration** | 🔴 Broken | [api/migrate-guest-progress](../../client/app/api/migrate-guest-progress/route.ts) | Client sends a list of slugs; server marks each `Accepted` with no verification. |
| 27 | **Learning paths** | 🔴 Missing | — | Named in the brief and README; no implementation. |
| 28 | **Notifications** | 🔴 Missing | — | |
| 29 | **Analytics dashboard** | 🔴 Missing | — | Profile activity chart only. |
| 30 | **Docker DataWeave runtime** | 🔴 Not in repo | — | See §7. The runtime is an external Render service; no Dockerfile, compose entry, or source for it exists here. |

**Totals:** 13 complete · 8 partial · 9 broken/missing.

---

## 4. API inventory

### 4.1 Next.js API routes (`client/app/api/**`) — the real backend

Legend: 🔴 = security finding, see [02-security.md](02-security.md).

| Endpoint | Method | Auth | Validation | Rate limit | Collections touched |
|---|---|---|---|---|---|
| `/api/admin/roles` | GET | super-admin | — | none | `UserRole` |
| `/api/admin/roles` | POST | super-admin | `targetUserId` present | none | `UserRole` |
| `/api/admin/users` | GET | admin | — | none | `UserProfile`,`Submission`,`Comment`,`UserCoins`,`UserRole` |
| `/api/auth/github` | GET | session | returnTo allowlisted | none | — |
| `/api/auth/github/callback` | GET | session + state cookie | — | none | `GitHubIntegration` |
| `/api/auth/github/disconnect` | POST | session | — | none | `GitHubIntegration` |
| `/api/blog` | GET | public | — | none | `Blog` |
| `/api/blog` | POST | session | title+content non-empty | none | `Blog`,`UserCoins` |
| `/api/blog/[slug]` | GET | public | — | none | `Blog` |
| `/api/blog/[slug]` | DELETE | author or admin | — | none | `Blog`,`BlogVote` |
| `/api/blog/[slug]/vote` | GET | optional | — | none | `Blog`,`BlogVote` |
| `/api/blog/[slug]/vote` | POST | session | value ∈ {1,-1,0} | none | `Blog`,`BlogVote` |
| `/api/bookmarks` | GET·POST | session | — | none | `Bookmark` |
| `/api/coins` | GET | session | — | none | `UserCoins` |
| `/api/comments` | GET | public | slug present | none | `Comment` |
| `/api/comments` | POST | session | non-empty | none | `Comment`,`UserCoins` |
| `/api/comments` | DELETE | owner | id present | none | `Comment` |
| `/api/contests` | GET | optional | — | none | `Contest`,`Problem` |
| `/api/contests` | POST | session | required-fields check | none | `Contest`,`Problem` |
| `/api/contests/[id]` | GET | optional + visibility | — | none | `Contest` |
| `/api/contests/[id]` | POST | session | action enum | none | `Contest` |
| `/api/contests/[id]` | DELETE | creator | — | none | `Contest` |
| 🔴 `/api/execute` | POST | **none** | starts with `%dw` | **none** | — (proxies out) |
| 🔴 `/api/generate` | POST | **none** | **none** | **none** | `Problem` |
| `/api/generate-public` | POST | session | BYO key present | **none** | `Problem`,`UserCoins` |
| `/api/github/status` | GET | session | — | none | `GitHubIntegration` |
| `/api/leaderboard` | GET | optional | page/limit clamped | none | `Submission`(full),`Problem`(full),`UserProfile` |
| 🔴 `/api/migrate-guest-progress` | POST | session | array check only | none | `Submission`,`Problem` |
| 🔴 `/api/notes` | GET·PUT | **none** | **none** | **none** | `Note` |
| `/api/playground/github/import` | GET·POST | session | repo/path present | none | `GitHubIntegration` |
| `/api/playground/github/push` | POST | session | size limits ✓ | none | `GitHubIntegration` |
| 🔴 `/api/playground/share` | GET·POST | **none** | size limits ✓ | **none** | `PlaygroundSnippet` |
| `/api/problems` | GET | public | — | none | `Problem` |
| 🔴 `/api/problems` | POST | *optional* | **none** | **none** | `Problem`,`UserCoins` |
| `/api/problems/[id]` | GET | public | ObjectId-or-slug | none | `Problem` |
| 🔴 `/api/problems/[id]` | PUT | **none** | **none** | **none** | `Problem` |
| 🔴 `/api/problems/[id]` | DELETE | **none** | — | **none** | `Problem` |
| `/api/profile` | GET | session | — | none | `Problem`,`Submission`,`Bookmark`,`GitHubIntegration`,`UserProfile` |
| `/api/profile/follow` | POST | session | username present | none | `UserProfile` |
| `/api/profile/setup` | POST | session | — | none | `UserProfile` |
| `/api/profile/username` | PUT | session | regex + length ✓ | none | `UserProfile` |
| `/api/store` | GET | optional | — | none | `StorePurchase`,`UserCoins` |
| `/api/store` | POST | session | catalogue lookup ✓ | none | `StorePurchase`,`UserCoins` |
| 🔴 `/api/submissions` | POST | *optional* | **none — accepts client verdict** | **none** | `Submission`,`Problem`,`UserCoins`,`GitHubIntegration` |
| `/api/submissions` | GET | session | — | none | `Submission` |
| 🔴 `/api/transform` | POST | **none** | script non-empty | **none** | — (proxies out) |

**Rate limiting on the Next.js surface: zero endpoints. All 34 routes.**

### 4.2 Express routes (`server/src`)

| Endpoint | Method | Auth | Validation | Rate limit | CORS |
|---|---|---|---|---|---|
| 🔴 `/api/transform` | POST | none (frozen contract) | mapper normalises | **none — `legacy` policy defined but never applied** | wide open |
| `/health` | GET | none | — | none | wide open |
| `/healthcheck` | GET | none | — | none | wide open |
| `/api/v1/sponsorship/config` | GET | none | — | `global` 300/min | allowlist |
| `/api/v1/sponsorship/sponsors` | GET | none | zod query | `global` | allowlist |
| `/api/v1/sponsorship/orders` | POST | optional bearer | zod body + sanitize | `global` + `write` 60/min | allowlist |
| `/api/v1/sponsorship/verify` | POST | optional bearer | zod body + sanitize | `global` + `write` | allowlist |
| `/api/v1/sponsorship/webhook` | POST | HMAC signature | raw body | `global` | allowlist |

**Dead policies:** `legacy`, `auth`, `submission`, `compiler`, `ai`, `aiDaily`,
`generation` are all defined in [constants.ts](../../server/src/config/constants.ts)
and applied to nothing.

---

## 5. The grading integrity problem

This deserves its own section because it invalidates the product's core promise.

[client/app/problems/[slug]/Workspace.tsx](../../client/app/problems/[slug]/Workspace.tsx):

```
L177  const testCases = problem.testCases ?? [from examples]   // shipped to browser
L197  for (...) { await fetch("/api/execute", ...) }           // run in browser
L223  const expected = normalize(tc.expectedOutput)            // compare in browser
L233  finalStatus = allPassed ? "Accepted" : "Attempted"       // decide in browser
L243  await fetch("/api/submissions", { body: { status: finalStatus, ... } })
```

And [api/submissions/route.ts:44](../../client/app/api/submissions/route.ts#L44):

```ts
const submission = new Submission({ ...data, userId, userName, userImageUrl });
```

The server stores whatever verdict the client sent, then awards coins on it
(L48-L69) and pushes to the user's GitHub (L72).

**Consequence.** A single unauthenticated-shaped request with a valid session
cookie:

```
POST /api/submissions   { "problemId": "...", "problemSlug": "x", "code": "-", "status": "Accepted" }
```

grants +10 first-solve coins, +5/10/20 difficulty coins, a leaderboard solve, and
a public GitHub commit claiming the solve. Loop over `GET /api/problems` and you
are rank #1 in seconds, with no DataWeave written. `/api/migrate-guest-progress`
offers the same thing in bulk with a friendlier interface.

There is no server-side execution, no hidden-test enforcement, and no
anti-replay. `hiddenTestCases` exists in the schema and is correctly stripped from
API responses — but nothing ever runs them, so the protection is decorative.

The fix is architectural, not a patch: submissions must be graded server-side
against hidden tests, with the client sending only `{ problemId, code }`. The
`LIMITS.grading` block in [constants.ts](../../server/src/config/constants.ts)
(`maxTests: 24`, `totalBudgetMs: 25_000`, `concurrency: 3`) shows this was
already designed for the Express side — it just hasn't been built.

---

## 6. Database inventory

Single MongoDB database, 15 collections, accessed by two processes with
independent (and in two cases divergent) schema definitions.

| Collection | Model | Indexes declared | Missing indexes (by observed query) |
|---|---|---|---|
| `problems` | client + **server** (dup) | `slug` unique | `difficulty`, `category`, `createdAt`, `{difficulty,category}` |
| `submissions` | client | **none** | `userId`, `{userId,problemSlug}`, `{userId,status}`, `createdAt`, `problemId` |
| `contests` | client + **server** (dup) | `inviteCode` unique sparse | `startTime`, `isPublic`, `participants.userId`, `status` |
| `comments` | client | `problemSlug` | `{problemSlug,createdAt}`, `userId` |
| `blogs` | client | `slug` unique | `{published,createdAt}`, `authorId`, `tags` |
| `blogvotes` | client | `{blogSlug,userId}` unique ✓ | — |
| `bookmarks` | client | `{problemId,userId}` unique ✓ | `userId` |
| `notes` | client | `problemId` unique ⚠️ | **wrong key** — should be `{userId,problemId}` |
| `userprofiles` | client | `userId` unique, `username` unique ✓ | `followers`, `following` |
| `usercoins` | client | `userId` unique ✓ | — |
| `userroles` | client | `userId` unique ✓ | `role` |
| `storepurchases` | client | `{userId,itemId}` unique ✓ | `userId` |
| `playgroundsnippets` | client | `slug` unique+index (redundant pair) | `userId`, TTL for expiry |
| `githubintegrations` | client | `userId` unique ✓ | — |
| `sponsorships` | **server only** | see model | — |

### Findings

1. **`submissions` has no indexes at all** — and it is the hottest collection.
   `Submission.find()` (unbounded, no projection) runs on **every** leaderboard
   request; `Submission.find({userId})` runs on every profile load and every
   GitHub README update. This is the platform's first scaling wall and it will
   arrive early.
2. **`notes.problemId` is unique** — structurally enforcing one global note per
   problem, shared by all users. The unique index is what makes finding #18 a
   data-model bug rather than only an authz bug.
3. **Duplicate model definitions** for `Problem` and `Contest` across
   `client/models/` and `server/src/models/`. Two processes can write divergent
   shapes to the same documents; no migration story, no shared source of truth.
4. **No schema validation at the MongoDB level** (`$jsonSchema`), so mass-assigned
   fields from `{...data}` spreads land in documents unchecked.
5. **No TTL anywhere.** `playgroundsnippets` grows without bound from an
   unauthenticated endpoint. `ATTEMPT_TTL_MS` is defined server-side and unused.
6. **Unbounded arrays:** `UserProfile.followers` / `.following` and
   `Contest.participants` are embedded arrays with no cap (contests bound at
   `maxParticipants`, default 100; followers are unbounded → 16MB document ceiling).

---

## 7. Docker & runtime topology

### What exists

| File | Purpose | Assessment |
|---|---|---|
| [Dockerfile](../../Dockerfile) | Multi-stage build of `client/` | 🔴 `FROM node:18-alpine` while both `package.json` declare `"engines": {"node": ">=22"}`. Node 18 reached EOL in April 2025. Next.js 16 requires Node ≥20. **This image cannot correctly build or run the app.** |
| [docker-compose.yml](../../docker-compose.yml) | MongoDB for local dev | 🟡 `image: mongo:latest` (unpinned), **no authentication**, port published on `0.0.0.0:27017`, obsolete `version: '3.8'` key. |
| [.dockerignore](../../.dockerignore) | Context hygiene | ✅ Correct — excludes `node_modules`, `.next`, `**/.env*`, `.git`. Well reasoned. |
| [render.yaml](../../render.yaml) | `server/` blueprint | ✅ Strong. Pinned `NODE_VERSION: 22`, `sync: false` on every secret, health check deliberately on `/health` not `/healthcheck`. |
| [vercel.json](../../client/vercel.json) | `client/` deploy | ✅ Good. `ignoreCommand` skips no-op rebuilds; baseline security headers. |

### What does not exist

**The Docker-based DataWeave runtime is not in this repository.** No Dockerfile,
compose service, or source for it. The brief describes it as running on
`localhost:3000`; in practice:

```
client/api/{execute,transform}  ──► DWL_BACKEND_URL
                                    default https://dwlbackend.onrender.com

server (legacy /api/transform)  ──► DW_COMPILER_URL
                                    https://dataweave-playground-h1p7.onrender.com/api/transform
```

Two different upstream URLs, both third-party Render free-tier services, neither
version-pinned, neither owned by this repo. The Render free tier cold-starts after
15 minutes idle — the 15s `DW_TIMEOUT_MS` will routinely be exceeded on first
request.

**Therefore Phase 7's questions — isolation, cgroup limits, execution timeout,
network restrictions, container reuse, cleanup — cannot be answered from this
repository, because the sandbox is not here.** Anything that runs untrusted
DataWeave is outside the audit boundary. That is itself the most important Phase 7
finding, and it is treated as such in
[05-environments-runtime.md](05-environments-runtime.md#7-dataweave-runtime).

---

## 8. Cross-cutting concerns

| Concern | `server/` | `client/` |
|---|---|---|
| **Config** | ✅ zod-parsed, fail-fast, single `process.env` reader, capability gating | 🔴 `process.env.X` read ad hoc in 12+ files; no validation; silent `undefined` |
| **Logging** | ✅ pino + `pino-http`, request-id correlation, `logEvent` taxonomy | 🔴 `console.log`/`console.error`, unstructured; [api/transform](../../client/app/api/transform/route.ts#L96) logs user script content |
| **Errors** | ✅ `AppError` hierarchy, stable codes, `{success,error:{code,message,requestId}}` envelope | 🔴 `catch → getErrorMessage(e)` → raw message to client (leaks internals) |
| **Validation** | ✅ zod middleware → `req.validated` | 🔴 ad hoc `if (!x)` checks; several routes have none |
| **Rate limiting** | 🟡 built, 2 of 9 policies wired | 🔴 none |
| **Security headers** | ✅ helmet (CSP off — JSON-only API) | 🟡 3 static headers in `vercel.json`; **no CSP** on an app that ships `dangerouslySetInnerHTML` |
| **CORS** | ✅ allowlist on v1; wide open on legacy (deliberate) | n/a (same-origin) |
| **Mongo injection** | ✅ `sanitizeBody` strips `$`/dotted keys + strict zod | 🟡 mostly safe via string-typed `searchParams`, but `{...data}` spreads are unguarded |
| **Auth** | ✅ user id **always** from verified token | 🟡 correct where present; absent on 6 routes |
| **Graceful shutdown** | ✅ SIGTERM/SIGINT, drain, 10s force | n/a |
| **Health checks** | ✅ `/health` + `/healthcheck` split | 🔴 none |
| **DI / testability** | ✅ container with overrides | 🔴 module-level singletons, untestable |

---

## 9. Dependency assessment

Versions are current and deliberately chosen — Next 16.2.9, React 19.2.4,
Express 5.2.1, Mongoose 9.7.1, Zod 4, Clerk 7.5.7 / backend 3.8.2, Helmet 8,
`express-rate-limit` 8, Pino 9. Node pinned to 22 in CI and Render.

Two package-level notes:

1. **`shadcn` (^4.11.0) is listed under `dependencies`** in
   [client/package.json](../../client/package.json). It is a CLI code-generator,
   not a runtime library — it belongs in `devDependencies` (or nowhere). It pulls
   a large transitive tree into the production install.
2. **Dockerfile/engines mismatch** (§7) — `node:18-alpine` vs `>=22`.

> ⚠️ `npm audit` could not be run: no Node/npm binary is available in the audit
> sandbox. A CVE sweep is therefore **not** part of this report and is filed as
> backlog item **SEC-14**. Nothing above should be read as "no known
> vulnerabilities" — only as "not checked".

---

## 10. Dependency graph (as-built)

```
┌─────────┐
│ Browser │
└────┬────┘
     │
     ├─────────────────────────────────────────────┐
     │ same-origin                                 │ CORS, Bearer JWT
     ▼                                             ▼
┌──────────────────────────┐            ┌─────────────────────────┐
│ Next.js (Vercel)         │            │ Express (Render)        │
│                          │            │                         │
│ proxy.ts ─ Clerk session │            │ helmet → compression    │
│      │                   │            │   → requestContext      │
│      ▼                   │            │      │                  │
│ app/api/*/route.ts  ─────┼──┐         │      ├─ legacy router   │
│      │  (no service      │  │         │      │   /api/transform │
│      │   layer, no       │  │         │      │   (no limiter)   │
│      │   validation      │  │         │      │        │         │
│      │   layer)          │  │         │      └─ /api/v1         │
│      ▼                   │  │         │           cors+limiter  │
│ lib/db.ts ─ Mongoose     │  │         │             │           │
│      │                   │  │         │             ▼           │
│      │                   │  │         │  controller → service   │
│      │                   │  │         │       → repository      │
└──────┼───────────────────┘  │         └─────────────┼───────────┘
       │                      │                       │
       │   ┌──────────────────┘                       │
       │   │ fetch (unauthenticated)                  │
       ▼   ▼                                          ▼
┌────────────────────┐                    ┌──────────────────────┐
│ MongoDB            │◄───────────────────┤ MongoDB (same DB)    │
│ 15 collections     │   duplicate models │ 4 models             │
└────────────────────┘                    └──────────────────────┘
       │                                          │
       │ DWL_BACKEND_URL                          │ DW_COMPILER_URL
       ▼                                          ▼
┌───────────────────────────┐         ┌────────────────────────────────────┐
│ dwlbackend.onrender.com   │         │ dataweave-playground-h1p7          │
│ (external, unversioned)   │         │   .onrender.com  (external)        │
└───────────────────────────┘         └────────────────────────────────────┘
                        ▲
                        └── NOT IN THIS REPOSITORY

External SaaS: Clerk (auth) · Google Gemini (AI) · GitHub API (OAuth+repos) · Razorpay (dormant)
```

### The three structural problems this diagram makes visible

1. **The service layer is bypassed.** Two paths reach MongoDB, and the disciplined
   one carries almost no traffic.
2. **The execution sandbox is off-diagram.** The most security-sensitive component
   — the thing that runs untrusted user code — is a third-party URL with no
   contract, no pinning, and no ownership.
3. **There is no gateway.** No single place to enforce TLS policy, rate limits,
   WAF rules, or request logging. Vercel and Render each terminate their own TLS
   with their own defaults. This is what Phase 4 addresses.

---

## 11. What is genuinely good

An audit that only lists problems is misleading. These parts are above the bar for
the project's stage and should be **preserved and extended**, not rewritten:

- **`server/src` layering.** Composition root, constructor injection, ports/adapters,
  no framework magic. Tests fake `fetch` and the clock cleanly.
- **[config/env.ts](../../server/src/config/env.ts).** Reports every invalid var at
  once, gates features by capability, never scattered.
- **[api/store/route.ts](../../client/app/api/store/route.ts).** Conditional atomic
  debit, unique-index idempotency, refund-on-lost-race, catalogue-side pricing.
  Textbook.
- **[api/blog/[slug]/vote/route.ts](../../client/app/api/blog/[slug]/vote/route.ts).**
  Delta-derived counters with an explicit, correct argument for why `upsert` must
  be kept on retry.
- **Legacy contract discipline.** Byte-compatibility is preserved deliberately,
  including a reproduced key-collision bug, and locked with a contract test.
- **Secret hygiene.** No `.env` file has ever been committed (verified against full
  git history). `render.yaml` uses `sync: false` throughout; `.dockerignore`
  excludes `**/.env*`.
- **Comment quality.** Non-obvious decisions carry their rationale. This is rarer
  than it should be and it made this audit substantially faster.

---

## 12. Verdict

DWCode is a **feature-rich product on an unfinished foundation**. The feature
surface is genuinely impressive for the size — playground, contests, blog, coins,
store, GitHub integration, AI generation, public profiles. The `server/` package
shows a clear and correct picture of where the architecture is meant to go.

The gap is that the migration to it has barely started, and in the meantime the
Next.js API layer is carrying production traffic with no authorization layer, no
rate limiting, and browser-side grading.

The two things that must change before this platform can be called production-ready:

1. **Move grading server-side.** Without it, the leaderboard, coins, contests, and
   ranks are all decorative — and they are the product.
2. **Put an authorization and rate-limiting layer in front of the Next.js API
   routes.** Six endpoints currently accept unauthenticated writes to production
   data.

Both are addressed in [03-backlog.md](03-backlog.md), sequenced in
[README.md](README.md#implementation-order).
