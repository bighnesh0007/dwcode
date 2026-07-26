---
tags: [adr]
status: accepted
---
# ADR-005 · MIT licence, made real

**Context.** The repo was **public**, the README said *"MIT — feel free to use,
fork, and extend"*, and there was **no LICENSE file**. The package manifests
said `ISC`.

**Why that mattered.** Without a licence file the default is *all rights
reserved*. The README's promise carried no legal force, and nobody who forked
the repo was actually licensed to use it. The project was open source in
sentiment only.

**Decision.** Add MIT — implementing the intent already stated, not choosing on
the owner's behalf — and align all four manifests to match.

**Result.** GitHub now detects the licence; community health went 0% → 100%.

## Related
[[Operations]] · [[DWCode]]
