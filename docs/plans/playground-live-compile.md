# Plan — Playground live compilation (1s)

> Goal: the playground recompiles roughly every second as you type, so DataWeave
> feels live rather than click-to-run.

---

## 1. What already exists

Auto-run is **already built** — this is not a new feature, it is a shorter
interval plus the safeguards that only matter at that interval.

| Piece | Where | State |
|---|---|---|
| Debounced re-run on content change | [page.tsx:314-328](../../client/app/playground/page.tsx#L314) | ✅ working |
| Delay setting, persisted + validated | [settings.ts:12](../../client/app/playground/settings.ts#L12) | ✅ `[0, 800, 1500, 3000]`, 0 = off |
| Settings UI (segmented control) | [PlaygroundSettings.tsx:30](../../client/app/playground/components/PlaygroundSettings.tsx#L30) | ✅ working |
| Request cancellation | `abortRef` at [page.tsx:275](../../client/app/playground/page.tsx#L275) | ✅ aborts the in-flight run |
| Content signature (avoids firing on panel/settings changes) | [page.tsx:308](../../client/app/playground/page.tsx#L308) | ✅ well done |

**So the literal ask — "compile every 1 second" — is one line**: add `1000` to
`AUTO_RUN_DELAYS`.

That one line would also make the playground noticeably worse, for five reasons
that are invisible at a 3s debounce and obvious at 1s. The rest of this plan is
about those.

### A note on "continuous"

Two readings of the request:

- **(a) Live preview** — recompile shortly after typing stops. This is what the
  existing debounce does, and what "feels live" actually means.
- **(b) Fixed 1s interval** — compile every second regardless of changes.

**(a) is what this plan implements.** (b) recompiles identical input on a timer:
same script + same inputs is a pure function, so every repeat call is guaranteed
to produce the identical result at the cost of a real compile. It would multiply
compiler load with no user-visible benefit. If a *heartbeat* is genuinely wanted
(e.g. to detect the compiler waking up), that is a different, much cheaper
mechanism — see §5.

---

## 2. What breaks at 1s

Each of these is latent today and only surfaces at a short interval.

### 2.1 Execution history floods 🔴

Every run appends to `execHistory`, capped at 30 and **written to localStorage on
each run** ([page.tsx:286-295](../../client/app/playground/page.tsx#L286)).

At a 1s cadence, 30 seconds of typing evicts every manually-run entry and
performs a `JSON.stringify` + `localStorage.setItem` of the whole history —
including full script and file contents — once per second. History becomes
useless *and* it is a synchronous main-thread write on every keystroke pause.

**Fix:** auto-runs do not write history. History records deliberate runs.

### 2.2 Output flicker 🔴

`handleRun` does `setOutput(""); setStatus("idle"); setExecutionTime(null)`
before every request ([page.tsx:277](../../client/app/playground/page.tsx#L277)).
At 1s the output pane blanks and repaints continuously — the single most
annoying thing a live-preview pane can do.

**Fix:** on auto-run, keep the previous output on screen and mark it stale with a
subtle indicator. Replace only when the new result arrives.

### 2.3 Recompiling unchanged input 🟡

The effect is keyed on `scriptSignature`, so it will not fire without a change —
good. But there is no guard against re-running the *same* signature that was just
compiled (e.g. type a char, undo it, or a remount). Cheap to add, and it makes an
idle playground cost nothing.

**Fix:** remember the last-compiled signature; skip if identical.

### 2.4 No pause when the tab is hidden 🟡

A backgrounded playground tab keeps its timers. A user with the playground open
in a background tab contributes compiler load indefinitely.

**Fix:** pause auto-run when `document.visibilityState !== "visible"`; run once on
return if content changed while away.

### 2.5 No backoff when the compiler is down 🔴 — the important one

This is where the feature collides with
[W1-R1 / OPS-07](../audit/09-runtime-ownership.md).

The DataWeave compiler is a **third-party Render free-tier service that sleeps
after 15 minutes idle and takes 30–60s to wake**, against a 15s timeout. Today a
failed manual run is one failed request. With 1s auto-run, a sleeping compiler
receives **a request every second for the entire cold start**, from every open
playground — each one timing out at 15s and overlapping the next.

That is a self-inflicted thundering herd against the exact component the audit
already flags as the platform's biggest infrastructure risk.

**Fix:** consecutive-failure backoff. After 2 consecutive failures, suspend
auto-run and surface *"Live compile paused — the compiler is not responding.
Press Run to retry."* Manual Run always works and re-arms auto-run on success.

---

## 3. The server-side prerequisite

**`POST /api/transform` is unauthenticated and has no rate limit**
([M-4](../audit/02-security.md#m-4--unauthenticated-compiler-proxies),
[H-3](../audit/02-security.md#h-3--no-rate-limiting-on-any-user-facing-endpoint)).

Today that is a latent risk, because a human clicking Run is self-limiting. This
feature removes that natural limit: it makes ~1 req/s/tab the *designed*
behaviour, from anonymous clients, against a single free-tier upstream.

Shipping 1s auto-run without a rate limit turns an accepted risk into an active
one. The two should land together.

**Minimum viable guard** — IP-keyed limit on `/api/transform`, generous enough
for legitimate live compilation and bounded enough to stop abuse:

| | Value | Rationale |
|---|---|---|
| Window | 60s | |
| Limit | 90 req/min/IP | 1.5×/s — comfortably above one active tab, well under a script |
| Response | `429` + `Retry-After` | The client backs off (§2.5) rather than retrying blindly |
| Store | Redis/Upstash | In-memory is useless on Vercel: each invocation may be a fresh process |

`RATE_LIMIT_POLICIES.compiler` (60/min, keyed by user) already exists in
[server/src/config/constants.ts](../../server/src/config/constants.ts) and is
applied to nothing — this is its enforcement point.

> Note the ordering dependency: distributed rate limiting needs the Redis from
> [OPS-05](../audit/03-backlog.md#ops-05--provision-managed-redis), which is
> still outstanding. Until it exists, an in-memory limiter on the Next.js side is
> better than nothing but will not hold across instances.

---

## 4. Implementation

### Phase 1 — make 1s safe (client only, ~4h)

| # | Change | File |
|---|---|---|
| 1.1 | Add `1000` to `AUTO_RUN_DELAYS` and a `"1s"` label. **Keep 800** — removing a value would silently reset existing users to "Off", because `normalizeSettings` falls back to the default for unknown values. | `settings.ts`, `PlaygroundSettings.tsx` |
| 1.2 | `handleRun(source: "manual" \| "auto")`. Auto-runs skip the history write. | `page.tsx` |
| 1.3 | Auto-runs do not clear output; add a `isStale` flag driving a subtle indicator. | `page.tsx` |
| 1.4 | `lastCompiledSignatureRef` — skip if unchanged. | `page.tsx` |
| 1.5 | Pause on `visibilitychange`; run once on return if content changed. | `page.tsx` |
| 1.6 | Consecutive-failure backoff (threshold 2) + "paused" banner; manual Run re-arms. | `page.tsx` |
| 1.7 | Honour `429` explicitly: pause immediately, respect `Retry-After`. | `page.tsx` |

### Phase 2 — server guard (~3h, depends on OPS-05 for the distributed store)

| # | Change |
|---|---|
| 2.1 | Rate limit `POST /api/transform` and `POST /api/execute` (IP-keyed) |
| 2.2 | Return `429` with `Retry-After` and `RateLimit-*` headers |
| 2.3 | Body-size cap and `AbortSignal.timeout` on the upstream fetch |

### Phase 3 — polish (~2h)

| # | Change |
|---|---|
| 3.1 | Toolbar "Live" toggle so the feature is discoverable, not buried in Settings |
| 3.2 | Compact status line: `● live · 240ms` / `⏸ paused` |
| 3.3 | Persist the toggle alongside the existing settings |

### Default: opt-in, not opt-out

`autoRunDelay` currently defaults to `0` (off). **Recommend keeping it off by
default** until Phase 2 ships and OPS-07 Phase A (keep-warm) is in place.
Defaulting it on multiplies baseline compiler load by every visitor who opens the
playground, including the ones who just came to read a shared snippet.

---

## 5. If a true heartbeat is wanted

If the intent behind "every 1 second" is *keeping the compiler warm* rather than
recompiling, that is [OPS-07 Phase A](../audit/09-runtime-ownership.md#41-immediate--external-pinger-ship-now-1h)
— a single external pinger every 4 minutes, run once for the whole platform
rather than once per browser tab. Vastly cheaper and it actually solves the cold
start.

---

## 6. Testing

| Layer | Cases |
|---|---|
| Unit — `settings.ts` | `1000` accepted; unknown values still fall back; **an existing stored `800` still normalises to `800`** (regression guard for 1.1) |
| Unit — backoff | 2 consecutive failures → paused; success resets the counter; `429` pauses immediately |
| Unit — signature | Identical signature does not trigger a run |
| Integration | Rapid edits produce exactly one compile after the debounce, not one per keystroke |
| Integration | Auto-runs write no history entry; manual runs do |
| Manual | Type continuously for 30s → output never blanks; history holds only manual runs |
| Manual | Kill the compiler → auto-run pauses after 2 failures, no request storm |
| Manual | Background the tab for 60s → zero requests issued |

---

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| **P-1** | Compiler load multiplies with concurrent playground users | Phase 2 rate limit; opt-in default; visibility pause |
| **P-2** | Cold-start request storm against a sleeping free-tier compiler | Failure backoff (§2.5); OPS-07 Phase A keep-warm |
| **P-3** | A partially-typed script produces constant red errors while typing, which reads as noisy | Keep the last *successful* output visible and show errors in a less prominent style until the run settles |
| **P-4** | localStorage write pressure | Auto-runs skip history entirely (§2.1) |
| **P-5** | Monaco + a compile every second on a low-end machine | Work is network-bound, not CPU-bound; abort-on-supersede already prevents pile-up |

---

## 8. Recommendation

Ship **Phase 1 + Phase 2 together**. Phase 1 alone is a one-line change plus
polish, but it is precisely the change that makes the unrated, unauthenticated
compiler proxy load-bearing — and the compiler behind it is the component the
audit already identifies as the least reliable thing in the stack.

If Phase 2 has to wait on Redis, Phase 1 is still shippable **with the failure
backoff and visibility pause included and the default left off** — those are what
prevent the bad scenarios. What should not ship is "add 1000 to the array" on its
own.
