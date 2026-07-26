---
tags: [adr]
status: accepted
---
# ADR-003 · One difficulty registry

**Context.** `difficulty` was hardcoded across **17 files** with **four**
independently-maintained copies of the scoring tables — plus a fifth in *prose*
in the weekly-contest description, which would have started lying the moment a
tier was added.

**Decision.** One array in `packages/shared/src/difficulty.ts`. Every consumer
derives from it.

**Proof it worked.** Adding the `Expert` tier changed **one file**. Score weight,
coin reward, Mongoose enum, filter bar, badge colours, progress counts, AI
prompt vocabulary and contest text all updated automatically.

**Two constraints that fell out.**

1. **`id` is persisted.** Adding a tier is safe; renaming one is a migration.
2. **Per-tier config maps became partial by type** (`problemMix` in the weekly
   contest). That is the point — a new tier must not force an edit there — but a
   tier absent from such a map is silently not drawn. Documented at each site.

**A trap worth knowing.** Tailwind only generates classes it can see and does
not scan `node_modules`. Without `@source` in `globals.css` the colours would
have been purged silently: build green, UI unstyled.

## Related
[[Shared Package]] · [[ADR-004 npm Workspaces]]
