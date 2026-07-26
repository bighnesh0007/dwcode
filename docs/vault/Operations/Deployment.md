---
tags: [ops]
---
# Deployment

| Part | Platform | Config |
|---|---|---|
| [[Client]] | Vercel | `vercel.json` / `client/vercel.json` |
| [[Server]] | Render | `render.yaml` |

## Traps, all hit for real

**1. Comment keys in JSON.** Both `vercel.json` files used `"//"` pseudo-comments.
Valid JSON, but Vercel's schema rejects unknown properties:
`should NOT have additional property '//'`. Build fails before it starts.

**2. Render does not read `render.yaml` on every deploy.** It uses **stored**
settings. A changed build command needs the **blueprint re-applied**. This caused
a real failure: Render kept running `npm install; npm run build` with
`rootDir: server`, so `build:shared` never ran.

**3. Root Directory choice changes which file is read.**

| Root Directory | File | Needs the dashboard toggle? |
|---|---|---|
| repo root *(simpler)* | `vercel.json` | **no** |
| `client` | `client/vercel.json` | **yes** — "Include source files outside of the Root Directory" |

Both are valid and workspace-aware, so either works.

**4. Build order.** `@dwcode/shared` is consumed as compiled `dist/`, so it must
build first. Now enforced by `prepare`/`prebuild` in the packages themselves, so
it holds regardless of the platform's command — see [[ADR-004 npm Workspaces]].

## Related
`docs/runbooks/deployment-prerequisites.md` · [[ADR-004 npm Workspaces]] · [[Server]]
