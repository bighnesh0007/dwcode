---
tags: [ops, capacity]
status: draft
verified-on: 2026-10-23
---
# Compiler Capacity Plan

**Target: 500 concurrent users** ([[ADR-006 Own JVM Compiler Service]]).

## Load model, with every assumption shown

| Source | Rate | Basis |
|---|---|---|
| Live compile (playground) | each typing user ≤ 1 compile / 3s | the 3s debounce in `docs/plans/playground-live-compile.md` |
| Worst case Run | 500 ÷ 3 ≈ **170 compiles/s** | assumes all 500 typing at once; real traffic is far lower |
| Contest-start Submit burst | 500 × cases per problem (~5–10) ≈ **2,500–5,000 jobs** within a minute or two | queued, not served synchronously |

Redis result caching (key: hash of script, input and runtime version) removes
repeated compiles. Its hit rate is unknown until measured.

## Sizing formula (numbers filled in Phase 1)

```
cores needed = peak compiles/s × CPU-seconds per compile ÷ target utilisation (0.6)
```

CPU-seconds per compile for the embedded runtime is **not yet measured**. The
upstream's ~4.7s per request is not comparable, see [[W2-R1 Compiler Latency Baseline]].
Phase 1 measures it on the corpus, then this table gets real numbers.

## Controls

- **Rate limit** in Redis: per user and per IP, shared by every server instance.
- **Concurrency cap** per compiler instance: worker threads = cores.
- **Load shedding:** when the Run queue wait would exceed ~2s, return
  `429` + `Retry-After` instead of piling up.
- **Submit queue** drains at the workers' rate. Queue depth and wait time are
  exported as metrics.
- **Pre-warm** before the Saturday 15:00 UTC contest.

## Proof

Load-test at 500 simulated users (k6) against staging, replaying corpus scripts.
Pass when Run p95 < 1s, there are no 5xx, and the Submit queue drains in under 2 min.

## Related
[[ADR-006 Own JVM Compiler Service]] · [[DataWeave Runtime]] · [[W2-R1 Compiler Latency Baseline]]
