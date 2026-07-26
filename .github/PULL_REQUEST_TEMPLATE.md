## What & why

<!-- What changes, and what problem it solves. Link the issue if there is one. -->

Closes #

## How I verified it

<!-- Not "it builds" — what did you actually observe? -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Checked manually in the running app

## Checklist

- [ ] No hardcoded `"Easy" | "Medium" | "Hard"` — difficulty comes from `@dwcode/shared`
- [ ] No `models/*` imported from a `"use client"` component
- [ ] No request body spread into a Mongoose constructor
- [ ] New/changed endpoints authorise in the handler, not in middleware
- [ ] No secrets, tokens or `.env` values in the diff

## Database

- [ ] No schema or index change
- [ ] Includes an idempotent, `--dry-run`-able migration, backwards-compatible
      with the currently-deployed code

## Deployment

- [ ] Nothing needed
- [ ] Needs a config change — described below

<!-- Vercel/Render settings, new env vars, migration ordering… -->
