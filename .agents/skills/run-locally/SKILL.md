---
name: run-locally
description: Run the DWCode Next.js app locally to verify a change in the real app. Use when asked to run, start, or screenshot the app, or to confirm a fix works before pushing. Handles the MongoDB + Clerk + env setup this app needs.
---

# Run DWCode locally

DWCode is a Next.js 16 (Turbopack) app on **port 8000**, backed by **MongoDB via Mongoose**
and **Clerk** auth. `npm run dev` alone is NOT enough — pages that read data (e.g. any
`/problems/<slug>` page) throw `Please define the MONGODB_URI environment variable` until the
DB and env are set up. The home page renders without a DB, but a problem/description page does not.

## Setup (once per machine)

1. **Env file.** `.env.local` is gitignored and not checked in. Create it:
   ```
   MONGODB_URI=mongodb://localhost:27017/dwcode
   NEXT_PUBLIC_APP_URL=http://localhost:8000
   ```
2. **MongoDB.** The repo ships a `docker-compose.yml` with a `mongo:latest` service named
   `dwcode_mongodb` on `27017`. Start it (Docker daemon must be running):
   ```bash
   docker compose up -d
   docker exec dwcode_mongodb mongosh --quiet --eval "db.runCommand({ping:1}).ok"   # -> 1
   ```
3. **Clerk.** No key needed for local dev — the first `npm run dev` provisions a *keyless*
   throwaway dev instance under `.clerk/.tmp/keyless.json`. **Never commit `.clerk/`** (it holds
   a secret key; it's already generated locally, not in git history).

## Launch

```bash
npm run dev   # next dev -p 8000
```

- **Order matters:** the dev server reads `.env.local` at startup. If it was already running
  before you created `.env.local` (or you changed env), **restart it** — otherwise
  `/api/problems` still returns the `MONGODB_URI` error. Confirm the boot log shows
  `- Environments: .env.local`.
- Run it in the background and tail the output file to confirm `✓ Ready`.

## Seed data to exercise a page

There is **no seed script**. Insert directly with `mongosh` against the running container.
The `Problem` model (`models/Problem.ts`) requires `title, slug, difficulty (Easy|Medium|Hard),
category, description`; `examples/constraints/hints/testCases` are optional arrays. Example:

```bash
docker exec -i dwcode_mongodb mongosh --quiet dwcode <<'EOF'
db.problems.deleteOne({ slug: "demo" });
db.problems.insertOne({
  title: "Demo", slug: "demo", difficulty: "Easy", category: "Objects",
  tags: ["update"],
  description: "Use `update` to add **stuff**.\n\n## Approach\n- do the thing",
  examples: [{ input: '{ "a": 1 }', output: '{ "a": 2 }' }],
  constraints: ["a >= 0"], hints: ["hint"], testCases: [], hiddenTestCases: [],
  createdAt: new Date()
});
EOF
```

## Verify

- API smoke: `curl -s http://localhost:8000/api/problems` returns the seeded doc.
- Page: `curl -s http://localhost:8000/problems/demo -w "HTTP %{http_code}\n" -o /tmp/p.html`
  then grep `/tmp/p.html` for the rendered output you expect.
- **Visual check:** if a screenshot tool can't reach `http://localhost:8000` (some are https-only),
  verify by grepping the served HTML instead, and open the URL in a browser for a visual check.
  Note that Next embeds the raw props as an RSC payload at the bottom of the page — the *rendered*
  markup is what matters, not that raw string.

## Cleanup (offer, don't assume)

`docker compose down` stops MongoDB (add `-v` to drop the volume). `.env.local` and seeded rows
are local-only; leave them unless the user wants a clean slate.
