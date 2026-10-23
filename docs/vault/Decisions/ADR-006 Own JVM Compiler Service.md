---
tags: [adr]
status: accepted
verified-on: 2026-10-24
---
# ADR-006 · Own the DataWeave runtime as a JVM service

**Context.** The compiler is a third-party Render free-tier URL on the
submission path ([[DataWeave Runtime]]). Measured baseline:
[[W2-R1 Compiler Latency Baseline]].

**Decisions (chosen 2026-10-23).**

| Question | Chosen | Rejected, and why |
|---|---|---|
| Layout | `compiler/` beside `client/` and `server/` | `server/api` + `server/compiler`: rewrites `render.yaml`, workspace paths and the Vercel `ignoreCommand` only to rename things |
| Hosting | ~~Render paid instance~~ — superseded 2026-10-23: **everything runs on one local machine**, exposed via Cloudflare Tunnel ([[Local Stack]]) | Fly/Railway: a second platform to run. Free tier + pinger: the cold start is the defect we are fixing |
| Engine | Open-source DataWeave runtime **embedded** in a warm JVM | Wrapping the CLI per request: pays JVM start on every call, which is probably what the upstream does now (an inference, not verified) |
| Scope | Compiler (Phases 1–2) before route migration | Strict order: leaves the core loop broken for weeks longer |

| Run vs Submit (2026-10-23) | Run → compiler directly; Submit → Redis queue (BullMQ) → workers | All-queued: every Run pays queue latency. Nothing queued: a spike rejects users instead of making them wait |
| Redis (2026-10-23) | ~~Render Key Value~~ → local redis-server (built from source into ~/.local) | Upstash: second provider, reached over the public internet |
| Design load (2026-10-23) | **500 concurrent users**, see [[Compiler Capacity Plan]] | — |

**Licence gate — passed 2026-10-23.** `org.mule.weave:runtime`, `core`, `wlang`
and `debugger` 2.12.2 declare *The Apache License, Version 2.0* in their POMs at
`repository.mulesoft.org/nexus/content/repositories/releases/`. The engine's
source is **not** public (the `mulesoft-labs/data-weave-cli` README: "in the
process of being open-sourced"); we consume published binaries. Published
runtime versions include 2.3.0–2.3.2 and 2.12.0–2.13.0.

**Which runtime version** is decided by the parity corpus, not by preference.
`then` (missing upstream, issue #8) suggests the upstream runs a pre-2.4 runtime.
2.12.x would add `then` but may change other outputs. Run the corpus against both
and pick from the diff.

**Gate before switch-over:** 100% parity with the captured corpus, and latency
at least as good as the baseline.

## Related
[[ADR-001 Two Backends]] · [[DataWeave Runtime]] · [[W2-R1 Compiler Latency Baseline]] · [[W2-R2 Client Sends Unserialised Inputs]]

## Outcome (2026-10-24)
- Engine **2.12.2** in warm worker JVMs; engine privileges off; runaway scripts SIGKILLed ([[W2-R1 Compiler Latency Baseline]] for before/after).
- Measured through the full public path at 500 concurrent users: p50 8 ms, p95 19 ms, 0 errors.
- Parity: the Render reference capture stopped at 51 cases (all matched). The problem audit then ran every solution on 2.12.2 **and** a 2.3.2 reference: 32 of 39 failing problems fail identically on both (bad stored data, issue #9); 7 could not be compared (2.3.2 harness error). No engine regression found.
