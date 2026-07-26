---
tags: [finding, critical, closed]
severity: Critical
status: closed
---
# C-1 · Unauthenticated problem write

`PUT` and `DELETE` on `/api/problems/[id]` had **no auth call of any kind**, and
`proxy.ts` did not cover `/api/problems`.

```bash
curl -X DELETE https://<host>/api/problems/<any-id>   # gone
```

`PUT` accepted the whole document, so `solution` and `hiddenTestCases` were
rewritable too — turning any problem into one the attacker had already solved.

Chained with [[H-1 Stored XSS]] it let an anonymous attacker store XSS in a
problem description that fired for every solver.

**Fixed:** `requireAdmin()` on both, plus a 12-field allowlist replacing
`findByIdAndUpdate(id, rawBody)`.

## Related
[[Security Findings]] · [[H-1 Stored XSS]] · [[Client]]
