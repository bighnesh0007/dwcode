# Instructions for coding agents

This file is read by agents that look for `AGENTS.md` (Codex, Cursor, Jules and
others). The rules are the same for every agent and every human:

- **Project rules:** [CLAUDE.md](CLAUDE.md) — the non-obvious constraints
  (workspace installs, the shared difficulty registry, no mass assignment,
  authorise in handlers, never hand-write `expectedOutput`, `MONGODB_URI` is
  production).
- **Next.js:** [client/AGENTS.md](client/AGENTS.md) — this Next.js version has
  breaking changes; read its bundled docs before writing code.
- **Data access:** only through `client/lib/repositories/` (ESLint-enforced).
- **Before committing:** `npm run typecheck && npm run lint && npm test && npm run build`
  from the repository root.
- **Database work:** follow [docs/runbooks/database-migrations.md](docs/runbooks/database-migrations.md) —
  dry-run first, always.
- **Skills:** step-by-step procedures in [.agents/skills/](.agents/skills/).
