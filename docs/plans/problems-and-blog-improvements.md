# Plan — Problems & Blog improvements

Covers five requests: blog discussion, gamified unsolved problems, a super-hard
difficulty tier, more hard content, and formatted input/output.

---

## 0. Two findings from investigating this

### 0.1 🔴 The default compiler URL is dead

[client/lib/config.ts](../../client/lib/config.ts) falls back to
`https://dwlbackend.onrender.com` when `DWL_BACKEND_URL` is unset. That host
**returns 404 on every path**, including `/api/transform` and `/health` — it
responds in ~1s, so it is alive but no longer serving the compiler.

The working compiler is the *other* upstream,
`https://dataweave-playground-h1p7.onrender.com/api/transform`, which is what
`server/.env` uses via `DW_COMPILER_URL`. Verified working:

```
[map+upper] 200 1080ms  →  {"output":"[\n  \"ALICE\",\n  \"BOB\"\n]","error":null}
[groupBy]   200 1077ms  →  {"output":"{\n  \"x\": [ ... ]}","error":null}
```

**Why this matters more than it used to.** Before Week 1, a dead compiler broke
the playground. After SEC-05 moved grading server-side, it also breaks **every
submission** — they now grade on the request path, so a 404 makes every submit
return `Error`.

If the Vercel project sets `DWL_BACKEND_URL`, production is fine and this is a
latent trap for the next deploy. If it does not, **the platform's core loop is
broken right now.** Either way the fallback must not be a dead host.

**Fix (small, do first):** point the default at the working upstream, or drop the
fallback and let the config module report the capability as unconfigured (it now
supports exactly that — REF-07).

### 0.2 The formatting complaint is about *stored* values, not compiler output

The compiler already returns indented output. The problem is in the UI:

```tsx
// Workspace.tsx:300-301 — label and value on ONE line, raw
<div><span>Input: </span><span className="whitespace-pre-wrap">{ex.input}</span></div>
<div><span>Output: </span><span className="whitespace-pre-wrap">{ex.output}</span></div>
```

`examples[].input` / `.output` are free-text strings written by hand or emitted
by the AI generator — usually compact JSON like `[{"id":1,"name":"alice"}]`.
Rendered inline after a label, that is one long unreadable line. Same pattern in
the submission-history pane and the test-case list.

---

## A. Formatted input & output

**Size:** S–M · **Risk:** low · **Value:** high — it affects every problem page.

New shared helper, `lib/format.ts`:

```ts
formatPayload(raw: string, hint?: "json" | "xml" | "csv" | "text"): string
```

- Detects and pretty-prints JSON (`JSON.parse` → `stringify(v, null, 2)`)
- Indents XML
- Leaves CSV / plain text untouched
- **Never throws and never loses data** — returns the original string unchanged
  when it cannot parse. A malformed example must still be readable.

Applied at every display site:

