---
tags: [component]
---
# Client · Next.js

`client/` → Vercel → https://dwcode.vercel.app

Next.js 16 App Router, React 19, Tailwind v4, Clerk, Monaco.
**Also the de-facto backend**: 34 API route handlers talking straight to
[[Database]] via Mongoose.

## Things that will surprise you

- **Middleware is `proxy.ts`**, not `middleware.ts` — renamed in Next 16.
- **Never import `models/*` from a `"use client"` component.** It pulls Mongoose
  (and `async_hooks`) into the browser bundle and fails the build. Constants go
  in `client/lib/`.
- `turbopack.root` and `outputFileTracingRoot` point at the **repo root**, not
  `client/` — required since [[ADR-004 npm Workspaces]].
- `globals.css` has `@source "../../packages/shared/src"` so Tailwind sees the
  class strings in [[Shared Package]]. Without it the difficulty colours are
  silently purged — build passes, UI renders unstyled.

## Key files

| Path | Why it matters |
|---|---|
| `lib/grading.ts` | Server-side verdicts — see [[FEAT-01 Server-Side Grading]] |
| `lib/markdown.ts` | Had a confirmed stored XSS — [[H-1 Stored XSS]] |
| `lib/config.ts` | The only validated `process.env` reader |
| `lib/format.ts` | Display formatting; never affects grading |
| `proxy.ts` | Page-level auth — [[SEC-21 Move Auth Off Middleware]] |

## Related
[[Architecture Overview]] · [[Server]] · [[Shared Package]]
