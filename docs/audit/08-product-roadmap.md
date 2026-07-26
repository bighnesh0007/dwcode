# DWCode — Product Roadmap (Phase 9)

> "The best DataWeave learning platform on the internet."
> This document is about what to build. It is opinionated about **what not to
> build**, because the fastest way to lose a niche platform is to chase LeetCode's
> feature list instead of the thing only you can do.

---

## 1. The strategic read

DWCode's advantage is not that it is a LeetCode clone. It is that **DataWeave has
no practice platform at all**, and the people who need one are a well-defined,
motivated, professionally-incentivised audience: MuleSoft developers preparing
for MCD Level 1/2 certification and integration-developer interviews.

That audience has three properties worth designing around:

1. **They have a concrete goal with a date attached** — a certification exam or a
   job interview. This is much stronger motivation than "get better at
   algorithms," and it means content organised around *the exam* beats content
   organised around *topics*.
2. **They are at work.** They hit real DataWeave problems during the day. A
   platform that helps with the actual problem in front of them earns daily
   usage that a pure practice site never will.
3. **They are few.** The total addressable market is tens of thousands, not
   millions. Depth and authority matter far more than growth mechanics.

### What this implies

| Do | Don't |
|---|---|
| Own certification prep end to end | Rebuild LeetCode's contest cadence |
| Make the playground the best DataWeave tool that exists, free and un-gated | Gate the playground behind sign-up |
| Curate a small, excellent problem set | Generate 500 AI problems nobody vetted |
| Solve real work problems (paste your payload, get a transform) | Chase DAU with streak notifications |
| Build authority through content | Build engagement through gamification |

### The uncomfortable prerequisite

