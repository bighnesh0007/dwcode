---
tags: [adr]
status: accepted
---
# ADR-002 · Grade on the server

**Context.** [[C-4 Client-Side Grading]] — the browser computed its own verdict.

**Options considered.**

1. Force `Attempted` until a full grading service exists — secure, but nobody
   could solve anything for ~6 weeks. Leaderboard frozen.
2. **Re-verify server-side now** — 1 day instead of 3 hours, keeps the product
   working, genuinely closes the finding.
3. Anti-abuse only — keeps trusting the client. Slows forgery, doesn't stop it.

**Decision: option 2.**

**Deliberately unchanged:** the grading *semantics*. Same JSON normalisation,
same sequential order, same early-break on compiler error, same **visible** test
cases. No user's verdict changed as a result — only *who computes it* changed.

**Deliberately deferred:** `hiddenTestCases` still are not executed. Running
them would make problems genuinely harder than the day before — a product
decision, not a security fix. Belongs with the warm pool in
[[FEAT-01 Server-Side Grading]].

**Consequence, accepted knowingly:** this put [[DataWeave Runtime]] on the
critical request path, which is why owning it moved from P2 to P1.

## Related
[[C-4 Client-Side Grading]] · [[DataWeave Runtime]] · [[FEAT-01 Server-Side Grading]]
