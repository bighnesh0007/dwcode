---
tags: [ops, runbook]
verified-on: 2026-10-24
---
# Local Stack

Everything runs on one machine; the public site is https://dwl.bighnesh.space
through a Cloudflare named tunnel. Decision: [[ADR-006 Own JVM Compiler Service]].

| Component | Address | Notes |
|---|---|---|
| redis | 127.0.0.1:6379 | ~/.local/bin/redis-server, AOF on, noeviction (BullMQ) |
| compiler | 127.0.0.1:8080 | Java 21, 8 warm workers here (sized from cores/memory) |
| server | 127.0.0.1:4000 | Express API — **every** API route lives here |
| client | localhost:8000 | Next.js standalone; proxies `/backend/*` → server |
| tunnel | dwl.bighnesh.space → localhost:8000 | `npm run tunnel:setup` (one-time, needs your Cloudflare login) |

- Start: `npm run up` (builds what changed, health-gates each step). Runs at
  boot as a systemd **user** service: `npm run service:install`; status
  `npm run service:status`, logs `npm run service:logs` and `.run/logs/`.
- Only one launcher at a time (`.run/up.pid`); two once left the site with
  no static assets.
- The site binds `localhost`, not 127.0.0.1: Next proxies to itself at
  localhost (IPv6 first).
- Auth through the proxy: the server accepts Clerk's `__session` cookie;
  cookie-authenticated writes must come from an allowed Origin (CSRF).
- `TRUST_PROXY=loopback` so rate limits key on the visitor's IP.

## Manual steps outstanding
- GitHub OAuth App callback URL → `https://dwl.bighnesh.space/backend/api/v1/github/callback`
- Delete the stray DNS record `dwl.business.space.bighnesh.space`
- Optional: `sudo sysctl vm.overcommit_memory=1` (Redis warning)

## Related
[[Architecture Overview]] · [[Operations]]
