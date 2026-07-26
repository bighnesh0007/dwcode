# DWCode — Environments, Gateway & DataWeave Runtime (Phases 4 & 7)

> Covers the local / development / production environment architecture, the
> gateway technology decision, and a review of the code-execution runtime.

---

## 1. Where deployment stands today

| Component | Platform | Config | State |
|---|---|---|---|
| `client/` | Vercel | [client/vercel.json](../../client/vercel.json) | ✅ Working. `ignoreCommand` skips no-op rebuilds; three baseline headers set. |
| `server/` | Render (free) | [render.yaml](../../render.yaml) | ✅ Working. Node pinned to 22, secrets `sync: false`, health check correctly on `/health` not `/healthcheck`. |
| MongoDB | Atlas (assumed) | — | ⚠️ Not declared anywhere in the repo. |
| DataWeave compiler | Two external Render services | — | 🔴 Not owned, not pinned, not in this repository. |
| Redis | — | — | 🔴 Does not exist. Blocks distributed rate limiting and caching. |
| Gateway | — | — | 🔴 Does not exist. |
| Staging | — | — | 🔴 Does not exist. `master` deploys straight to production. |
| Monitoring | Vercel Speed Insights only | — | 🔴 No metrics, traces, alerts, or uptime checks. |

### Problems with the current topology

1. **No staging.** A push to `master` deploys to production on both platforms
   simultaneously. There is nowhere to verify a change against real
   infrastructure before users see it.
