---
tags: [finding, high, closed]
severity: High
status: closed
---
# W1-R9 · The default compiler URL was dead

`lib/config.ts` fell back to `https://dwlbackend.onrender.com`, which **404s on
every path**. It answers in ~1s, so the host is alive — it just stopped serving
the compiler.

Before [[C-4 Client-Side Grading]] was fixed, this only broke the playground.
**After**, it broke *every submission*, because grading moved onto the request
path.

**Fixed:** repointed to the upstream the server already used successfully, plus
a production warning when the variable is unset.

The lesson generalises: a silent fallback to a hardcoded third-party host is a
time bomb. Fail loudly on missing config instead.

## Related
[[DataWeave Runtime]] · [[Security Findings]] · [[Client]]
