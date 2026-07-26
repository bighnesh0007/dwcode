# DWCode — Security Audit (Phase 6)

> Audit date: 2026-07-26 · Commit: `5a91223`
> Method: manual source review of all 34 Next.js route handlers, all Express
> routes/middleware, all 19 Mongoose models, both auth integrations, the OAuth
> flow, the markdown renderer, and all deployment configuration.
> **No code was modified during this audit.**

---

## Summary

| Severity | Count | Theme |
|---|---|---|
| 🔴 **Critical** | 5 | Unauthenticated writes to production data; forgeable achievement economy |
| 🟠 **High** | 8 | Stored XSS; plaintext OAuth tokens; no rate limiting anywhere; missing CSP |
| 🟡 **Medium** | 11 | Mass assignment, info disclosure, prompt injection, TOCTOU races, weak isolation |
| 🟢 **Low** | 7 | Hardening, hygiene, defence-in-depth |
| **Total** | **31** | |

Of the 31 findings, **24 are on the Next.js API surface** (`client/app/api/**`)
and 7 on the Express server or infrastructure. The correlation is not accidental:
the Express side has an authorization middleware, a validation middleware, a rate
limiter and an error envelope; the Next.js side has none of those, and each route
re-implements security from scratch — or doesn't.

### The two findings that matter most

- **C-1 — unauthenticated `PUT`/`DELETE` on `/api/problems/[id]`.** Anyone on the
  internet can rewrite or delete the entire problem bank with `curl`. No account
  needed. This is the highest-urgency item in the report.
- **C-4 — the browser is the grader.** The leaderboard, coins, ranks and contests
  are all derived from a verdict the client computes and self-reports. For a
  competitive-practice platform this is not a bug in a feature; it invalidates the
  feature set.

### Scope note

`npm audit` **was not run** — no Node/npm binary was available in the audit
environment. No claim is made about published CVEs in the dependency tree. See
**L-7**.

---

## 🔴 Critical

### C-1 · Unauthenticated problem modification and deletion

