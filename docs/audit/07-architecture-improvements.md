# DWCode — Architecture Improvements (Phase 8)

> The good news: most of the target architecture is **already built** in
> `server/`. This document is less "redesign the system" and more "finish the
> migration that was started, and stop the Next.js API routes from being a second,
> undisciplined backend."

---

## 1. The core decision

**Do not build a third architecture. Complete the second one.**

`server/src` already has a composition root, constructor injection, a
ports-and-adapters split, zod-validated config, a typed error taxonomy,
structured logging, a validation middleware and a rate limiter. It handles
sponsorship and a frozen legacy endpoint — about 4% of the platform's surface.
Meanwhile 34 Next.js route handlers reach Mongoose directly with none of that.

Two candidate directions:

| | **A — Consolidate into `server/`** | **B — Rebuild the discipline inside Next.js** |
|---|---|---|
| Effort | High (migrate 34 routes) | Medium (add layers to `app/api`) |
| Reuses existing work | ✅ entirely | ❌ duplicates it a third time |
| Long-lived processes (schedulers, pools, queues) | ✅ natural | ❌ serverless cannot hold them |
| Testability | ✅ supertest + DI already working | ⚠️ route handlers are awkward to test |
| Single deploy target | ❌ two | ✅ one |
| Matches the on-prem brief | ✅ | ⚠️ |

**Recommendation: A.** The deciding factor is not elegance — it is that the two
hardest remaining problems both need a long-lived process. Server-side grading
needs a warm compiler pool and a concurrency budget; contest scoring and GitHub
pushes need a job queue. Neither survives a serverless model that freezes between
invocations. The weekly-contest scheduler already lives on the server for exactly
this reason.

**Next.js keeps what it is good at:** SSR/RSC, routing, and auth session handling
at the edge. Its `app/api` routes become thin authenticated proxies to
`/api/v1` — and eventually most disappear as the client calls the API directly
through [lib/apiClient.ts](../../client/lib/apiClient.ts), which is already built
for exactly this and already used by the sponsor page.

---

## 2. Target layering

```
┌──────────────────────────────────────────────────────────────┐
│ PRESENTATION            client/app, client/components         │
│                         RSC + client components               │
└───────────────────────────┬──────────────────────────────────┘
                            │ lib/apiClient.ts  (Bearer, envelope-aware)
┌───────────────────────────▼──────────────────────────────────┐
│ TRANSPORT               server/src/routes                     │
│                         cors · rate limit · body parse ·      │
│                         auth · validate · authorize           │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│ CONTROLLER              server/src/controllers                │
│                         HTTP ⇄ DTO only. No business rules.   │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│ SERVICE                 server/src/services                   │
│                         business rules · transactions ·       │
│                         events. Framework-free.               │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│ REPOSITORY              server/src/repositories               │
│                         the ONLY place Mongoose is imported   │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│ DATA                    MongoDB · Redis · DataWeave runtime   │
└──────────────────────────────────────────────────────────────┘
```

**The one rule that keeps this honest:** a layer may only call the layer directly
below it. Enforce it mechanically with an ESLint `no-restricted-imports` rule —
`controllers/**` may not import `models/**`, `services/**` may not import
`express`. A convention that is not linted is a convention that decays.

---

## 3. What to add, in dependency order

### 3.1 Shared package (REF-01 → REF-02)

```
packages/shared/
├── constants/     DIFFICULTIES · SCORE_WEIGHTS · COIN_RULES · RANK_TIERS · LIMITS
├── schemas/       zod schemas — the single source for validation AND types
├── types/         DTOs inferred from the schemas
└── models/        one Mongoose definition per collection
```

Convert the repo to npm workspaces. This removes the duplicate `Problem` and
`Contest` models (two processes currently write divergent shapes to the same
documents) and makes the scoring rules impossible to fork.

**Derive types from schemas, never the reverse:**