**None of the competitive features mean anything until
[C-4](02-security.md#c-4--client-side-grading--the-achievement-economy-is-forgeable)
is fixed.** The leaderboard, coins, ranks, and contests currently rank whoever is
most willing to send a crafted HTTP request. Adding badges and certificates on top
of a forgeable substrate makes the problem worse, not better — a certificate that
can be forged is a liability, not a feature.

So: **fix grading, then gamify.** Everything in Horizon 1 below assumes
[FEAT-01](03-backlog.md#feat-01--server-side-grading-service-) has landed.

---

## 2. Horizon 1 — Credibility (0–3 months)

*Goal: everything currently claimed actually works.*

### H1.1 · Trustworthy grading ⭐

[FEAT-01](03-backlog.md#feat-01--server-side-grading-service-). Server-side
execution against hidden tests. Without it, nothing else in this roadmap has a
foundation.

**Ship alongside it:** per-test result display (which test failed, expected vs
actual, on visible tests only), a deterministic `Timeout` verdict, and a
submission history that shows real verdicts.

### H1.2 · Contests that actually score

[BUG-01](03-backlog.md#bug-01--contest-scoring-does-not-exist). Contest
participants have a `score` field that no code path writes. Fix scoring,
standings, and time-based tiebreaks. The weekly contest scheduler already exists
and runs — it is currently scheduling contests that cannot be won.

### H1.3 · Curated problem set

Not more problems — **better** problems. Target ~120, hand-reviewed, covering:

| Track | Coverage |
|---|---|
| Core operators | `map`, `filter`, `reduce`, `groupBy`, `orderBy`, `distinctBy`, `flatten`, `pluck` |
| Selectors | `.`, `..`, `.*`, `.@`, index, range, `$`/`$$` |
| Formats | JSON, XML (namespaces, attributes, CDATA), CSV, YAML, Flat File, Java, multipart |
| Types & coercion | `as`, type declarations, pattern matching, `Null` handling, `default` |
| Functions | user-defined, currying, `do`, `if/else`, recursion |
| Modules | `dw::core::Strings`, `Arrays`, `Objects`, `Runtime`, `Crypto`, `Periods` |
| Real integration shapes | HL7 → JSON, EDI, SOAP envelope, paginated API merge, error payload mapping |

That last row is the differentiator. "Transform this array" is a generic exercise.
"Map this SAP IDoc into a Salesforce Composite request" is why someone chose
MuleSoft, and no other platform has it.

### H1.4 · Playground as the free hook

The playground is already strong — Monaco, monarch grammar, multi-file inputs,
test runner, samples, share links. Finish it and make it the front door:

- Shareable links with a short slug (**exists**, needs owner + expiry —
  [SEC-19](03-backlog.md#sec-19--quota-and-expire-playground-share-links))
- Version history per snippet
- Side-by-side input/output diff
- **DataWeave version selector** — behaviour differs across 2.x, and "which
  version am I targeting?" is a real daily question
- Deep-link from an error message to a matching learning card

**Keep it usable signed-out.** It is the single best acquisition surface: someone
Googles a DataWeave error, lands on the playground, solves their work problem,
and now knows the site exists.

### H1.5 · Trust and safety basics

Moderation queue for user- and AI-generated problems
([FEAT-02](03-backlog.md#p2--next-quarter)), report/flag on content, admin
moderation actions with an audit log, and role revocation (currently grant exists,
revoke does not).

---

## 3. Horizon 2 — Differentiation (3–9 months)

*Goal: things no other platform can offer, because no other platform is about DataWeave.*

### H2.1 · Certification preparation ⭐ — the flagship

This is the highest-value item in the entire roadmap. MCD Level 1 and Level 2 are
paid exams with real career consequences and thin practice material.

- Mapped syllabus — every exam objective ↔ problems and lessons
- Timed mock exams matching the real format and pacing
- Per-objective readiness score ("you are weakest on XML namespaces")
- Targeted remediation drills generated from wrong answers
- A "ready to sit the exam" signal backed by actual performance data

This is what people will pay for, and it is defensible: it requires DataWeave
depth, not engineering scale.

### H2.2 · Interactive learning paths

[FEAT-04](03-backlog.md#p2--next-quarter). Named in the README, not built.

```
Beginner       → syntax, output directives, selectors, basic map/filter
Intermediate   → groupBy/reduce, multi-format, type coercion, user functions
Advanced       → streaming, modules, recursion, performance, error handling
Specialisations→ XML & namespaces · CSV & flat file · EDI · HL7 · Crypto
```

Each lesson: short explanation → live playground exercise → immediate feedback →
a graded problem. Progress gated on demonstrated competence, not clicks.

### H2.3 · AI as tutor, not generator

Reposition AI from "make more problems" (currently unauthenticated and unvetted —
[C-2](02-security.md#c-2--unauthenticated-ai-generation-on-the-platforms-gemini-key))
to "help me understand."

| Feature | Value |
|---|---|
| **Error explainer** | DataWeave errors are famously opaque. Paste one, get a plain-English cause and fix. **This alone could be the most-used feature on the site.** |
| **Code review** | Idiomatic-DataWeave feedback on a working solution — most users write imperative-style DW without knowing it |
| **Socratic hints** | Progressive nudges that do not give the answer |
| **Mock interviewer** | Conversational DataWeave/MuleSoft interview practice |
| **Weakness-targeted drills** | Generate practice from the topics a user actually fails |

Guardrails: BYO API key (the pattern
[generate-public](../../client/app/api/generate-public/route.ts) already gets
right) or a platform quota; validate all model output against a strict schema
before persisting; never let AI content reach the problem bank without human
review.

### H2.4 · Community depth

- Solution editorials — the official "here is the idiomatic way, and why"
- Multiple approaches per problem, ranked by community vote (voting exists and
  is well-implemented for blogs; extend it to solutions)
- Per-problem discussion (comments exist — add threading and pagination)
- Community-contributed problems behind moderation
- Reputation earned from *accepted solutions and useful answers*, not from
  activity volume

### H2.5 · Real-work utility

The features that make DWCode a bookmark rather than a study site:

- **Sample-to-transform** — paste input and desired output, get a candidate script
- **Format converter** — XML ⇄ JSON ⇄ CSV ⇄ YAML with the DataWeave that does it
- **Snippet library** — personal + community, tagged and searchable
- **Migration helper** — DataWeave 1.0 → 2.0
- **Performance hints** — flag patterns that are slow at scale

---

## 4. Horizon 3 — Scale (9–18 months)

*Goal: revenue and reach.*

### H3.1 · Teams and enterprise

The realistic revenue path. MuleSoft consultancies and enterprise integration
teams have training budgets and hiring pipelines.

- Organisation accounts with SSO
- Team dashboards — coverage and readiness across the team
- Private question banks
- **Candidate assessments** — send a DataWeave test, get a scored report. This is
  the clearest willingness-to-pay in the whole roadmap.
- Instructor/classroom mode for MuleSoft training partners

### H3.2 · Credentials

Certificates of completion, verifiable public profiles, LinkedIn integration,
skill badges backed by assessment data. **Only meaningful post-H1.1** — a
credential derived from forgeable submissions is worse than no credential.

### H3.3 · Platform reach

VS Code extension (run DataWeave against DWCode's runtime from the editor), a
CLI, a public API, and an Anypoint Exchange presence.

### H3.4 · Content engine

The compounding asset. A DataWeave cookbook, a pattern library, weekly
"DataWeave puzzle" posts, and error-message pages targeting the exact strings
people paste into Google. For a niche this size, organic search from error
messages is likely the single largest acquisition channel — and the blog
infrastructure already exists.

---

## 5. Deliberately not building

| Not building | Why |
|---|---|
| **Multi-language support** (Java, Python…) | Dilutes the only defensible position. There are a hundred general platforms and zero DataWeave ones. |
| **Aggressive gamification** — daily streak pressure, loss aversion, push nudges | Wrong audience. Working professionals resent it, and it inflates metrics without improving learning. Keep coins and ranks light. |
| **Mobile app** | Nobody writes DataWeave on a phone. A responsive read-only view is enough. |
| **Real-time collaborative editing** | Large build, thin demand, hard to operate. Share links cover the actual use case. |
| **Video courses** | Different product, different cost structure. Partner instead. |
| **Public API before the internal one is stable** | Locks in a contract that is still being migrated ([07-architecture-improvements.md](07-architecture-improvements.md)). |
| **More AI-generated problems** | The bottleneck is quality and review, not volume. |

---

## 6. Measuring the right things

| Tier | Metric | Why |
|---|---|---|
| **North star** | Weekly users who **solve ≥1 problem or run ≥3 playground scripts** | Captures both audiences — learners and working developers — and is not inflatable by passive visits |
| Learning | Problems solved per active user · learning-path completion · **cert-readiness delta** | Is anyone actually getting better? |
| Retention | W1 / W4 / W12 · playground return rate | Does it become a habit? |
| Quality | Problem acceptance rate distribution · hint usage · reported-problem rate | Are the problems well calibrated? |
| Community | Solutions per problem · editorial coverage · answered-discussion rate | Is it self-sustaining? |
| Trust | **Forged-submission attempts blocked** · moderation queue latency | Is the ladder honest? |
| Business | Free → paid conversion · team seats · assessment volume | Is it viable? |

**Vanity metrics to ignore:** registered users, total problems, page views, total
submissions. Every one of them can be inflated without anyone learning DataWeave —
and two of them currently can be inflated with `curl`.

---

## 7. Sequencing

```
Month 1–2   ── P0 security + FEAT-01 grading + BUG-01 contest scoring
                └─ nothing ships to users; the platform becomes honest

Month 2–3   ── Curated 120 problems · playground polish · moderation
                └─ first credible public launch

Month 3–5   ── Certification prep (MCD L1) ⭐ · error explainer
                └─ the "why DWCode" moment

Month 5–7   ── Learning paths · AI tutor · editorials
                └─ retention

Month 7–9   ── MCD L2 · community problems · snippet library
                └─ depth and self-sustenance

Month 9–12  ── Teams · assessments · certificates
                └─ revenue

Month 12+   ── VS Code extension · public API · content engine
                └─ reach
```

**The two decisions that matter most:**

1. **Fix grading before adding anything.** It is 8 days of work and it is the
   difference between a practice platform and a scoreboard anyone can edit.
2. **Make certification prep the flagship, not contests.** Contests are what
   LeetCode is famous for and are the wrong bet here — the audience is too small
   for a competitive ladder to feel alive, and their actual motivation has an exam
   date attached. Certification prep is smaller to build, easier to monetise, and
   something no competitor is positioned to copy.
