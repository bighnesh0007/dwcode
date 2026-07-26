---
tags: [task, open]
priority: P1
---
# FEAT-01 · Server-side grading (remaining scope)

[[ADR-002 Server-Side Grading]] closed the security hole. What remains:

- **Execute `hiddenTestCases`** — they exist, are correctly hidden from the API,
  and are still never run. The 10 seeded Expert problems already ship 3–4 each,
  ready to activate.
- **Warm compiler pool** — makes 24 tests per submission affordable
  ([[DataWeave Runtime]])
- **`LIMITS.grading.concurrency`** — currently sequential
- **Atomic coin awards.** Two simultaneous accepted submissions can both read
  `prevAccepted === 0` and each pay a first-solve bonus. Fix with a unique index
  on an award ledger plus a conditional update — never a `countDocuments` check
  followed by a write.
- **Distinguish infrastructure failure from a user error.** A compiler outage
  currently writes `status: "Error"` against the *user's* submission, polluting
  their history with our downtime. It should return `503` and persist nothing.

## Related
[[ADR-002 Server-Side Grading]] · [[C-4 Client-Side Grading]] · [[DataWeave Runtime]]
