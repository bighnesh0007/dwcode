---
tags: [finding, high, accepted]
severity: High
status: partially-accepted
---
# W1-R8 · Dependency CVEs

The audit could not run `npm audit` (no Node in that environment) and said so
rather than implying a clean bill. When it was finally run: **6 High** in the
client production tree.

The one that mattered: **`next` 16.2.9 — middleware/proxy bypass in App Router +
Turbopack.** This app's page authorisation *is* middleware ([[Client]]'s
`proxy.ts`) and it runs Turbopack. Directly applicable.

**Fixed:** `next` → 16.2.12, `mongoose` → 9.8.0 (prototype pollution, which
compounded the mass-assignment finding).

## The remainder are unfixable

`postcss` and `sharp` are bundled *inside* Next.js. npm's only suggested remedy
is `next@9.3.3` — a downgrade from 16 to 9 that would destroy the app. Neither
is reachable here: every `<Image>` passes `unoptimized`, and PostCSS only sees
our own Tailwind at build time.

Recorded as **expiring risk acceptances** in `scripts/audit-gate.mjs` — each with
a justification and an expiry, so CI fails again on **2026-10-31** and forces a
re-review rather than ignoring them forever.

## Related
[[Security Findings]] · [[SEC-21 Move Auth Off Middleware]] · [[Operations]]
