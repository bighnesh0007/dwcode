# Copilot instructions

Follow the repository rules in [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md);
they apply to every agent.

The essentials:

- npm workspace — install and run scripts from the repository root.
- Difficulty tiers come from `@dwcode/shared`; never hardcode `"Easy" | "Medium" | "Hard"`.
- Database access only through `client/lib/repositories/`; never import
  `@/models/*` or `mongoose` elsewhere, and never from a `"use client"` component.
- Never spread a request body into a model; map fields explicitly.
- Authorise in the route handler, not middleware.
- Never hand-write a problem's `expectedOutput`; generate it by running the solution.
- Gate before committing: `npm run typecheck && npm run lint && npm test && npm run build`.