```ts
export const createProblemSchema = z.object({
  title: z.string().min(3).max(200),
  difficulty: z.enum(DIFFICULTIES),
  category: z.string().min(1).max(50),
  description: z.string().min(10).max(20_000),
  testCases: z.array(testCaseSchema).min(1).max(LIMITS.grading.maxTests),
  hiddenTestCases: z.array(testCaseSchema).max(LIMITS.grading.maxTests),
});
export type CreateProblemDto = z.infer<typeof createProblemSchema>;
```

One definition validates the request, types the controller, types the client, and
generates the OpenAPI spec (DOC-02).

### 3.2 Repository layer (REF-06)

Three repositories exist already
([problem](../../server/src/repositories/problem.repository.ts),
[contest](../../server/src/repositories/contest.repository.ts),
[sponsorship](../../server/src/repositories/sponsorship.repository.ts)). Add
`submission`, `user`, `blog`, `comment`, `coins`, `bookmark`, `note` on the same
pattern.

Two things repositories must own that route handlers currently get wrong:

- **Projections.** `Submission.find()` with no projection is what makes the
  leaderboard a full scan ([M-9](02-security.md#m-9--unauthenticated-full-collection-scans)).
  A repository method has one obvious place to put `.select()`.
- **Aggregations.** Leaderboard ranking belongs in a `$group`/`$sort` pipeline
  inside `SubmissionRepository.leaderboard()`, not in JavaScript in a route
  handler.

### 3.3 Authorization module (REF-09)

Authorization is currently ad hoc: `requireAdmin()` in one file, `isAdmin()` in
another, inline `contest.createdBy !== userId` in a third, and **absent** in six
routes ([C-1](02-security.md#c-1--unauthenticated-problem-modification-and-deletion),
[C-2](02-security.md#c-2--unauthenticated-ai-generation-on-the-platforms-gemini-key),
[C-3](02-security.md#c-3--unauthenticated-readwrite-of-every-users-notes)). Scattered
authorization is how routes end up with none.

```ts
type Role = "guest" | "user" | "moderator" | "admin" | "superAdmin";

const POLICY = {
  "problem:read":   ["guest"],
  "problem:create": ["user"],
  "problem:update": ["admin"],      // or creator — resource check below
  "problem:delete": ["admin"],
  "role:grant":     ["superAdmin"],
  "note:read":      ["owner"],
  "note:write":     ["owner"],
} as const;

export function authorize(action: keyof typeof POLICY): RequestHandler { … }
```

Then a single test iterates `POLICY` and asserts every endpoint enforces its
entry — which is the mechanical version of the authorization matrix in
[04-testing.md §4.2](04-testing.md#42-the-authorization-matrix). A new route
without a policy entry fails the build.

### 3.4 Domain events (after the grading service)

Submission handling currently does five things inline: save, count previous
solves, award coins, award a difficulty bonus, and push to GitHub — the last one
as a floating `void promise.catch(console.error)`. That makes the request slow,
the failure modes silent, and contest scoring impossible to add without a sixth
inline block.

```ts
emit("submission.accepted", { userId, problemId, difficulty, isFirstSolve });

// subscribers, each independently testable and retryable
onSubmissionAccepted(awardCoins);
onSubmissionAccepted(updateContestScore);   // ← BUG-01 becomes a subscriber, not a rewrite
onSubmissionAccepted(enqueueGitHubPush);
onSubmissionAccepted(checkAchievements);
onSubmissionAccepted(updateStreak);
```

Start with an in-process `EventEmitter`. Only move to Redis pub/sub when there is
more than one API instance.

### 3.5 Queue and background jobs (OPS-06)

BullMQ on the Redis added in OPS-05.

| Queue | Jobs | Why off the request path |
|---|---|---|
| `github` | solution push, README update | 5 GitHub API round trips, currently inline and fire-and-forget |
| `ai` | problem generation, code review | 10–30s latency |
| `grading` | contest re-grade, bulk regrade | long-running |
| `notifications` | email, in-app | third-party latency |
| `maintenance` | leaderboard snapshot, index checks, TTL sweeps | scheduled |

Every job: idempotent, exponential backoff, dead-letter queue, and a metric. The
weekly-contest scheduler should migrate onto this rather than keeping its own
`setInterval`, so it survives a restart mid-window.

### 3.6 Caching

| Layer | Use | TTL |
|---|---|---|
| Cloudflare edge | static assets, public pages | 1 year / 5 min |
| Next.js ISR | problem list, blog index | 60s |
| Redis | leaderboard, problem detail, user stats | 30–300s |
| Mongo working set | — | — |

Cache keys must include the viewer's identity where the response varies by user.
The leaderboard's `me` field is exactly this trap: cache the public rows, compute
`me` per request.

### 3.7 Config, logging, errors on the client (REF-07, REF-08, SEC-16)

Three patterns exist on the server and are missing on the client. Port them
rather than inventing new ones:

- **Config** — one zod-validated module, fail-fast, mirroring
  [server/src/config/env.ts](../../server/src/config/env.ts). Today
  `process.env.X` is read in a dozen files with no validation.
- **Logging** — pino with a request id, replacing `console.log`. The transform
  route currently logs user script content
  ([H-6](02-security.md#h-6--verbose-error-messages-returned-to-clients)).
- **Errors** — reuse [server/src/errors/](../../server/src/errors/) verbatim.
  `{success:false,error:{code,message,requestId}}` instead of raw exception text.

### 3.8 Feature flags

A `flags` collection plus a typed accessor, evaluated per user with percentage
rollout. Needed immediately for OPS-07 (shadow-running the new DataWeave runtime)
and SEC-06 (disabling guest migration without a deploy).

### 3.9 Observability and health

Covered in [05-environments-runtime.md §6](05-environments-runtime.md#6-observability).
The one addition here: `/health` (liveness, dependency-free) and `/ready`
(readiness, checks Mongo + Redis + compiler) on **both** services. The server
already splits these correctly and [render.yaml](../../render.yaml) documents why;
the client has neither (OPS-04).

### 3.10 OpenAPI (DOC-02)

Generate from the zod schemas with `zod-to-openapi`. Serve at
`/api/v1/openapi.json` with Scalar or Redoc. Generate a typed client for
`client/lib/api/`. Contract-test the spec against real responses so it cannot
drift.

---

## 4. Migration strategy

**Strangler-fig, one domain at a time, never a big-bang rewrite.**

```
Phase A — the Next.js route proxies to /api/v1, response shape unchanged
   client ──► /api/problems (Next.js) ──► /api/v1/problems (Express) ──► Mongo

Phase B — the client calls the API directly via apiClient
   client ──► /api/v1/problems ──► Mongo

Phase C — delete the Next.js route
```

Phase A is the safe part: the client is untouched, so a bad migration is one
revert away. Only move to Phase B once the proxy has been stable in production.

**Order** — by risk and dependency, not by size:

| # | Domain | Why here |
|---|---|---|
| 1 | **Submissions + grading** | Fixes [C-4](02-security.md#c-4--client-side-grading--the-achievement-economy-is-forgeable). Everything else depends on trustworthy submissions. |
| 2 | **Problems** | Fixes [C-1](02-security.md#c-1--unauthenticated-problem-modification-and-deletion). Small surface, high risk. |
| 3 | **Leaderboard** | Depends on 1. Fixes [M-9](02-security.md#m-9--unauthenticated-full-collection-scans). |
| 4 | **Contests** | Depends on 1. Unblocks BUG-01 (scoring never implemented). |
| 5 | **Coins + store** | Depends on 1. The store logic is already correct — port carefully, do not rewrite. |
| 6 | **Blog, comments, bookmarks, notes** | Lower risk, larger surface. |
| 7 | **GitHub, AI** | Depends on the queue. |

Keep in Next.js permanently: Clerk session handling, OAuth redirect callbacks
(they need cookie access on the app origin), and anything purely presentational.

---

## 5. Anti-patterns to retire

| Pattern | Where | Replace with |
|---|---|---|
| `new Model({...req.body})` | 5 routes | zod parse → explicit field map |
| `findByIdAndUpdate(id, body)` | [problems/[id]](../../client/app/api/problems/[id]/route.ts) | allowlisted `$set` |
| `catch { return json({error: e.message}) }` | ~30 routes | error envelope with a request id |
| `try { auth() } catch {}` then continue | [problems](../../client/app/api/problems/route.ts), [submissions](../../client/app/api/submissions/route.ts) | explicit `requireAuth` or `optionalAuth` |
| `while (await findOne(...))` uniqueness loops | blog, profile/setup | write-then-catch E11000 → 409 |
| `void promise.catch(console.error)` | [submissions:72](../../client/app/api/submissions/route.ts#L72) | queue job with retry + DLQ |
| Business rules in route handlers | leaderboard, profile, submissions | service layer |
| Mongoose imported in a route handler | all 34 | repository |
| `console.log` | throughout the client | pino |
| Duplicated model definitions | `Problem`, `Contest` | `packages/shared/models` |

---

## 6. Sequenced roadmap

| Stage | Work | Effort | Unlocks |
|---|---|---|---|
| **0. Stop the bleeding** | P0 fixes in [03-backlog.md](03-backlog.md) | 4d | No unauthenticated writes |
| **1. Foundations** | Workspaces · shared package · dedupe models · Redis · client config/logging/errors | 8d | Everything below |
| **2. Grading** | Execution service · server-side grading · submission repo | 10d | Honest leaderboard, contests, coins |
| **3. Authorization** | RBAC module · policy table · authorization matrix tests | 4d | Route cannot ship without a policy |
| **4. Migration A** | Problems, submissions, leaderboard → `/api/v1` | 10d | Discipline where the traffic is |
| **5. Async** | Queue · domain events · contest scoring · GitHub off the request path | 8d | Contests actually work |
| **6. Migration B** | Contests, coins, blog, comments, notes → `/api/v1` | 12d | One backend |
| **7. Platform** | OpenAPI · feature flags · observability · caching | 8d | Operable |

**~64 engineer-days.** Stages 0–2 are the ones that change whether the product
works as advertised; 3–7 change how fast it can be built on.

---

## 7. Trade-offs worth stating plainly

**Two deploy targets instead of one.** Consolidating on `server/` means the
frontend and API deploy separately, with a version-skew window between them. This
is the real cost of Option A. Mitigate with additive-only API changes, a
versioned `/api/v1` prefix (already in place), and deploying the API before the
client. The alternative — everything in Next.js — trades this away and loses warm
compiler pools and background jobs, which the product needs more.

**Latency of an extra hop during Phase A.** A proxied route is
browser → Vercel → Render → Mongo instead of browser → Vercel → Mongo. Tens of
milliseconds, transitional, and gone by Phase B. Worth it for a revertible
migration.

**The shared package couples the two halves.** A breaking change to a shared
schema forces both to update together. That is the point — the current freedom to
diverge is what produced two different `Problem` models writing to one
collection.

**Event-driven indirection costs traceability.** "Where did this coin come from?"
gets harder when awarding is a subscriber. Pay this back with structured event
logging and a correlation id on every emit — and note that the current
alternative, five inline side effects with one of them fire-and-forget, is not
actually more traceable.

**Do not adopt microservices.** At this size a well-layered modular monolith plus
an isolated execution runtime is strictly better: one deploy, one transaction
boundary, no distributed-tracing prerequisite to debug a request. The runtime pool
is the only component that genuinely needs separate scaling and isolation — and
it is separate for security reasons, not architectural fashion.
