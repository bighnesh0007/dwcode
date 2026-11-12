---
tags: [finding, measurement]
status: open
verified-on: 2026-10-23
---
# W2-R1 · Compiler latency baseline

Upstream `dataweave-playground-h1p7.onrender.com`, measured 2026-10-22 from a
dev machine with `compiler/parity/bench-latency.mjs` (trivial `map` script,
1 first request + 30 sequential, result checked).

| | ms |
|---|---|
| First request after idle (cold) | **36,834** |
| First request, already warm | 4,882 |
| Warm p50 | **4,659** |
| Warm p95 | 5,290 |
| Warm max | 5,450 |
| `GET /healthCheck` round trip, for comparison | 300–1,200 |

**Reading.** About 4s of each warm request is work on the upstream, not network.
That fits a JVM or CLI being started per request, but this is an inference: the
upstream's code is not visible. A cold request exceeds the 15s grading timeout by
more than 2×.

**Target for [[ADR-006 Own JVM Compiler Service]]:** beat these numbers measured
the same way. Re-run: `node compiler/parity/bench-latency.mjs --url <base>`.

## Related
[[DataWeave Runtime]] · [[ADR-006 Own JVM Compiler Service]]
