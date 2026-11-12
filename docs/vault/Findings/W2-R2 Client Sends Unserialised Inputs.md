---
tags: [finding, high]
severity: High
status: closed
verified-on: 2026-10-24
---
# W2-R2 · The client sends compiler inputs unserialised

The upstream compiler expects `inputs[].value` as a **JSON string**, which it
parses. `server/` does this correctly (`dataweave.client.ts`: `JSON.stringify`
when the value is not already a string).

The client sends the **parsed** value instead:
- `client/lib/grading.ts` (around line 143), which runs submissions
- `client/app/api/execute/route.ts`, the problem Run button
- `client/scripts/lib/compiler.mjs`, used by `audit:problems`

Verified against the upstream on 2026-10-22. The value is coerced to text before
parsing:

| Sent `value` | Upstream sees | Result |
|---|---|---|
| `[1,2,3]` | `"1,2,3"` → `1` | wrong type error |
| `{"a":[1,2,3]}` | `"[object Object]"` | parse error |
| `"[1,2,3]"` (string) | `[1,2,3]` | correct |

**Not yet established:** whether production is affected. That depends on whether
Vercel's `DWL_BACKEND_URL` points at the upstream directly, which breaks every
object- or array-input submission, or at `server/`'s legacy proxy, which
serialises and works. Check the Vercel env before fixing.

## Related
[[DataWeave Runtime]] · [[FEAT-01 Server-Side Grading]] · [[Client]]

**Closed 2026-10-24:** the client no longer calls the compiler at all; every run goes through server/, which serialises inputs.
