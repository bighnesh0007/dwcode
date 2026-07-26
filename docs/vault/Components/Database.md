---
tags: [component]
---
# Database · MongoDB Atlas

One cluster, ~16 collections, **two processes** connecting with independently
declared schemas.

## ⚠️ autoIndex writes to production

Mongoose defaults `autoIndex: true`, so loading a model builds its indexes
against whatever `MONGODB_URI` names. Because `.env.local` points at
**production**, a local `next dev` created 13 production indexes unprompted.

Now `autoIndex: false` by default in `client/lib/db.ts`. Index creation is a
deliberate step — see [[Pending Migrations]].

## The hazard this left behind

`notes` currently carries **both** unique indexes:

| Index | Status |
|---|---|
| `problemId_1` | stale — must be dropped |
| `userId_1_problemId_1` | created by autoIndex |

autoIndex could create the new one but **cannot drop the old one**. With the
per-user notes code deployed, the first user to save a note on a problem
succeeds and every other user gets a duplicate-key error. Migration 001 fixes
it. → [[Pending Migrations]]

## Related
[[Pending Migrations]] · [[Client]] · [[Server]]
