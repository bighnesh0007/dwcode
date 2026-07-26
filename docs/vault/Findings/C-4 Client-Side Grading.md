---
tags: [finding, critical, closed]
severity: Critical
status: closed
---
# C-4 · Client-side grading

**The browser was the grader.** `Workspace.tsx` fetched test cases, ran them,
compared outputs, decided `Accepted`, and POSTed that verdict. The server stored
it verbatim and paid out on it.

```bash
curl -X POST /api/submissions -b "<session>" \
  -d '{"problemId":"…","code":"-","status":"Accepted"}'
```

That one request bought first-solve coins, a difficulty bonus, a leaderboard
solve, and a public GitHub commit claiming it. Loop over `/api/problems` and you
are rank #1 having written no DataWeave.

For a ranked practice platform this was not a bug in a feature — it invalidated
the feature set. `hiddenTestCases` existed and was correctly hidden, but nothing
ever ran them, so the protection was decorative.

**Fixed:** verdicts computed in `lib/grading.ts` from database test cases; a
body carrying `status` is **rejected**, not ignored.

**Consequence:** this put [[DataWeave Runtime]] on the critical request path.

## Related
[[Security Findings]] · [[FEAT-01 Server-Side Grading]] · [[DataWeave Runtime]]
