---
tags: [moc, decisions]
---
# Decisions

Why things are the way they are. Each note records the choice, the alternative,
and what it cost — so a future reader can tell a deliberate decision from an
accident.

```mermaid
graph TD
    A1[[ADR-001 Two Backends]] --> A3[[ADR-003 Difficulty Registry]]
    A3 --> A4[[ADR-004 npm Workspaces]]
    A1 --> A2[[ADR-002 Server-Side Grading]]
    A4 --> A5[[ADR-005 MIT Licence]]
```

- [[ADR-001 Two Backends]] — finish the second architecture, don't design a third
- [[ADR-002 Server-Side Grading]] — the browser cannot be the grader
- [[ADR-003 Difficulty Registry]] — one array, everything derives
- [[ADR-004 npm Workspaces]] — and the deployment bill it came with
- [[ADR-005 MIT Licence]] — "open source" was not legally true

## Related
[[DWCode]] · [[Architecture Overview]]