| Site | Change |
|---|---|
| [Workspace examples](../../client/app/problems/[slug]/Workspace.tsx#L300) | Label above, value in a block `<pre>`, formatted |
| Workspace output pane | Format before display |
| Submission history | Format the stored output |
| Test-case list | Format input + expected |
| Playground output | Already indented by the compiler; route through the same helper for consistency |

Formatting is **display-only** — stored values are untouched, so nothing about
grading changes. Grading already normalises via `normalizeOutput` in
[lib/grading.ts](../../client/lib/grading.ts), which is independent of this.

---

## B. Blog discussion

**Size:** M · **Risk:** low–medium (needs a migration)

The `Comments` component already exists and works on problems. The blocker is
that `Comment` is hard-keyed to problems:

```ts
problemSlug: { type: String, required: true }
```

**Approach — generalise the model** (rather than a second `BlogComment`, which
would duplicate the delete-authorisation, coin-award and moderation logic):

```ts
targetType: { type: String, enum: ["problem", "blog"], required: true, default: "problem" }
targetId:   { type: String, required: true }   // problem slug or blog slug
problemSlug: { type: String }                  // kept, no longer required
CommentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })
```

**Migration 002:** set `targetType: "problem"` and `targetId: <problemSlug>` on
every existing row; add the new index; drop the old `{problemSlug, createdAt}`
index once nothing reads it.

`problemSlug` is retained (not dropped) so the old and new code can run
simultaneously during the deploy — the rule from
[the migrations runbook](../runbooks/database-migrations.md).

**API:** `/api/comments` accepts `targetType` + `targetId`, and keeps accepting
`problemSlug` as an alias so no client breaks mid-deploy.

**UI:** mount `<Comments>` below the article on the blog detail page, next to the
existing vote buttons.

**Note:** comment bodies render through `renderMarkdown`, which is the
interim-hardened renderer from SEC-07. Adding a second public surface for
user-authored markdown raises the value of finishing
[SEC-11](../audit/03-backlog.md#sec-11--replace-the-markdown-renderer)
(real sanitiser). Not a blocker — SEC-07 closed the known vector and has a
property test — but worth doing soon.

---

## C. Gamified unsolved problems

**Size:** S · **Risk:** low · pure presentation

The list already computes `solved | attempted | unsolved`
([problems/page.tsx:52-59](../../client/app/problems/page.tsx#L52)) and shows a
small icon. The ask is to make unsolved problems *pull*.

| State | Treatment |
|---|---|
| **Unsolved** | Difficulty-tinted left border, subtle animated sheen on hover, "unsolved" accent dot, full-contrast title |
| **Attempted** | Amber progress indicator + "in progress" chip — the strongest call to action, since the user already started |
| **Solved** | De-emphasised: muted title, solid green check, no accent. Solved work should recede, not dominate. |

Plus: a compact progress header (`solved / total`, per-difficulty bars) and a
"random unsolved" shuffle action (a `Shuffle` icon is already imported and can
be pointed at the unsolved set).

**Constraints I will hold to:**
- Never colour-only — every state has an icon and a text label (WCAG 1.4.1)
- Honour `prefers-reduced-motion` — no animation for users who opt out
- Contrast checked in both themes; "muted" must stay readable, not vanish

---

## D. Super-hard difficulty tier

**Size:** L · **Risk:** medium · **This is the decision point.**

### The problem

`difficulty` is hardcoded as `Easy | Medium | Hard` in **17 files**, including
**three separate copies** of the scoring tables:

| Duplicate | Location |
|---|---|
| `SCORE_WEIGHTS = { Easy: 1, Medium: 3, Hard: 5 }` | [client/lib/ranks.ts:38](../../client/lib/ranks.ts#L38) |
| `SCORE_WEIGHTS` (again) | [server/src/config/constants.ts](../../server/src/config/constants.ts) |
| `diffCoins = { Easy: 5, Medium: 10, Hard: 20 }` | [client/app/api/submissions/route.ts:113](../../client/app/api/submissions/route.ts#L113) |
| `COIN_RULES.difficultyBonus` (again) | [server/src/config/constants.ts](../../server/src/config/constants.ts) |
| `DIFFICULTIES` | [client/app/api/generate/route.ts:11](../../client/app/api/generate/route.ts#L11) |
| enum | [client/models/Problem.ts:18](../../client/models/Problem.ts#L18) |
| `DIFFICULTY_TAGS` / `FILTER_TAGS` | [client/app/problems/page.tsx:13](../../client/app/problems/page.tsx#L13) |
| hardcoded `["Easy","Medium","Hard"]` ×2 | [client/app/create/page.tsx](../../client/app/create/page.tsx) |
| colour ternaries | Workspace, problems list, contests ×2 |
| per-difficulty counts | leaderboard, profile ×2, home page |

**This is the deferred REF-01 presenting its bill.** Adding a tier today means
editing 17 files and keeping four constant tables in sync by hand forever. Doing
REF-01 first (shared package, ~1–2 days) reduces the tier itself to ~3 files.

### Design (either way)

| Aspect | Proposal |
|---|---|
| Name | **`Expert`** — reads as a tier, not a complaint. (`Insane`/`Extreme` also fine.) |
| Score weight | `8` (Easy 1 / Medium 3 / Hard 5 / **Expert 8**) |
| Coin bonus | `35` (Easy 5 / Medium 10 / Hard 20 / **Expert 35**) |
| Colour | Purple/violet — distinct from green/amber/red |
| Migration | **None.** Additive enum; existing documents and scores stay valid. |
| Rank tiers | Review `RANK_TIERS` thresholds once Expert problems exist — the score ceiling rises |

Server-side grading already handles any difficulty generically (`diffCoins[...] ?? 5`),
so no grading change is needed beyond the table.

---

## E. More super-hard content

**Size:** M · **Feasible, and verifiable.**

The compiler responds in ~1.1s, so I can author each problem **and execute it to
capture the real expected output** rather than hand-writing outputs that may be
wrong. That is the difference between seeded content that works and seeded
content that silently fails every submission.

**Proposal:** 10 Expert problems covering genuine MuleSoft/DataWeave depth, each
with 3–4 visible test cases and 3–4 hidden ones:

1. Multi-level `groupBy` + aggregation with null handling
2. XML with namespaces → JSON (attributes, CDATA, repeated elements)
3. Recursive tree flattening (`flatMap` + user-defined recursion)
4. `reduce` building a lookup index from a paginated API response
5. CSV → nested JSON with type coercion and bad-row tolerance
6. HL7/EDI-style fixed-segment parsing
7. Dynamic key construction with `mapObject` and `pluck`
8. Currency/precision-safe arithmetic across records
9. Deep merge of two payloads with conflict rules
10. `do`/local-scope refactor of a naive imperative transform

**Delivery:** a seed script (`client/scripts/seed-expert-problems.ts`) that is
idempotent (upsert by slug), dry-runnable, and **verifies every expected output
against the live compiler before writing**. Not raw DB inserts.

The `hiddenTestCases` field already exists and is correctly stripped from API
responses. It is not yet *executed* — that is FEAT-01. Authoring them now means
they light up the moment FEAT-01 lands.

---

## Sequencing

| Order | Item | Size | Why here |
|---|---|---|---|
| 1 | **0.1 dead compiler default** | XS | Possibly breaking production right now |
| 2 | **A. formatted I/O** | S–M | Clear bug, high visibility, zero risk |
| 3 | **C. gamified unsolved** | S | Pure UI, immediate payoff |
| 4 | **B. blog discussion** | M | Needs migration 002 |
| 5 | **D. Expert tier** | L | Decide REF-01 first vs not |
| 6 | **E. seeded content** | M | Depends on D |

Items 1–3 are independent and safe. Item 5 is the fork.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Expert tier touches 17 files; a missed site renders a blank/incorrect badge | Do REF-01 first, or add an exhaustive-switch helper so TypeScript flags every unhandled case |
| R-2 | Seeded expected outputs could be wrong | Verify each against the live compiler before writing; dry-run mode |
| R-3 | Migration 002 during deploy | Backwards-compatible: `problemSlug` retained, API accepts both shapes |
| R-4 | Gamification hurts accessibility | Icon + label on every state; `prefers-reduced-motion`; contrast checked both themes |
| R-5 | Blog comments add a second public markdown surface | SEC-07 hardening + property test already cover it; raises priority of SEC-11 |
| R-6 | Rank tiers become easier to climb once Expert exists | Review `RANK_TIERS` alongside D |