2. **No single ingress.** Vercel and Render each terminate their own TLS with
   their own defaults. There is no shared place to enforce rate limits, WAF
   rules, IP policy, or request logging — which is a large part of why
   [H-3](02-security.md#h-3--no-rate-limiting-on-any-user-facing-endpoint) exists.
3. **Free-tier Render cold starts.** The instance sleeps after 15 minutes idle
   and takes 30–60s to wake. `DW_TIMEOUT_MS` is 15,000. **First request after
   idle reliably fails.** This is a live user-facing defect, not a theoretical one.
4. **Environment config is duplicated by hand** across `client/.env.local`,
   `server/.env`, the Vercel dashboard, and `render.yaml`. `MONGODB_URI`,
   `CLERK_SECRET_KEY` and `SUPER_ADMIN_USER_ID` are each maintained in at least
   three places with no drift detection.
5. **The execution sandbox is a third-party URL.** See §7 — this is the single
   largest infrastructure risk in the platform.

---

## 2. Target environments

Three environments, each fully isolated: separate databases, separate Clerk
instances, separate API keys, separate DataWeave runtimes.

### 2.1 Local

Everything on the developer machine, one command to start.

```
docker-compose up          # mongo · redis · dataweave-runtime · mailpit
npm run dev                # client :8000 · server :4000  (concurrently)
```

```yaml
# docker-compose.yml — target state
services:
  mongodb:
    image: mongo:8.0                       # pinned, not :latest
    ports: ["127.0.0.1:27017:27017"]       # loopback only  (fixes H-7)
    environment:
      MONGO_INITDB_ROOT_USERNAME: dwcode
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD:?required}
    volumes: [mongodb_data:/data/db]
    healthcheck:
      test: ["CMD","mongosh","--quiet","--eval","db.adminCommand('ping')"]
      interval: 10s

  redis:
    image: redis:7.4-alpine
    ports: ["127.0.0.1:6379:6379"]
    command: redis-server --requirepass ${REDIS_PASSWORD:?required}

  dataweave-runtime:                        # see §7 — must be brought in-repo
    build: ./runtime
    ports: ["127.0.0.1:3001:3000"]
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 128
    mem_limit: 512m
    cpus: 1.0

  mailpit:                                  # local email capture, for later notifications
    image: axllent/mailpit
    ports: ["127.0.0.1:8025:8025"]

volumes: { mongodb_data: }
```

**Local ≠ production, deliberately:** no gateway, no TLS, Clerk in test mode,
Gemini/GitHub/Razorpay all optional. The server's capability gating in
[config/env.ts](../../server/src/config/env.ts) already handles absent
integrations correctly — a developer without a Gemini key still gets a working
app with AI disabled and a clear warning at boot. That design should be extended
to the client (REF-07).

### 2.2 Development / staging

A hosted mirror of production at one-tenth the size. Deployed from `develop`.

```
dev.dwcode.bighnesh.space   →  gateway  →  next.js  →  express  →  mongo-dev
                                                    →  dataweave-runtime-dev
```

- MongoDB Atlas **M0/M10, separate cluster** — never a production replica
- Seeded with synthetic data (`scripts/seed-dev.ts`), never a production dump
- Clerk development instance
- Real but rate-capped third-party keys
- Basic-auth or Cloudflare Access in front of the whole environment
- **`robots.txt: Disallow: /`** and `X-Robots-Tag: noindex` — a staging site
  indexed by Google is an SEO and disclosure incident

### 2.3 Production

On-premise, per the brief.

```
                      Internet
                         │
                 ┌───────▼────────┐
                 │   Cloudflare   │  DNS · DDoS · WAF · TLS(edge) · CDN · Bot Fight
                 └───────┬────────┘
                         │  Authenticated Origin Pull (mTLS)
                 ┌───────▼────────┐
                 │    Traefik     │  TLS(origin) · routing · rate limit · headers
                 │   (gateway)    │  IP allowlist (/admin) · compression · access log
                 └───┬────────┬───┘
          ┌──────────┘        └──────────┐
   ┌──────▼──────┐              ┌────────▼────────┐
   │  Next.js    │              │   Express API   │
   │  ×2 (HA)    │─────────────▶│      ×2 (HA)    │
   └──────┬──────┘              └────┬───────┬────┘
          │                          │       │
          │        ┌─────────────────┘       └──────────┐
          │        │                                    │
   ┌──────▼────────▼──────┐  ┌──────────────┐  ┌────────▼──────────────┐
   │  MongoDB replica set │  │  Redis       │  │  DataWeave runtime    │
   │  (3 nodes)           │  │  (limits,    │  │  pool ×N              │
   │                      │  │   cache,     │  │  gVisor · no network  │
   └──────────────────────┘  │   queues)    │  │  cgroup-capped        │
                             └──────────────┘  └───────────────────────┘
                    ┌────────────────────────────────┐
                    │ Prometheus · Grafana · Loki    │
                    │ Uptime Kuma · Alertmanager     │
                    └────────────────────────────────┘
```

**Non-negotiables for the production tier:**
- Every service in its own Docker network; only the gateway is internet-facing
- The DataWeave runtime pool on an **isolated network with no egress** (§7)
- MongoDB as a 3-node replica set with auth, TLS, and per-service least-privilege users
- Automated nightly backups with **a restore drill that is actually performed** (OPS-11)
- Secrets from a manager (Doppler/Infisical/Vault), never from `.env` on the host

---

## 3. Gateway: which technology

The brief asks for a justified choice between NGINX, Traefik, Caddy and Envoy.

### Requirements

TLS termination · rate limiting · auth policies · IP filtering · CORS ·
compression · reverse proxy · load balancing · API version routing ·
request logging · health checks.

### Comparison

| | **NGINX** | **Traefik** | **Caddy** | **Envoy** |
|---|---|---|---|---|
| Config model | imperative files, reload | declarative + Docker label discovery | minimal Caddyfile | xDS control plane |
| Automatic TLS | ✗ (certbot bolt-on) | ✅ built-in ACME | ✅ built-in ACME | ✗ (needs control plane) |
| Service discovery | ✗ static | ✅ native Docker/K8s | ✗ static | ✅ via xDS |
| Rate limiting | ✅ mature | ✅ middleware | ⚠️ plugin | ✅ very capable |
| Observability | basic (`stub_status`) | ✅ Prometheus native | basic | ✅ best-in-class |
| Learning curve | medium | low–medium | lowest | **high** |
| Ops burden at this scale | medium | **low** | low | **high** |
| Right for | max-throughput static/proxy | container platforms | simple sites | service mesh |

### Recommendation: **Traefik v3**

**Reasoning.**

1. **Docker-native discovery matches the deployment model.** Services are
   labelled and Traefik routes them; there is no separate config file to keep in
   sync with `docker-compose`. When the DataWeave runtime pool scales to N
   replicas (§7), Traefik picks them up with no gateway change.
2. **Automatic ACME certificates** for `bighnesh.space` and every subdomain,
   including DNS-01 for wildcards. NGINX needs certbot plus renewal cron plus
   reload hooks — three more things to break at 3am.
3. **Every required capability is a first-class middleware:** `rateLimit`,
   `ipAllowList`, `headers`, `compress`, `basicAuth`, `forwardAuth`,
   `stripPrefix`, `circuitBreaker`, `retry`. Composable per-router, so `/admin`
   can carry IP allowlisting that `/api` does not.
4. **Prometheus metrics are built in** — per-router latency, status codes, and
   retry counts arrive without an exporter sidecar. Given the platform currently
   has no observability at all, "monitoring included" carries real weight.
5. **`forwardAuth` gives a clean path to gateway-level authentication** later:
   the gateway can call a Clerk-verifying endpoint and reject before traffic ever
   reaches an application container.

**Why not the others.**

- **NGINX** is faster at raw static throughput and is the safe default, but that
  advantage is irrelevant here — this workload is dominated by DataWeave
  compilation (hundreds of ms), not by proxy overhead (microseconds). The cost is
  manual TLS, manual upstream lists, and reload-based config changes.
- **Caddy** is the most pleasant to configure and would be a fine choice for a
  simpler topology. It loses on service discovery and on rate-limiting maturity
  (a third-party plugin), and this platform's core need is *bounding abuse*.
- **Envoy** is the most capable and the wrong tool at this scale. An xDS control
  plane for two application services and a runtime pool is operational cost with
  no matching benefit. Revisit only if DWCode moves to Kubernetes with a service
  mesh.

**Cloudflare sits in front regardless.** Traefik handles origin concerns —
routing, per-route policy, origin TLS. Cloudflare handles edge concerns — DDoS
absorption, WAF, bot management, global CDN. They are complements, not
alternatives; see [06-domains-dns-tls.md](06-domains-dns-tls.md).

### Sketch

```yaml
# gateway/traefik/dynamic.yml
http:
  middlewares:
    secure-headers:
      headers:
        stsSeconds: 63072000
        stsIncludeSubdomains: true
        stsPreload: true
        contentTypeNosniff: true
        frameDeny: true
        referrerPolicy: strict-origin-when-cross-origin
        permissionsPolicy: "geolocation=(), microphone=(), camera=()"

    rate-api:      { rateLimit: { average: 100, burst: 50,  period: 1m } }
    rate-compile:  { rateLimit: { average: 20,  burst: 10,  period: 1m } }   # DataWeave is expensive
    rate-auth:     { rateLimit: { average: 10,  burst: 5,   period: 1m } }

    admin-allowlist:
      ipAllowList:
        sourceRange: ["203.0.113.0/24"]      # office / VPN egress only

    compress: { compress: {} }
```

> Gateway rate limits are **defence in depth, not the primary control.** They key
> on IP, which is the wrong dimension for a signed-in platform. Per-user limits
> must still live in the application (SEC-13) where the identity is known.

---

## 4. Configuration management

Current state: the same secret is maintained by hand in up to four places.

**Target:** one source of truth per environment in a secrets manager
(Doppler or Infisical — both have free tiers and native Vercel/Render/Docker
integrations), injected at deploy time.

| Variable | local | dev | prod |
|---|---|---|---|
| `NODE_ENV` | development | production | production |
| `MONGODB_URI` | local docker | Atlas dev cluster | replica set, TLS, scoped user |
| `CLERK_SECRET_KEY` | test instance | dev instance | production instance |
| `DW_COMPILER_URL` | `http://localhost:3001` | dev runtime | internal runtime pool |
| `REDIS_URL` | local docker | managed | internal |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:8000` | `https://dev.dwcode…` | `https://dwcode.bighnesh.space` |
| `TRUST_PROXY` | false | true | true |
| `LOG_LEVEL` / `LOG_PRETTY` | debug / true | info / false | info / false |
| `WEEKLY_CONTEST_ENABLED` | false | true | true |

**Rules.** No production secret ever on a developer machine. Rotation is
scheduled and documented (DOC-03). Startup validation is fail-fast — extend
[server/src/config/env.ts](../../server/src/config/env.ts)'s pattern to the
client (REF-07), so a misconfigured deploy dies at boot with every problem listed
rather than 500ing on first request.

---

## 5. Deployment pipeline

```
feature branch ──PR──► CI (lint · typecheck · unit · integration · security · build)
                        │
                        ▼ merge to develop
                    deploy → dev environment → smoke tests → E2E
                        │
                        ▼ merge to master (tagged release)
                    deploy → production (blue/green) → smoke tests
                        │
                        ▼ automatic rollback if smoke tests fail
```

Blue/green: bring up the new colour, wait for `/api/ready` on every container,
shift Traefik's weighted router, hold the old colour for 30 minutes, then retire.
Migrations run **before** the new colour starts and must be
backwards-compatible so the old colour keeps working during the window.

---

## 6. Observability

Currently: Vercel Speed Insights, and nothing else.

| Layer | Tool | First things to instrument |
|---|---|---|
| Metrics | Prometheus + Grafana | request rate/latency/errors per route · DataWeave compile duration and failure rate · Mongo pool saturation · rate-limit rejections · coin awards per minute (fraud signal) |
| Logs | Loki + Promtail | pino JSON from both services, correlated by request id (REF-08) |
| Traces | OpenTelemetry + Tempo | browser → Next.js → Express → Mongo/compiler |
| Uptime | Uptime Kuma | `/api/health`, `/health`, `/healthcheck`, compiler reachability |
| Errors | Sentry | client and server exceptions with release tagging |
| Alerts | Alertmanager | 5xx > 1% for 5m · p95 > 2s · compiler down · Mongo primary lost · disk > 80% · **coin awards spike** |

That last alert is deliberate: given [C-4](02-security.md#c-4--client-side-grading--the-achievement-economy-is-forgeable),
an abnormal award rate is the earliest signal that the economy is being farmed.

---

## 7. DataWeave runtime

### 7.1 The finding

**The runtime is not in this repository, and it is not owned by this project.**

Phase 7 asks for a review of security, isolation, resource limits, execution
timeout, memory/CPU caps, network restrictions, logging, cleanup, container reuse
and scalability. **None of those can be assessed**, because the component that
would implement them is a third-party URL:

| Consumer | Target |
|---|---|
| [client/lib/config.ts](../../client/lib/config.ts) | `https://dwlbackend.onrender.com` |
| [server/src/config/env.ts](../../server/src/config/env.ts) | `https://dataweave-playground-h1p7.onrender.com/api/transform` |

Two different upstreams. Both Render free-tier. Neither version-pinned. No
Dockerfile, compose service, or source for either exists in the repo, and the
README's instruction to "start the companion Docker container" points at nothing
checked in.

**This is the largest infrastructure risk on the platform**, and it is
structurally worse than any single finding in
[02-security.md](02-security.md): the component that executes untrusted
user-supplied code is outside the security boundary entirely. Whatever isolation
it has — or does not have — is unknown and unverifiable.

### 7.2 Consequences today

| Risk | Detail |
|---|---|
| **Unknown isolation** | Untrusted DataWeave executes somewhere with unknown sandboxing. DataWeave can read files and open network connections depending on runtime configuration. |
| **Availability** | Free-tier Render sleeps after 15 min idle; 30–60s cold start against a 15s timeout means the first request after a quiet period **fails by design**. |
| **No version pinning** | The DataWeave version can change under the platform. Problems whose expected output depends on version behaviour break silently, and every affected user sees a wrong verdict. |
| **Confidentiality** | Every script and payload — including anything a user pastes from work — is sent to a third party. For a MuleSoft audience this may include real integration payloads. There is no data-processing agreement. |
| **No quota** | Combined with unauthenticated proxies ([M-4](02-security.md#m-4--unauthenticated-compiler-proxies)), anyone can consume the capacity. |
| **Single point of failure** | Every core feature — playground, run, submit, grade, contest — depends on one unmanaged instance. |

### 7.3 Target design

Bring the runtime in-repo (**OPS-07**, XL, ~8 days) and treat it as the hostile
boundary it is.

```
runtime/
├── Dockerfile              # DataWeave CLI on a minimal base
├── server.js               # thin HTTP wrapper: POST /transform
├── seccomp.json            # syscall allowlist
└── README.md               # version pinning + upgrade procedure
```

**Container hardening**

```yaml
dataweave-runtime:
  build: ./runtime
  read_only: true                              # immutable rootfs
  tmpfs: [/tmp:size=64m,noexec,nosuid,nodev]   # only writable path
  cap_drop: [ALL]                              # no capabilities
  security_opt:
    - no-new-privileges:true
    - seccomp:./runtime/seccomp.json
  pids_limit: 128                              # fork-bomb bound
  mem_limit: 512m
  memswap_limit: 512m                          # no swap escape
  cpus: 1.0
  ulimits:
    nofile: { soft: 256, hard: 512 }
    fsize:  1048576                            # 1 MB write cap
  user: "10001:10001"                          # non-root
  networks: [runtime-isolated]                 # internal: true — NO EGRESS
  restart: unless-stopped
```

**Why no egress matters most.** A DataWeave script that can open a socket can
exfiltrate whatever it reaches and can be used to pivot into the internal
network. `internal: true` on the Docker network removes that entire class of
attack in one line. It also blocks SSRF from inside the sandbox — which is the
only SSRF vector the platform would otherwise have.

**Consider gVisor (`runsc`) as the runtime** for a second isolation layer. It
intercepts syscalls in userspace, so a kernel-level container escape needs to
defeat gVisor first. The cost is roughly 10–15% CPU overhead — acceptable for a
workload already dominated by JVM startup.

**Execution policy**

| Control | Value | Enforced at |
|---|---|---|
| Per-script timeout | 10s | runtime wrapper (hard kill) |
| Request timeout | 15s | `DW_TIMEOUT_MS`, client side |
| Total grading budget | 25s | `LIMITS.grading.totalBudgetMs` |
| Max tests per submission | 24 | `LIMITS.grading.maxTests` |
| Concurrency per submission | 3 | `LIMITS.grading.concurrency` |
| Max script size | 50 KB | `LIMITS.playground.maxScriptLength` |
| Max input size | 100 KB × 12 | `LIMITS.playground` |
| Max output size | 1 MB | runtime wrapper (truncate) |

Every one of these constants **already exists** in
[server/src/config/constants.ts](../../server/src/config/constants.ts) and is
currently applied to nothing. The policy was designed; only the enforcement point
is missing.

**Container reuse.** A pool of long-lived warm containers behind Traefik, not
one container per request — JVM startup is 2–5s and would dominate latency.
Reuse means state can leak between executions, so: recycle a container after N
executions (start at 100), health-check on return to the pool, hard-recycle on
any timeout or OOM, and clear `/tmp` between runs. The JVM's own isolation is
not sufficient on its own; recycling bounds the blast radius.

**Scaling.** Horizontal, `N = ceil(peak_concurrent_compiles / 4)`, with a queue
in front (OPS-06) so bursts wait rather than being dropped. Contest starts are
the predictable spike — pre-warm before the scheduled Saturday 15:00 UTC window
that [weeklyContest.service.ts](../../server/src/services/contest/weeklyContest.service.ts)
already knows about.

**Logging.** Structured, per-execution: script hash (not the script), input
sizes, duration, exit status, memory peak. **Never log script or payload
content** — see [H-6](02-security.md#h-6--verbose-error-messages-returned-to-clients),
where the current transform route logs user scripts to stdout.

### 7.4 Migration path

| Step | Work | Risk |
|---|---|---|
| 1 | Build `runtime/` locally with a pinned DataWeave version; verify byte-identical output against the current upstream on a fixture corpus | low |
| 2 | Deploy alongside the existing service; **shadow-run** every production request against both and diff the outputs | low — read-only |
| 3 | Cut `DW_COMPILER_URL` to the new runtime for staging | low |
| 4 | Cut production; keep the third party as fallback for one week | medium |
| 5 | Remove the fallback; consolidate the two divergent upstream URLs into one | low |

The frozen legacy contract makes this safer than it would otherwise be: the
existing [contract test](../../server/tests/integration/legacy-transform.contract.test.ts)
already pins the response shape, so step 1 has a ready-made acceptance criterion.

---

## 8. Cost estimate

| Item | Monthly |
|---|---|
| VPS — 8 vCPU / 16 GB (app + runtime pool) | $40–80 |
| MongoDB Atlas M10 (or self-hosted replica set) | $60 / $0 |
| Redis (Upstash or self-hosted) | $10 / $0 |
| Cloudflare Pro (WAF, bot management) | $20 |
| Backups (object storage) | $5 |
| Sentry / Grafana Cloud (free tiers viable early) | $0–30 |
| **Total** | **~$135–215** |

Self-hosting Mongo and Redis on the same VPS brings this to roughly **$65/month**
at the cost of operating the replica set yourself. Given the on-premise
requirement in the brief, that is the likely starting point — but do not run a
single-node MongoDB in production. Three nodes or a managed cluster; there is no
acceptable third option once real user progress is stored.
