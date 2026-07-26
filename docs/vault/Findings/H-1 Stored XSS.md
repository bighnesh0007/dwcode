---
tags: [finding, high, mitigated]
severity: High
status: mitigated
---
# H-1 · Stored XSS via attribute injection

**Confirmed by execution, not inference.**

`lib/markdown.ts` escaped `&`, `<`, `>` — but **not `'`** — then emitted link
URLs into **single-quoted** attributes. The file's own comment claimed this
"closes the stored-XSS vector". It closed *tag* injection and left *attribute*
injection wide open.

```
[click](https://e.com'onmouseover='location=name)
→ <a href='https://e.com'onmouseover='location=name' …>
```

HTML5 tokenisation recovers from the missing space after a quoted value, so
browsers parse `onmouseover` as a real handler. `location=name` needs no
parens, spaces, `&` or backticks — each of which the filter would have blocked.

Reachable from three stored sinks, all rendered with `dangerouslySetInnerHTML`:
blog posts, comments, and **problem descriptions** — the last writable
anonymously via [[C-1 Unauthenticated Problem Write]].

**Mitigated:** quotes escaped, URLs validated with `new URL()`, property test
asserts no `on\w+=` survives for any input.
**Still open:** SEC-11 replaces the hand-rolled renderer with a real sanitiser.

## Related
[[Security Findings]] · [[C-1 Unauthenticated Problem Write]] · [[Client]]
