# OPS-07 — Owning the DataWeave Runtime

> **Priority raised from P2 to P1** after Week 1.
> Reason: [W1-R1](README.md#new-risks-discovered-during-implementation). Moving
> grading server-side (SEC-05) put the DataWeave compiler on the **critical
> request path**. It is now a hard dependency of the platform's core action, and
> it is a third-party URL nobody here controls.

---

## 1. What changed, and why this is now urgent

Before Week 1, the browser called the compiler. A compiler outage degraded the
experience: the user saw an error, retried, and nothing was recorded.

After Week 1, the server calls the compiler during `POST /api/submissions`. An
outage now means **every submission returns `Error`** — and that verdict is
persisted. The blast radius went from "annoying" to "the product does not work,
and it writes wrong data while not working."

The dependency itself is unchanged and unowned:

| Consumer | Target |
|---|---|
| [client/lib/config.ts](../../client/lib/config.ts) | `https://dwlbackend.onrender.com` |
| [server/src/config/env.ts](../../server/src/config/env.ts) | `https://dataweave-playground-h1p7.onrender.com/api/transform` |

Two different upstreams. Both Render free-tier. Neither version-pinned. Neither
in this repository.

### The specific failure that will happen first

Render's free tier sleeps a service after **15 minutes idle** and takes **30–60s**
to wake. `DW_TIMEOUT_MS` is **15,000**, and `gradeSubmission` uses a 15s
`AbortSignal.timeout` per test.

**The first submission after any quiet period exceeds the timeout and grades
`Error`.** For a platform with low overnight traffic, that is the first
submission most mornings. This is not a hypothetical — it is arithmetic.

---

## 2. Target design

```
      ┌──────────────────────────────────────────────────────────┐
      │  Express API                                             │
      │                                                          │
      │  DataWeaveClient ── retry ── circuit breaker ── pool ──┐  │
      └───────────────────────────────────────────────────────┼──┘
                                                              │
                        internal network (no egress)          │
      ┌───────────────────────────────────────────────────────▼──┐
      │  Traefik  →  dataweave-runtime × N                       │
      │              ├─ /transform   (execute)                   │
      │              ├─ /health      (liveness, no JVM work)     │
      │              └─ /ready       (readiness, compiles a      │
      │                               trivial script)            │
      └──────────────────────────────────────────────────────────┘
                                     ▲
                        keep-warm pinger (every 4 min)
```

### 2.1 Repository layout

```
runtime/
├── Dockerfile              # pinned DataWeave CLI on a minimal base
├── src/server.js           # HTTP wrapper: /transform, /health, /ready
├── seccomp.json            # syscall allowlist
├── fixtures/               # golden corpus for parity testing
└── README.md               # version pinning + upgrade procedure
```

---

## 3. Health checks

Three distinct signals. Conflating them is what makes outages hard to diagnose —
and the existing server already models this correctly by pointing Render's health
check at `/health` rather than `/healthcheck`
([render.yaml:34](../../render.yaml#L34)). Extend that discipline to the runtime.

| Endpoint | Question | Work done | Consumer | Timeout |
|---|---|---|---|---|
| `GET /health` | Is the process alive? | none — static `200` | Docker `HEALTHCHECK`, Traefik | 2s |
| `GET /ready` | Can it actually compile? | runs a trivial fixed script | load-balancer pool membership | 10s |
| `GET /metrics` | How is it behaving? | none | Prometheus | 2s |

**`/ready` must do real work.** A JVM that is up but has not finished warming
returns `200` from a static endpoint while timing out on the first real request —
exactly the failure mode we are trying to eliminate. `/ready` compiles
`%dw 2.0 output application/json --- 1` and asserts the output is `1`.

On the API side, extend the existing
[UpstreamHealthService](../../server/src/services/dataweave/upstreamHealth.service.ts)
— it already runs a heartbeat and tracks upstream state — to poll `/ready`
rather than the current opaque `/healthCheck`, and to expose the result as a
gauge.

---

## 4. Keep-warm strategy

Two layers. The first is a stop-gap that can ship this week; the second removes
the need for it.

### 4.1 Immediate — external pinger (ship now, ~1h)

While the runtime is still on Render free tier, prevent the sleep entirely:

- A scheduled job pings `/ready` **every 4 minutes** (Render sleeps at 15).
- Run it from something that is not the app: GitHub Actions `schedule`, Cloudflare
  Worker cron, or Uptime Kuma. If the pinger shares infrastructure with the thing
  it is keeping awake, they fail together.
- Alert if two consecutive pings fail.

This is deliberately crude. It buys back the "first submission of the morning"
failure for an hour of work, and it is the single highest value-per-effort item
in this document.

> Note the honest trade-off: keep-warm pinging defeats the purpose of a free tier
> that exists to reclaim idle capacity. This is a reason to move off the free tier,
> not a reason to skip the pinger in the meantime.

### 4.2 Target — warm pool

Own the runtime and keep `N` containers warm permanently:

- JVM startup is 2–5s, so **never** start a container per request.
- Minimum pool size ≥ 2 so one recycling container never empties the pool.
- Pre-warm on deploy: do not add a container to the pool until `/ready` passes.
- **Pre-warm on schedule** before the Saturday 15:00 UTC weekly contest, which
  [weeklyContest.service.ts](../../server/src/services/contest/weeklyContest.service.ts)
  already knows the timing of. Contest start is the one predictable traffic spike.

---

## 5. Retries

Retries are dangerous on a compile endpoint: a retry storm against a struggling
runtime is how a slowdown becomes an outage. Rules:

| Rule | Value | Why |
|---|---|---|
| Retry on | connection refused, connection reset, `503`, `502` | Transport failures — the request never ran |
| **Never** retry on | timeout, `4xx`, compile error | A timeout may still be executing; a compile error is deterministic and will fail identically |
| Attempts | 2 total (1 retry) | Beyond this, a queue is the right answer, not more retries |
| Backoff | 250ms + full jitter | Jitter prevents synchronised retry waves |
| Budget | Retries share the 25s `LIMITS.grading.totalBudgetMs` | A retry must never extend the grading budget |
| Idempotency | Compiles are pure functions of (script, input) | Safe to retry — the only reason retrying is permissible at all |

**Circuit breaker** in front of the retry logic: open after 5 consecutive
failures, half-open probe after 30s. While open, fail fast with a clear
`RUNTIME_UNAVAILABLE` error rather than making every user wait 15s to be told the
same thing.

### 5.1 The verdict-integrity rule

This one matters more than the retry policy itself:

> **Infrastructure failure must never be recorded as a user's verdict.**

Today a compiler outage writes `status: "Error"` against the user's submission,
which pollutes their history and their acceptance rate with our downtime. Add a
distinct outcome:

- compile failed because the *user's code* is wrong → `Error` (their result)
- compile failed because the *runtime* was unavailable → **do not persist a
  submission at all**; return `503` and tell the user to retry

This requires distinguishing the two in `lib/grading.ts`, which currently
collapses both into `Error`. It should be done in the same change as FEAT-01.

---

## 6. Resource limits

Every limit below already exists as a constant in
[server/src/config/constants.ts](../../server/src/config/constants.ts) and is
currently enforced nowhere. This work is the enforcement point.

### 6.1 Container

```yaml
dataweave-runtime:
  build: ./runtime
  read_only: true                              # immutable rootfs
  tmpfs: [/tmp:size=64m,noexec,nosuid,nodev]   # only writable path
  cap_drop: [ALL]
  security_opt:
    - no-new-privileges:true
    - seccomp:./runtime/seccomp.json
  pids_limit: 128                              # fork-bomb bound
  mem_limit: 512m
  memswap_limit: 512m                          # no swap escape
  cpus: 1.0
  ulimits:
    nofile: { soft: 256, hard: 512 }
    fsize:  1048576                            # 1 MB write cap
  user: "10001:10001"                          # non-root
  networks: [runtime-isolated]                 # internal: true — NO EGRESS
```

**`internal: true` is the single most important line here.** DataWeave can open
network connections depending on configuration. Removing egress eliminates
exfiltration and internal pivoting in one stroke, and it is also the only SSRF
control the platform would otherwise have.

Consider **gVisor (`runsc`)** as the container runtime for a second isolation
layer — a kernel escape would have to defeat gVisor's userspace syscall
interception first. Cost is roughly 10–15% CPU, acceptable for a JVM workload.

### 6.2 Execution

| Control | Value | Enforced at |
|---|---|---|
| Per-script timeout | 10s | runtime wrapper — hard kill, not cooperative |
| Per-request timeout | 15s | `DW_TIMEOUT_MS` |
| Total grading budget | 25s | `LIMITS.grading.totalBudgetMs` |
| Max tests per submission | 24 | `LIMITS.grading.maxTests` |
| Concurrency per submission | 3 | `LIMITS.grading.concurrency` |
| Max script size | 50 KB | `LIMITS.playground.maxScriptLength` |
| Max input size | 100 KB × 12 | `LIMITS.playground` |
| Max output size | 1 MB | runtime wrapper — truncate, don't stream |

### 6.3 Container reuse

A warm pool means state can leak between executions. Bound it:

- Recycle a container after **N executions** (start at 100, tune on evidence)
- Hard-recycle immediately on any timeout or OOM — a container that just failed
  is not trustworthy
- Health-check on return to the pool
- Clear `/tmp` between executions
- Never return a container to the pool while its previous request may still be
  running

---

## 7. Monitoring

| Metric | Type | Alert |
|---|---|---|
| `dw_compile_duration_seconds` | histogram | p95 > 5s for 5m |
| `dw_compile_total{outcome}` | counter | error rate > 5% for 5m |
| `dw_runtime_available` | gauge | 0 for 60s → **page** |
| `dw_pool_size` / `dw_pool_busy` | gauge | busy == size for 2m (saturation) |
| `dw_container_recycles_total{reason}` | counter | OOM recycles > 3/h |
| `dw_cold_start_total` | counter | any, while keep-warm is meant to be on |
| `dw_circuit_state` | gauge | open > 2m |

Log per execution, **structured**: script hash (never the script), input sizes,
duration, exit status, peak memory, container id. The current
[api/transform](../../client/app/api/transform/route.ts#L96) route logs user
script content to stdout — that is
[H-6](02-security.md#h-6--verbose-error-messages-returned-to-clients) and must
not be reproduced in the runtime.

Add a **synthetic canary**: compile a known script every 60s from outside the
cluster and alert on wrong output, not just on failure. A runtime that returns
*incorrect* results is worse than one that is down, and nothing else in this list
would catch it.

---

## 8. Migration path

The frozen legacy contract makes this safer than it looks: the existing
[contract test](../../server/tests/integration/legacy-transform.contract.test.ts)
already pins the response shape, so step 1 has a ready-made acceptance criterion.

| Step | Work | Risk | Reversible |
|---|---|---|---|
| 0 | **Keep-warm pinger against the current upstream** | none | yes |
| 1 | Build `runtime/` with a pinned DataWeave version; verify byte-identical output against the current upstream over a golden corpus | low | n/a |
| 2 | Deploy alongside; **shadow-run** every production request against both and diff outputs. Serve the old result. | low — read-only | yes |
| 3 | Cut staging to the new runtime | low | yes |
| 4 | Cut production; keep the third party as automatic fallback for one week | medium | yes |
| 5 | Remove the fallback; consolidate the two divergent upstream URLs into one | low | yes |

**Step 2 is the one that de-risks the whole project.** Shadow-running turns
"does our runtime behave identically?" from a hope into a measurement, before any
user is exposed.

### Version pinning

Pin the DataWeave version explicitly and treat an upgrade as a migration with its
own golden-corpus diff. Today the version can change under the platform without
notice, which silently breaks any problem whose expected output depends on
version behaviour — and every affected user sees a wrong verdict with no
explanation.

---

## 9. Sequencing

| Phase | Work | Effort | Outcome |
|---|---|---|---|
| **A — now** | Keep-warm pinger · runtime-availability alert · circuit breaker · distinguish infra failure from user error in `lib/grading.ts` | **1.5d** | W1-R1 mitigated; downtime stops polluting user history |
| **B** | Build `runtime/`, golden corpus, parity harness | 3d | A runtime we control exists |
| **C** | Shadow-run and diff | 1d | Parity proven with real traffic |
| **D** | Warm pool, resource limits, network isolation, gVisor | 2.5d | Sandbox is actually a sandbox |
| **E** | Metrics, canary, dashboards, alerts | 1d | Operable |
| **F** | Cut over, keep fallback, then remove | 1d | Owned end to end |

**Total ~10 days.** Phase A is the urgent part and is independent of everything
else — it should ship before the Week 1 changes reach production, because Week 1
is what put the compiler on the critical path.

---

## 10. Recommendation

**Do Phase A before deploying Week 1 to production.** It is 1.5 days, it directly
mitigates the risk Week 1 introduced, and every part of it is independently
revertible.

Phases B–F can follow the M1 foundations work. But do not expose server-side
grading to production traffic while the runtime is an unowned free-tier service
that sleeps after 15 minutes — that combination guarantees a visible failure, and
it will look like the grading change broke the product rather than the
infrastructure underneath it.
