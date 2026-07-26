---
tags: [adr]
status: accepted
---
# ADR-001 · Consolidate on the Express server

**Context.** Two backends against one database. [[Server]] is well-layered and
carries 4% of traffic; [[Client]] carries the rest with none of that discipline.

**Options.**

| | Consolidate on `server/` | Rebuild discipline inside Next.js |
|---|---|---|
| Reuses existing work | ✅ | ❌ duplicates it a third time |
| Long-lived processes | ✅ | ❌ serverless freezes between calls |
| Deploy targets | 2 | 1 |

**Decision: consolidate on `server/`.**

**Why.** Not elegance — the two hardest remaining problems both need a
long-lived process. Server-side grading needs a warm compiler pool and a
concurrency budget; contest scoring and GitHub pushes need a job queue. Neither
survives a runtime that freezes between invocations. The weekly-contest
scheduler already lives there for exactly this reason.

**Cost.** Two deploy targets and a version-skew window. Mitigated by
additive-only API changes, a versioned `/api/v1` prefix, and deploying the API
before the client.

**Migration.** Strangler-fig, one domain at a time. Never a big-bang rewrite.

## Related
[[Architecture Overview]] · [[ADR-002 Server-Side Grading]]
