# DWCode Vault

An [Obsidian](https://obsidian.md) vault holding the project's context as a
**linked graph** rather than a pile of documents.

## Open it

Obsidian → *Open folder as vault* → select `docs/vault/`.
Then **Ctrl/Cmd + G** for the graph view.

You don't need Obsidian — these are plain markdown files and render fine on
GitHub. You just lose the graph and backlinks.

## Why a graph

Long documents answer "what does the audit say?". A graph answers the questions
you actually have at 2am:

- *What breaks if the DataWeave runtime goes down?* → open [[DataWeave Runtime]],
  read its backlinks
- *Why is it built this way?* → [[Decisions]]
- *What still needs doing before I deploy?* → [[Pending Migrations]]

## Layout

```
DWCode.md                 ← start here
Architecture Overview.md
Security Findings.md
Decisions.md
Components/               client, server, shared, database, runtime
Findings/                 the findings worth their own node
Decisions/                ADRs — the choice, the alternative, the cost
Operations/               migrations, deployment, CI, open tasks
```

## Conventions

- `[[Wikilinks]]` are the graph's edges — link generously
- Frontmatter `tags:` drive filtering (`#finding`, `#adr`, `#urgent`)
- Mermaid blocks render natively in Obsidian **and** on GitHub
- **This vault summarises.** The authoritative documents are `docs/audit/`,
  `docs/runbooks/` and `docs/plans/`. When they disagree, they win.

## Suggested community plugins

Core graph view works out of the box. These add most:

| Plugin | Why |
|---|---|
| **Dataview** | Query notes as data — e.g. every `#finding` still `status: open` |
| **Excalidraw** | Freehand architecture sketches alongside the notes |
| **Kanban** | Turn [[Pending Migrations]] into a board |
| **Git** | Auto-commit vault edits, so notes travel with the code |
