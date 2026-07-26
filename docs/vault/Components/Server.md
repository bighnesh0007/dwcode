---
tags: [component]
---
# Server · Express

`server/` → Render. Long-lived process: `app.listen`, Mongo pool, heartbeat,
weekly-contest scheduler. **Cannot run serverless** — that is why it is not on
Vercel.

Genuinely well-built and barely used. Composition root with constructor
injection, ports/adapters, fail-fast validated config, pino, typed error
envelope, rate-limit policies.

## What it actually serves

- `POST /api/transform`, `/health`, `/healthcheck` — **frozen legacy contract**,
  byte-compatibility locked by a characterisation test
- `/api/v1/sponsorship/*` — the only migrated domain

## Dead config awaiting the migration

`RATE_LIMIT_POLICIES` defines nine policies; **two** are wired. `ABUSE_RULES`
and `ATTEMPT_TTL_MS` are imported by nothing. They are the design for work not
yet done, not oversights.

## Deployment

`rootDir` was removed for [[ADR-004 npm Workspaces]]. **The blueprint must be
re-applied** for `render.yaml` changes to take effect — Render uses stored
settings otherwise. See [[Deployment]].

## Related
[[Architecture Overview]] · [[Client]] · [[Shared Package]]
