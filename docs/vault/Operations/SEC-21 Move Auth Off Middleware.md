---
tags: [task, open, security]
priority: P1
---
# SEC-21 · Move page protection off middleware

`@clerk/nextjs` 7.6.1 deprecates `createRouteMatcher`, and its stated reason
matches [[W1-R8 Dependency CVEs]] exactly:

> *"Middleware-based auth checks rely on path matching, which can diverge from
> how Next.js routes requests and leave protected resources reachable."*

Two independent sources — Clerk and the Next.js CVE — now say middleware is the
wrong place for authorisation.

**Risk today: low.** Every protected *action* already enforces authorisation in
its own route handler, so a bypass exposes an empty page shell, not data.
Suppressed in `proxy.ts` with a comment pointing here.

**The work.** Replace the matcher with `auth.protect()` inside `/profile`,
`/create`, `/admin`, `/blog/new`. Keep `/profile/[username]`, `/blog` and
`/sponsor` reachable signed-out — that was a deliberate earlier fix.

## Related
[[Security Findings]] · [[Client]] · [[W1-R8 Dependency CVEs]]
