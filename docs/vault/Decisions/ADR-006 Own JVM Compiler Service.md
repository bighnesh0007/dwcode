---
tags: [adr]
status: accepted
verified-on: 2026-10-23
---
# ADR-006 · Own the DataWeave runtime as a JVM service

**Context.** The compiler is a third-party Render free-tier URL on the
submission path ([[DataWeave Runtime]]). Measured baseline:
[[W2-R1 Compiler Latency Baseline]].

**Decisions (chosen 2026-10-23).**

| Question | Chosen | Rejected, and why |
|---|---|---|
| Layout | `compiler/` beside `client/` and `server/` | `server/api` + `server/compiler`: rewrites `render.yaml`, workspace paths and the Vercel `ignoreCommand` only to rename things |
| Hosting | Render paid instance (~$7/mo), always on | Fly/Railway: a second platform to run. Free tier + pinger: the cold start is the defect we are fixing |
| Engine | Open-source DataWeave runtime **embedded** in a warm JVM | Wrapping the CLI per request: pays JVM start on every call, which is probably what the upstream does now (an inference, not verified) |
| Scope | Compiler (Phases 1–2) before route migration | Strict order: leaves the core loop broken for weeks longer |

**Gate before Phase 1:** confirm the runtime's licence and how closely it matches
language 2.3.0. If either fails, fall back to the CLI behind a warm process pool.

**Gate before switch-over:** 100% parity with the captured corpus, and latency
at least as good as the baseline.

## Related
[[ADR-001 Two Backends]] · [[DataWeave Runtime]] · [[W2-R1 Compiler Latency Baseline]] · [[W2-R2 Client Sends Unserialised Inputs]]