**File:** [client/app/api/problems/[id]/route.ts:32-64](../../client/app/api/problems/[id]/route.ts#L32)
**CWE:** CWE-306 Missing Authentication for Critical Function
**OWASP:** A01 Broken Access Control

`PUT` and `DELETE` contain no `auth()` call, no `requireAdmin()`, and no ownership
check of any kind:

```ts
export async function DELETE(req, { params }) {
  const { id } = await params;
  await connectToDatabase();
  const deleted = await Problem.findByIdAndDelete(id);   // ← no caller check
  ...
}
```

`proxy.ts` does not help: its protected matcher is `/profile`, `/create(.*)`,
`/admin(.*)`, `/blog/new(.*)`. `/api/problems/*` is not covered.

**Impact.** Total destruction or silent corruption of the problem bank by an
anonymous attacker. `PUT` additionally accepts the whole document, so an attacker
can rewrite `solution`, `hiddenTestCases`, and `testCases` — turning every problem
into one they have already "solved".

**Exploit**
```bash
curl -X DELETE https://<host>/api/problems/<any-id>          # gone
curl -X PUT    https://<host>/api/problems/<any-id> \
     -H 'content-type: application/json' \
     -d '{"title":"pwned","description":"<attacker content>"}'
```

**Fix.** Require `requireAdmin()` (or creator-or-admin) on both handlers.
Validate the body with a zod schema and allowlist mutable fields — never
`findByIdAndUpdate(id, data)` with a raw body.

---

### C-2 · Unauthenticated AI generation on the platform's Gemini key

**File:** [client/app/api/generate/route.ts:9-15](../../client/app/api/generate/route.ts#L9)
**CWE:** CWE-306 · CWE-770 Allocation Without Limits
**OWASP:** A01 · A04 Insecure Design

```ts
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) { ... }
  const { difficulty, category, topic } = await req.json();   // ← no auth above this line
```

No `auth()`, no rate limit, and the generated document is persisted with
`new Problem({...generatedData, slug, ...})` and `.save()`.

**Impact.**
1. **Direct financial loss** — an attacker drains the platform's Gemini quota/billing at will.
2. **Unauthenticated write to the problem bank** — every call inserts a document.
3. **Denial of service** — no concurrency bound; the paired `generation` rate-limit
   policy exists server-side (`4/min`) but is not applied here.

Contrast [generate-public/route.ts](../../client/app/api/generate-public/route.ts),
which *does* require auth and makes the user bring their own key. That route is the
correct design; this one appears to be its unremoved predecessor.

**Fix.** Require auth; apply the `generation` + `aiDaily` policies; validate
`difficulty`/`category` against `DIFFICULTIES` and a category enum; require
admin approval before an AI-generated problem becomes visible.

---

### C-3 · Unauthenticated read/write of every user's notes

**File:** [client/app/api/notes/route.ts](../../client/app/api/notes/route.ts) · [client/models/Note.ts](../../client/models/Note.ts)
**CWE:** CWE-306 · CWE-639 Authorization Bypass Through User-Controlled Key
**OWASP:** A01

Neither `GET` nor `PUT` calls `auth()`. Worse, the model makes notes *structurally*
global:

```ts
problemId: { ..., unique: true }        // one Note document per problem, for everyone
```

```ts
const note = await Note.findOne({ problemId });                    // GET — anyone
await Note.findOneAndUpdate({ problemId }, { ...content }, { upsert: true });  // PUT — anyone
```

**Impact.** Private study notes are world-readable by problem id and
world-writable. Any visitor can enumerate `/api/problems`, then read and overwrite
every note on the platform. Users have no signal this is happening — the
[Workspace](../../client/app/problems/[slug]/Workspace.tsx#L94) UI presents notes
as personal.

**Fix.** Require auth; key on `{ userId, problemId }` with a compound unique index;
scope every query by `userId` from the session. Requires a data migration — the
existing single-note-per-problem documents have no owner and should be discarded
or assigned to their creator if that is recoverable.

---

### C-4 · Client-side grading — the achievement economy is forgeable

**Files:** [Workspace.tsx:176-252](../../client/app/problems/[slug]/Workspace.tsx#L176) · [api/submissions/route.ts:26-77](../../client/app/api/submissions/route.ts#L26)
**CWE:** CWE-602 Client-Side Enforcement of Server-Side Security
**OWASP:** A04 Insecure Design

The browser fetches test cases, runs them, compares outputs, decides
`finalStatus`, and posts it. The server persists the verdict verbatim and pays out
on it:

```ts
const submission = new Submission({ ...data, userId, userName, userImageUrl });
await submission.save();
if (userId && data.status === "Accepted") {          // ← trusts client-supplied status
  await awardCoins(userId, 10, "first_solve", ...);
  await awardCoins(userId, bonus, "difficulty_bonus", ...);   // Easy 5 / Medium 10 / Hard 20
  void pushSolutionToGithub(userId, problem, data.code);
}
```

**Impact.** Every ranked artefact on the platform is forgeable by any signed-in
user with one HTTP request per problem:

```bash
curl -X POST https://<host>/api/submissions -b "<session>" \
  -H 'content-type: application/json' \
  -d '{"problemId":"<id>","problemSlug":"<slug>","code":"-","status":"Accepted"}'
```

→ coins, leaderboard rank, solved count, rank tier, streak, and a **public GitHub
commit** in the victim-facing sense (it is the attacker's own repo, but it
launders the claim as evidence).

`hiddenTestCases` is correctly stripped from API responses — but nothing ever
executes them, so the protection is decorative.

**Related:** **C-5** is the bulk version of the same flaw.

**Fix (architectural).** Grade on the server:
- client sends `{ problemId, code }` only;
- the backend runs `testCases` **and** `hiddenTestCases` in the sandbox, honouring
  `LIMITS.grading` (`maxTests: 24`, `totalBudgetMs: 25_000`, `concurrency: 3`);
- the backend computes the verdict, writes the submission, and awards coins from
  `COIN_RULES`;
- `status` becomes a server-only field, rejected if present in the request body.

This is the largest single item in the backlog (**SEC-04** / **FEAT-01**) and the
reason [03-backlog.md](03-backlog.md) sequences a server-side execution service first.

---

### C-5 · Bulk solve forgery via guest-progress migration

**File:** [client/app/api/migrate-guest-progress/route.ts:15-43](../../client/app/api/migrate-guest-progress/route.ts#L15)
**CWE:** CWE-602 · CWE-863 Incorrect Authorization
**OWASP:** A04

Authentication is present, but the client supplies an arbitrary list of slugs and
each one becomes an `Accepted` submission with no verification that the user ever
ran anything:

```ts
const { slugs } = await req.json();
for (const slug of slugs) {
  ...
  const submission = new Submission({ ..., status: "Accepted", code: "// migrated from guest session" });
  await submission.save();
}
```

**Impact.** One request marks every problem on the platform solved. There is no
cap on `slugs.length`, no idempotency window, and no "guest session" evidence of
any kind — the endpoint takes the client's word for the entire thing. It is also
an unbounded write loop (one `exists` + one `findOne` + one `save` per slug), so a
large array is a database DoS as well.

**Fix.** Either (a) drop the endpoint and migrate guest progress from
server-verified anonymous submission records keyed by a signed guest id, or
(b) keep it but cap `slugs.length`, require a signed guest-session token issued by
the server, and re-grade each claimed solve server-side before crediting it.

---

## 🟠 High

### H-1 · Stored XSS via attribute injection in the markdown renderer

**File:** [client/lib/markdown.ts:11-32](../../client/lib/markdown.ts#L11)
**CWE:** CWE-79 Improper Neutralization of Input During Web Page Generation
**OWASP:** A03 Injection
**Status: confirmed by execution, not inferred.**

The renderer escapes `&`, `<` and `>` — but **not** `'` — and then emits the link
URL into a **single-quoted** attribute:

```ts
.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
...
.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
  "<a href='$2' class='...' target='_blank' rel='noopener noreferrer'>$1</a>")
```

The file's own header comment states this "closes the stored-XSS vector". It does
not — it closes *tag* injection while leaving *attribute* injection open.

**Verified output.** Input:
```
[click](https://e.com'onmouseover='location=name)
```
Produces:
```html
<a href='https://e.com'onmouseover='location=name' class='c' target='_blank' rel='noopener noreferrer'>click</a>
```

HTML5 tokenisation recovers from the missing space after a quoted attribute value
(`after attribute value (quoted) state` → reconsume in `before attribute name
state`), so browsers parse `onmouseover` as a real event handler. `location=name`
needs no parentheses, no spaces, no `&` and no backticks — each of which the
filter would otherwise have blocked — and `window.name` is attacker-controlled
from the referring page, giving arbitrary script execution.

**Reachable from three stored sinks, all rendered with `dangerouslySetInnerHTML`:**

| Sink | Content origin | Who sees it |
|---|---|---|
| [blog/[slug]/page.tsx:217](../../client/app/blog/[slug]/page.tsx#L217) | any signed-in user's post | every reader |
| [components/Comments.tsx:175](../../client/components/Comments.tsx#L175) | any signed-in user's comment | every problem viewer |
| [Workspace.tsx:350](../../client/app/problems/[slug]/Workspace.tsx#L350) | `problem.description` — writable **unauthenticated** via **C-1** | every solver |

The third is the severe one: chained with C-1, an anonymous attacker stores XSS
that fires for every user who opens the problem. With no CSP (**H-4**) there is
nothing to contain it, and session theft against Clerk-authenticated admins
follows.

**Fix.** Replace the hand-rolled renderer. Use a maintained markdown parser with a
sanitiser (`marked` + `DOMPurify`, or `micromark`/`remark` with
`rehype-sanitize`). If the hand-rolled version must stay short-term: escape `'`
and `"` in the first pass, and additionally validate the captured URL with
`new URL()` against an `http:`/`https:` protocol allowlist.

---

### H-2 · GitHub OAuth tokens stored in plaintext, with excessive scope

**Files:** [api/auth/github/callback/route.ts:83-93](../../client/app/api/auth/github/callback/route.ts#L83) · [models/GitHubIntegration.ts](../../client/models/GitHubIntegration.ts) · [api/auth/github/route.ts:29](../../client/app/api/auth/github/route.ts#L29)
**CWE:** CWE-522 Insufficiently Protected Credentials · CWE-250 Excessive Privilege
**OWASP:** A02 Cryptographic Failures

```ts
await GitHubIntegration.findOneAndUpdate({ userId },
  { ..., accessToken, ... }, { upsert: true });   // raw token → MongoDB
```
```ts
accessToken: { type: String, required: true },     // no encryption, no getter/setter
```

Requested scope is `repo` — **full read/write to all of the user's private
repositories**, when the feature only ever writes to one repo it creates itself.

The encryption key already exists and is already provisioned: `TOKEN_ENCRYPTION_KEY`
is defined in [server/src/config/env.ts:66](../../server/src/config/env.ts#L66)
("32-byte hex key for AES-256-GCM encryption of stored GitHub tokens"), declared in
[render.yaml:101](../../render.yaml#L101), and present in `server/.env`. The client
never reads it, because the client never got the encryption code.

**Impact.** A single database read — leaked backup, Atlas misconfiguration, Mongo
injection, or an insider — yields plaintext credentials granting full private-repo
access for every connected user. This is a breach of *other people's* GitHub
accounts, not just DWCode's data.

**Fix.**
1. Reduce scope to `public_repo` (or, if private targets are required, keep `repo`
   but say so explicitly at the consent step).
2. Encrypt at rest with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`; store
   `{iv, ciphertext, authTag}`.
3. Migrate existing rows: re-encrypt in place, or invalidate and force reconnect
   (safer — it also revokes over-scoped grants).
4. Prefer a GitHub **App** with per-repo installation over an OAuth App with
   account-wide scope.

---

### H-3 · No rate limiting on any user-facing endpoint

**Files:** all 34 of [client/app/api/](../../client/app/api/) · [server/src/routes/legacy/dataweave.legacy.routes.ts](../../server/src/routes/legacy/dataweave.legacy.routes.ts)
**CWE:** CWE-770 Allocation of Resources Without Limits
**OWASP:** A04

Zero of the 34 Next.js routes are rate limited. On the Express side the machinery
exists and nine policies are defined — `global`, `legacy`, `auth`, `submission`,
`compiler`, `ai`, `aiDaily`, `generation`, `write` — but `grep createLimiter`
returns only three call sites, applying **`global`** and **`write`**. In
particular:

```ts
// routes/legacy/dataweave.legacy.routes.ts — the 5 MB compiler proxy
router.post("/api/transform", express.json({ limit: LIMITS.body.legacy }), controller.transform);
//          ↑ no createLimiter("legacy") — the policy is defined and never used
```

**Highest-value abuse targets:**

| Endpoint | Auth | Cost per request |
|---|---|---|
| `POST /api/generate` | none (**C-2**) | a Gemini call, billed to the platform |
| `POST /api/transform`, `POST /api/execute` | none | a full DataWeave compile |
| `POST /api/transform` (Express legacy) | none | 5 MB body + a full compile |
| `POST /api/playground/share` | none | unbounded DB growth (**M-5**) |
| `POST /api/submissions` | session | coin awards + a GitHub API write |
| `GET /api/leaderboard` | none | **full scan of `submissions` + `problems`** (**M-9**) |

`GET /api/leaderboard` deserves emphasis: it is unauthenticated, uncached, and
loads two entire collections into Node memory per call. It is a one-line
application-layer DoS today and gets worse with every submission written.

**Fix.** Apply the existing policies where they were designed to go. For the
Next.js routes, add a shared limiter (Upstash/Vercel KV, or a Redis-backed
`express-rate-limit` store once traffic moves to the gateway — see
[05-environments-runtime.md](05-environments-runtime.md)). In-memory limiting is
useless on Vercel's serverless model: each invocation may be a fresh process.

---

### H-4 · No Content-Security-Policy on the HTML application

**Files:** [client/vercel.json:20-29](../../client/vercel.json#L20) · [client/next.config.ts](../../client/next.config.ts)
**CWE:** CWE-1021 Improper Restriction of Rendered UI Layers
**OWASP:** A05 Security Misconfiguration

`vercel.json` sets `X-Content-Type-Options`, `Referrer-Policy` and
`X-Frame-Options` — but no CSP. Helmet on the Express side deliberately disables
CSP with the correct justification ("No HTML is served"); that reasoning does
**not** transfer to the Next.js app, which serves HTML *and* renders
`dangerouslySetInnerHTML` in three places.

Missing alongside it: `Strict-Transport-Security`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`.

**Impact.** No containment layer for **H-1**. A CSP without `unsafe-inline` would
have blocked the confirmed `onmouseover` payload outright.

**Fix.** Add a nonce-based CSP via `next.config.ts` headers or the proxy. Monaco
needs `worker-src blob:` and (in some configurations) `script-src 'wasm-unsafe-eval'`;
Clerk needs its own `frame-src`/`connect-src` entries. Ship `Content-Security-Policy-Report-Only`
first, collect violations for a week, then enforce.

---

### H-5 · Mass assignment on every document-creating route

**Files:** [api/problems/route.ts:43](../../client/app/api/problems/route.ts#L43) · [api/problems/[id]/route.ts:43](../../client/app/api/problems/[id]/route.ts#L43) · [api/submissions/route.ts:44](../../client/app/api/submissions/route.ts#L44) · [api/generate-public/route.ts:66](../../client/app/api/generate-public/route.ts#L66) · [api/generate/route.ts:76](../../client/app/api/generate/route.ts#L76)
**CWE:** CWE-915 Improperly Controlled Modification of Object Attributes
**OWASP:** A08 Software and Data Integrity Failures

```ts
new Problem({ ...data, slug, createdByAI: false, createdBy })   // raw body spread
new Submission({ ...data, userId, userName, userImageUrl })     // raw body spread
Problem.findByIdAndUpdate(id, data, { new: true })              // raw body, no allowlist
new Problem(parsedData)                                         // raw *LLM output*
```

Trailing explicit keys do override the spread, so `userId` cannot be spoofed on
`Submission` — that part is safe. What is not safe is every other field:
`status`, `executionTime`, `createdAt`, `solution`, `testCases`, `hiddenTestCases`
are all attacker-settable. `status` is the mechanism behind **C-4**.

`new Problem(parsedData)` in `generate-public` is a distinct hazard: it mass-assigns
**model output** into a persisted document. Combined with **M-2** (prompt
injection), the content of the problem bank becomes attacker-influenced.

**Fix.** A zod schema per endpoint; construct documents from `result.data` with
explicit field mapping. Never spread a request body into a Mongoose constructor.
Mark server-owned fields (`status`, `userId`, `createdAt`, `createdBy`) as
non-settable at the schema level.

---

### H-6 · Verbose error messages returned to clients

**Files:** ~30 handlers via [client/lib/errors.ts](../../client/lib/errors.ts) · [api/playground/github/import/route.ts:65](../../client/app/api/playground/github/import/route.ts#L65) · [lib/github.ts:46](../../client/lib/github.ts#L46)
**CWE:** CWE-209 Generation of Error Message Containing Sensitive Information
**OWASP:** A05

The near-universal pattern is:

```ts
} catch (error) {
  return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
}
```

which returns raw exception text. Mongoose errors disclose collection names, field
paths, index names and validation internals; connection errors can disclose the
`MONGODB_URI` host. The GitHub proxies go further and forward upstream bodies
verbatim:

```ts
return NextResponse.json({ error: `GitHub returned ${ghRes.status}: ${detail}` }, { status: ghRes.status });
throw new Error(`GitHub request failed (${response.status}): ${detail}`);
```

Meanwhile [api/transform/route.ts:96-97](../../client/app/api/transform/route.ts#L96)
logs user script content to stdout on every request — a privacy problem in shared
log storage, not just a disclosure one.

**Fix.** Adopt the Express side's model: log the full error server-side with a
request id, return `{ success:false, error:{ code, message, requestId } }` with a
generic message. The taxonomy already exists in
[server/src/errors/](../../server/src/errors/) — reuse it.

---

### H-7 · MongoDB exposed without authentication in local development

**File:** [docker-compose.yml](../../docker-compose.yml)
**CWE:** CWE-306 · CWE-1188 Insecure Default Initialization
**OWASP:** A05

```yaml
services:
  mongodb:
    image: mongo:latest        # unpinned
    ports:
      - '27017:27017'          # binds 0.0.0.0 — reachable from the LAN
    # no MONGO_INITDB_ROOT_USERNAME / _PASSWORD — auth disabled
```

Any device on the developer's network — coffee-shop Wi-Fi, shared office LAN —
can read and write the whole database unauthenticated. Developer databases
routinely contain copies of production data.

**Fix.** Bind to loopback (`127.0.0.1:27017:27017`), pin the image
(`mongo:8.0.x`), enable auth via `MONGO_INITDB_ROOT_*`, add a healthcheck, and
drop the obsolete `version:` key.

---

### H-8 · Container image runs an EOL Node major the app does not support

**File:** [Dockerfile:1](../../Dockerfile#L1)
**CWE:** CWE-1104 Use of Unmaintained Third-Party Components
**OWASP:** A06 Vulnerable and Outdated Components

```dockerfile
FROM node:18-alpine AS base
```

Both `package.json` files declare `"engines": {"node": ">=22"}`; CI pins `22.x`;
`render.yaml` pins `NODE_VERSION: 22`. Node 18 went end-of-life in April 2025 and
receives no security patches. Next.js 16 requires Node ≥ 20.

Also in this file: the deprecated space-separated `ENV KEY value` form (three
occurrences), no digest pinning, and no `HEALTHCHECK`.

**Fix.** `FROM node:22-alpine` (ideally digest-pinned), `ENV KEY=value`, add a
`HEALTHCHECK`, and add a CI job that actually builds the image — the current
pipeline never does, which is why the mismatch survived.

---

## 🟡 Medium

### M-1 · Problem creation open to unauthenticated callers

[api/problems/route.ts:29-51](../../client/app/api/problems/route.ts#L29) — `POST`
wraps `auth()` in `try { } catch { /* ignore */ }` and proceeds with
`createdBy = ""`. Anonymous users can inject arbitrary documents into the problem
bank (no coins are awarded, which is the only limiter). Combined with **H-1**, an
anonymous attacker plants a stored-XSS payload in `description`.
**Fix:** require auth; require admin (or a moderation queue) to publish.

### M-2 · Prompt injection in AI problem generation

[api/generate/route.ts:17-52](../../client/app/api/generate/route.ts#L17) —
`difficulty`, `category` and `topic` are interpolated raw into the system prompt.
An attacker sets `topic` to instructions that override the JSON contract and
control the generated content, which is then **persisted** to the problem bank
(**H-5**) and later rendered as HTML (**H-1**). Unauthenticated (**C-2**), so the
chain needs no account.
**Fix:** validate `difficulty`/`category` against enums; length-cap and
delimiter-escape `topic`; validate the model's JSON against a strict zod schema
before persisting; hold AI content in a moderation queue.

### M-3 · Path traversal into arbitrary GitHub API endpoints

[api/playground/github/import/route.ts:53](../../client/app/api/playground/github/import/route.ts#L53)
```ts
const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
```
`repo` and `path` are unvalidated. `repo=../../user` normalises to
`https://api.github.com/user/...`, reaching endpoints the feature never intended,
authenticated with the user's `repo`-scoped token (**H-2**). The host cannot be
changed, so this is not full SSRF — but it is an unintended-API-surface issue with
a broadly-scoped credential.
**Fix:** validate `repo` against `^[\w.-]+/[\w.-]+$`, reject `..` in `path`, and
`encodeURIComponent` each segment.

### M-4 · Unauthenticated compiler proxies

[api/execute/route.ts](../../client/app/api/execute/route.ts) and
[api/transform/route.ts](../../client/app/api/transform/route.ts) accept anonymous
requests, apply no size cap of their own, no timeout, and no quota, then forward
to the DataWeave compiler. The platform becomes a free public DataWeave-execution
service, and the cost lands on the upstream Render instance. The `compiler` policy
(60/min/user) exists for exactly this and is unused.
**Fix:** require auth for `/api/execute`; keep `/api/transform` anonymous only if
the playground must work signed-out, and then behind a strict IP-keyed limit plus a
body cap and an `AbortSignal.timeout`.

### M-5 · Unauthenticated unbounded storage growth via share links

[api/playground/share/route.ts](../../client/app/api/playground/share/route.ts) —
`POST` requires no auth. Per-request caps are enforced (50 KB script, 12 files ×
100 KB, 20 tests) but the *number* of requests is not: ~1.2 MB per call, unlimited
calls. Snippets have no owner, no expiry and no TTL index, so nothing reclaims
them.
**Fix:** require auth (or a proof-of-work/turnstile for anonymous), add a per-user
quota, record `userId`, and add a TTL index for anonymous snippets.

### M-6 · Username enumeration and email-derived default usernames

[api/profile/setup/route.ts:23-32](../../client/app/api/profile/setup/route.ts#L23)
```ts
const email = user.emailAddresses[0]?.emailAddress || "";
const baseUsername = email.split("@")[0] || `dw_${userId.slice(-6)}`;
```
The email local-part becomes a **public** username (`/profile/[username]`).
For `firstname.lastname@company.com` this publishes the user's real name and
strongly implies their work address. The `while (await UserProfile.findOne(...))`
loop is also unbounded and races.
**Fix:** generate a neutral default (`dw_<random>`), prompt the user to choose,
and never derive public identifiers from email.

### M-7 · TOCTOU races on uniqueness checks

[api/profile/username/route.ts:22-31](../../client/app/api/profile/username/route.ts#L22),
[api/blog/route.ts:40-42](../../client/app/api/blog/route.ts#L40),
[api/profile/setup/route.ts:29](../../client/app/api/profile/setup/route.ts#L29) —
all use check-then-write. `UserProfile.username` and `Blog.slug` have unique
indexes, so the database prevents duplicates, but the loser surfaces as an
unhandled E11000 → HTTP 500 with a raw Mongo message (**H-6**). Blog's
`while (await Blog.findOne({slug}))` is also unbounded and quadratic under
contention.
**Fix:** attempt the write and handle E11000 as a 409, as
[api/store](../../client/app/api/store/route.ts) already does correctly.

### M-8 · OAuth `state` not bound to the user or signed

[api/auth/github/route.ts:25-39](../../client/app/api/auth/github/route.ts#L25) —
`state` is a random value echoed via an httpOnly cookie. The compare is present
and prevents basic CSRF, but the value carries no identity binding, so a
login-CSRF variant (victim's browser completes an attacker-initiated flow) is not
structurally excluded. `OAUTH_STATE_SECRET` exists in
[env.ts:71](../../server/src/config/env.ts#L71) precisely to HMAC this value and is
unused by the client. Cookie parsing is also hand-rolled
([callback:11-16](../../client/app/api/auth/github/callback/route.ts#L11)) rather
than using Next's `cookies()`.
**Fix:** HMAC `state` over `{userId, nonce, expiry}` with `OAUTH_STATE_SECRET`;
verify signature *and* that `userId` matches the current session.

### M-9 · Unauthenticated full-collection scans

[api/leaderboard/route.ts:55](../../client/app/api/leaderboard/route.ts#L55)
(`Submission.find().lean()` — every submission, no projection, no limit; plus
`Problem.find()`), [api/profile/route.ts:32](../../client/app/api/profile/route.ts#L32),
[lib/github.ts:337](../../client/lib/github.ts#L337). With no indexes on
`submissions` (see [01-architecture.md §6](01-architecture.md#6-database-inventory))
these are collection scans. The leaderboard is public and uncached: a modest
request rate exhausts memory and the Atlas connection pool.
**Fix:** replace with a Mongo aggregation pipeline (`$group` + `$sort` + `$skip`/`$limit`),
add the missing indexes, and cache the result for 30–60s.

### M-10 · Admin authorization depends on an env var with a silent-failure path

[client/lib/adminCheck.ts](../../client/lib/adminCheck.ts) — `requireAdmin()`
wraps everything in `try { } catch { return null }`, so a database outage
downgrades to "not admin" (fails closed — correct). But super-admin is
`userId === process.env.SUPER_ADMIN_USER_ID`: if the variable is unset,
`undefined === undefined` is avoided only because `userId` is always a string —
fragile, and there is no startup assertion that the value is configured. There is
no audit log of privilege grants beyond a `grantedBy` field, and no way to revoke
via the API (`POST` grants; no `DELETE`).
**Fix:** validate `SUPER_ADMIN_USER_ID` at boot; add role revocation; write an
append-only audit log for every privilege change.

### M-11 · Invalid tokens silently accepted as anonymous on optional-auth routes

[server/src/middleware/auth.ts:50-68](../../server/src/middleware/auth.ts#L50) —
`optionalAuth` catches verification failures and continues as a guest. The inline
comment argues this deliberately, and for anonymous sponsorship it is defensible.
The risk is future reuse: a route that later assumes "if a token was sent it was
valid" would silently degrade to anonymous instead of rejecting. Currently only
reachable on sponsorship endpoints.
**Fix:** distinguish *absent* from *invalid*. Reject malformed/tampered tokens
(400/401); treat only merely-expired ones as anonymous. Document the contract on
the export.

---

## 🟢 Low

| ID | Finding | File | Fix |
|---|---|---|---|
| **L-1** | Test cases shipped to the browser — `/api/problems/[id]` strips `solution` and `hiddenTestCases` but returns `testCases`, so visible tests are known before submitting. Reasonable product choice (LeetCode does it) but must be paired with server-side hidden-test grading (**C-4**). | [api/problems/[id]/route.ts:20](../../client/app/api/problems/[id]/route.ts#L20) | Keep, once C-4 is fixed |
| **L-2** | `SHOW_ADMIN` / `MAINTENANCE_MODE` are `NEXT_PUBLIC_*`, i.e. baked into the browser bundle. Hiding the admin link is cosmetic, not a control. Correct today (real checks are server-side) — worth documenting so nobody later relies on it. | [lib/config.ts](../../client/lib/config.ts) | Document as UI-only |
| **L-3** | No HSTS header. Vercel/Render terminate TLS but do not set `Strict-Transport-Security`. | [vercel.json](../../client/vercel.json) | Add with `max-age=63072000; includeSubDomains; preload` |
| **L-4** | Comments and blog listings have no pagination — `Comment.find({problemSlug})` and `Blog.find({published:true})` return everything. Slow-growth DoS. | [api/comments](../../client/app/api/comments/route.ts), [api/blog](../../client/app/api/blog/route.ts) | Add cursor pagination |
| **L-5** | `shadcn` (a CLI generator) is in `dependencies`, enlarging the production install and attack surface. | [client/package.json](../../client/package.json) | Move to `devDependencies` |
| **L-6** | CI has no `pull_request` trigger — checks run only after merge to `master`. The workflow comment acknowledges this. Also: no image build, no `npm audit`, no secret scanning, no CodeQL. | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | Add PR trigger + security jobs |
| **L-7** | **Dependency CVE status unknown** — `npm audit` could not be executed (no Node in the audit environment). Not a clean bill of health. | — | Run `npm audit --omit=dev` in CI; add Dependabot |

---

## Findings by OWASP Top 10 (2021)

| Category | Findings |
|---|---|
| **A01 Broken Access Control** | C-1, C-2, C-3, C-5, M-1, M-10 |
| **A02 Cryptographic Failures** | H-2 |
| **A03 Injection** | H-1, M-2, M-3 |
| **A04 Insecure Design** | C-4, C-5, H-3, M-4, M-5 |
| **A05 Security Misconfiguration** | H-4, H-6, H-7, L-3 |
| **A06 Vulnerable/Outdated Components** | H-8, L-5, L-7 |
| **A07 Identification & Authentication Failures** | M-8, M-11 |
| **A08 Data Integrity Failures** | H-5, M-2 |
| **A09 Logging & Monitoring Failures** | H-6, M-10, L-6 |
| **A10 SSRF** | M-3 (partial — host is fixed) |

### Categories explicitly checked and **not** found

- **SQL injection** — no SQL database in the stack.
- **NoSQL/Mongo operator injection** — mostly not exploitable. Query values come
  from `searchParams.get()` (always `string`) or from `auth()`. `sanitizeBody`
  strips `$`-prefixed and dotted keys on the Express side. The residual risk is
  via `{...data}` spreads (**H-5**), not query construction.
- **Command injection** — no `exec`/`spawn`/`child_process` anywhere in the repo.
- **Docker escape** — **not assessable.** The DataWeave sandbox is not in this
  repository (see [01-architecture.md §7](01-architecture.md#7-docker--runtime-topology)).
  Treated as an open risk in [05-environments-runtime.md](05-environments-runtime.md#7-dataweave-runtime).
- **Open redirect** — checked and **correctly defended**:
  [api/auth/github/route.ts:5-7](../../client/app/api/auth/github/route.ts#L5)
  rejects anything not starting with `/`, and explicitly rejects `//` (protocol-relative).
- **CSRF on state-changing routes** — Clerk session tokens are not ambient cookies
  in the classic sense and the API is JSON-only, which blocks simple form CSRF.
  Not exhaustively verified against Clerk's cookie mode; retest after adding CSP.
- **Hardcoded secrets** — none. Verified across the full working tree and the
  entire git history (`git log --all --diff-filter=A` shows no `.env` file was ever
  committed). `.gitignore` covers `.env*`; `.dockerignore` covers `**/.env*`;
  `render.yaml` uses `sync: false` for every secret. **This is done properly.**
- **File upload** — no upload endpoints exist.

---

## Remediation order

Ordered by exploitability × blast radius, not by severity label alone.

**Within 24 hours — anonymous, one-request, destructive:**
1. **C-1** — add auth to `PUT`/`DELETE /api/problems/[id]`
2. **C-2** — add auth to `POST /api/generate` (or delete the route; `generate-public` supersedes it)
3. **C-3** — add auth to `/api/notes` and scope by `userId`
4. **M-1** — require auth on `POST /api/problems`

These are four small, independent, low-risk edits. They close every unauthenticated
write path in the application.

**Within one week:**
5. **H-1** — replace the markdown renderer (chains with C-1 into stored XSS)
6. **H-3** — rate limit the compiler, AI, share and submission endpoints
7. **H-7 / H-8** — fix `docker-compose` auth/binding and the `node:18` base image
8. **H-6** — stop returning raw exception text

**Within one month:**
9. **C-4 / C-5** — server-side grading. The large one; see [03-backlog.md](03-backlog.md)
10. **H-2** — encrypt GitHub tokens, reduce OAuth scope, force reconnect
11. **H-4** — CSP in report-only, then enforce
12. **H-5** — zod schemas on every write route
13. **M-9** — leaderboard aggregation + indexes + caching

**Ongoing:** L-6 and L-7 — get PR gating, `npm audit`, Dependabot and secret
scanning into CI so the next class of finding is caught mechanically rather than
by the next audit.
