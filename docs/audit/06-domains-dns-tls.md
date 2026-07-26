# DWCode — Domain, DNS & TLS Plan (Phase 5)

> Apex domain: **`bighnesh.space`**

---

## 1. Principle

Every subdomain must earn its existence. Each one is a certificate to renew, a
DNS record to keep correct, a CORS entry to maintain, and a potential
subdomain-takeover target if it ever dangles. The brief lists ten candidates;
five of them are worth provisioning now, three later, and two should not exist.

A second principle drives the split: **the origin for user-authored content must
not share a registrable domain with the app.** Anything that serves
attacker-influenced bytes belongs on a separate domain entirely, so a bypass of
the sanitiser in [H-1](02-security.md#h-1--stored-xss-via-attribute-injection-in-the-markdown-renderer)
cannot reach an app-origin cookie.

---

## 2. Subdomain map

### Provision now

| Subdomain | Serves | Backed by | Public |
|---|---|---|---|
| `dwcode.bighnesh.space` | The application (Next.js) | Vercel → later Traefik | ✅ |
| `api.bighnesh.space` | Express `/api/v1` + legacy `/api/transform` | Render → later Traefik | ✅ |
| `dev.dwcode.bighnesh.space` | Staging app | dev environment | 🔒 Cloudflare Access |
| `dev-api.bighnesh.space` | Staging API | dev environment | 🔒 Cloudflare Access |
| `status.bighnesh.space` | Uptime page | **Third-party host** | ✅ |

`status` must be hosted **off** the production infrastructure — Better Stack,
Instatus, or a Cloudflare Pages site. A status page that goes down with the thing
it reports on is worse than no status page, because it converts an outage into
silence.

### Provision later

| Subdomain | When | Why not now |
|---|---|---|
| `docs.bighnesh.space` | Documentation exists | Nothing to serve. A `/docs` path on the app is sufficient until content justifies a separate origin. |
| `cdn.bighnesh.space` | User uploads or heavy static assets exist | Vercel's CDN already serves the app's assets. Add only when there is content it does not cover. |
| `dwcodeusercontent.com` | Any user-authored HTML is served directly | **A separate registrable domain, not a subdomain.** Sharing `bighnesh.space` would place untrusted content inside the app's cookie scope. |

### Do not provision

| Subdomain | Reason |
|---|---|
| `playground.bighnesh.space` | The playground is a route in the same Next.js app and shares its session. Splitting it adds CORS complexity and a cross-origin auth problem for zero benefit. Keep `/playground`. |
| `auth.bighnesh.space` | Clerk hosts this. Pointing a subdomain at it means owning a CNAME for a service that already works, and Clerk's own custom-domain feature is the supported path if branding matters. |
| `gateway.bighnesh.space` | The gateway is infrastructure, not a destination. Naming it publicly advertises the topology and creates a bypass target that skips Cloudflare. |
| `monitor.bighnesh.space` | Grafana/Prometheus must not be internet-facing. Reach them over VPN/Tailscale or Cloudflare Access on an internal-only name. |
| `admin.bighnesh.space` | Splitting `/admin` onto its own origin breaks the Clerk session and gains nothing — the real control is server-side `requireAdmin()` plus gateway IP allowlisting on the `/admin` path. |

### Redirects

| From | To | Code |
|---|---|---|
| `bighnesh.space` | personal site, or `dwcode.bighnesh.space` | 301 |
| `www.bighnesh.space` | apex | 301 |
| `www.dwcode.bighnesh.space` | `dwcode.bighnesh.space` | 301 |

---

## 3. DNS records

Cloudflare as authoritative DNS.

```dns
; ── Application ──────────────────────────────────────────────────────
dwcode          CNAME  cname.vercel-dns.com.        ; proxied 🟠
api             CNAME  dwcode-server.onrender.com.  ; proxied 🟠

; After the move to self-hosted Traefik:
; dwcode        A      <origin-ipv4>                ; proxied 🟠
; dwcode        AAAA   <origin-ipv6>                ; proxied 🟠
; api           A      <origin-ipv4>                ; proxied 🟠
; api           AAAA   <origin-ipv6>                ; proxied 🟠

; ── Staging ──────────────────────────────────────────────────────────
dev.dwcode      CNAME  cname.vercel-dns.com.        ; proxied 🟠 + Access
dev-api         CNAME  dwcode-dev.onrender.com.     ; proxied 🟠 + Access

; ── Status (off-infrastructure) ──────────────────────────────────────
status          CNAME  statuspage.betterstack.com.  ; DNS-only ⚪

; ── Apex ─────────────────────────────────────────────────────────────
@               A      192.0.2.1                    ; proxied 🟠 (redirect rule)
www             CNAME  bighnesh.space.              ; proxied 🟠

; ── Email authentication (publish even if no mail is sent) ───────────
@               MX     10 mx.example.com.
@               TXT    "v=spf1 include:_spf.example.com -all"
_dmarc          TXT    "v=DMARC1; p=reject; rua=mailto:dmarc@bighnesh.space; pct=100"
resend._domainkey TXT  "v=DKIM1; k=rsa; p=<public-key>"

; ── Certificate authority pinning ────────────────────────────────────
@               CAA    0 issue "letsencrypt.org"
@               CAA    0 issue "pki.goog"
@               CAA    0 issuewild "letsencrypt.org"
@               CAA    0 iodef "mailto:security@bighnesh.space"
```

**Notes.**

- 🟠 **proxied** everywhere except `status`. Proxying hides origin IPs, absorbs
  DDoS, and enables WAF. `status` stays DNS-only so it survives a Cloudflare
  incident.
- **SPF/DKIM/DMARC now, before any mail is sent.** An unprotected domain gets
  spoofed, and `p=reject` from day one costs nothing. Once notification email
  ships, this is already correct.
- **CAA records** prevent any other CA from issuing for the domain — cheap
  mis-issuance insurance.
- **No wildcard `*.bighnesh.space`.** A wildcard turns every typo and every
  forgotten service into a live host and makes subdomain takeover far easier.
  Enumerate explicitly.

---

## 4. TLS strategy

### Two-hop encryption

```
Browser ──TLS 1.3──▶ Cloudflare ──TLS 1.3 + mTLS──▶ Traefik ──plaintext──▶ services
         (edge cert)              (origin cert,              (private Docker
                                   Authenticated              network only)
                                   Origin Pull)
```

**Edge (browser → Cloudflare)** — Universal SSL, TLS 1.2 minimum (prefer 1.3),
HSTS with preload, Automatic HTTPS Rewrites on, Always Use HTTPS on.

**Origin (Cloudflare → Traefik)** — SSL mode **Full (Strict)**, never Flexible.
Flexible sends plaintext to the origin while showing the user a padlock; it is
worse than no TLS because it is dishonest. Use a Cloudflare Origin CA certificate
(15-year validity) plus **Authenticated Origin Pull**, so the origin rejects any
connection that did not come through Cloudflare — closing the direct-to-origin
bypass that would otherwise skip the WAF.

**Certificates.** Traefik obtains Let's Encrypt certs via ACME. Use **DNS-01**
with the Cloudflare API rather than HTTP-01: it works for hosts that are not
publicly reachable (staging behind Access, internal names) and does not require
port 80 open. Renewal is automatic at 30 days remaining; alert at 21.

```yaml
# traefik/traefik.yml
certificatesResolvers:
  cloudflare:
    acme:
      email: security@bighnesh.space
      storage: /letsencrypt/acme.json
      dnsChallenge:
        provider: cloudflare
        resolvers: ["1.1.1.1:53", "8.8.8.8:53"]
```

### HSTS rollout

Do this in stages — a preload submission is effectively irreversible for months.

1. `max-age=300` for one week; confirm nothing breaks over HTTP
2. `max-age=86400` for one week
3. `max-age=63072000; includeSubDomains` for one month
4. Add `preload` and submit to hstspreload.org

`includeSubDomains` only after **every** subdomain — including `status` and any
future `docs` — serves valid HTTPS. Adding it early breaks anything that does not.

---

## 5. Cloudflare configuration

| Setting | Value | Why |
|---|---|---|
| SSL mode | **Full (Strict)** | Anything less permits plaintext to the origin |
| Min TLS version | 1.2 | 1.0/1.1 are deprecated |
| Always Use HTTPS | On | |
| HSTS | Per §4 rollout | |
| Authenticated Origin Pull | On | Blocks direct-to-origin WAF bypass |
| Bot Fight Mode | On | Free scraper mitigation |
| WAF managed rules | On (OWASP + Cloudflare) | |
| Rate limiting | See below | Edge layer only |
| Cache — `/_next/static/*` | Aggressive, 1 year | Immutable, content-hashed |
| Cache — `/api/*` | **Bypass** | Never cache authenticated JSON |
| Cache — `/problems`, `/blog` | Standard + `stale-while-revalidate` | |
| Brotli | On | |
| Early Hints | On | |
| Email obfuscation | Off | Breaks React hydration |
| Rocket Loader | **Off** | Breaks Monaco and Clerk |
| Auto Minify | **Off** | Next.js already minifies; Cloudflare's pass can corrupt source maps |

### Edge rate limits

| Path | Limit | Action |
|---|---|---|
| `/api/transform`, `/api/execute` | 30/min/IP | Managed challenge |
| `/api/generate*` | 10/min/IP | Block |
| `/api/submissions` | 30/min/IP | Managed challenge |
| `/api/*` (catch-all) | 300/min/IP | Managed challenge |
| `/sign-in`, `/sign-up` | 20/min/IP | Block |

> These are the **outer** layer. They key on IP, which is the wrong dimension for
> a signed-in platform — one office NAT is one IP. Per-user limits keyed on the
> Clerk user id must still live in the application
> ([SEC-13](03-backlog.md#sec-13--rate-limiting-across-the-platform)). The edge
> stops floods; the app stops abuse.

### Cloudflare Access

Protect `dev.dwcode`, `dev-api`, and any internal tooling with Access policies
scoped to a Google Workspace group or an email allowlist. This is stronger than
basic auth and leaves an audit trail.

---

## 6. CORS

`CORS_ALLOWED_ORIGINS` is already read as a CSV by
[server/src/config/env.ts](../../server/src/config/env.ts) and applied as an
allowlist in [v1Cors()](../../server/src/middleware/security.ts) — the mechanism
is correct and just needs the right values per environment.

| Environment | Value |
|---|---|
| local | `http://localhost:8000` |
| dev | `https://dev.dwcode.bighnesh.space` |
| prod | `https://dwcode.bighnesh.space` |

**Never** include `*`, and never reflect the `Origin` header. `credentials` stays
`false` — auth travels as a bearer token, which is exactly why the current
configuration is safe.

The **legacy** router deliberately keeps wide-open CORS
([legacyCors()](../../server/src/middleware/security.ts)) to preserve the frozen
contract. That is a considered decision and should stay, but it means
`/api/transform` needs its rate limiting and body caps to carry the whole load —
see [H-3](02-security.md#h-3--no-rate-limiting-on-any-user-facing-endpoint).

---

## 7. Migration sequence

Moving from Vercel/Render to self-hosted without downtime.

| Step | Action | Rollback |
|---|---|---|
| 1 | Add Cloudflare as authoritative DNS, records proxied, still pointing at Vercel/Render | Revert nameservers |
| 2 | Verify Full (Strict) works against both current origins | Switch SSL mode back |
| 3 | Enable WAF, Bot Fight, edge rate limits — observe for one week | Disable per-feature |
| 4 | Stand up the VPS + Traefik; obtain certs via DNS-01; do **not** cut traffic | None needed |
| 5 | Deploy the app stack to the VPS on internal names; run the full E2E suite against it | None needed |
| 6 | Lower TTL to 60s, wait for propagation | — |
| 7 | Cut `api` first (smaller blast radius, and the legacy contract test proves parity) | Repoint CNAME |
| 8 | Observe 48h | Repoint |
| 9 | Cut `dwcode` | Repoint |
| 10 | Restore TTL to 3600s; enable Authenticated Origin Pull; decommission Render/Vercel | — |

**Cut `api` before `dwcode`.** The API has a frozen, contract-tested surface, so
parity is verifiable before the switch. The frontend has no equivalent guarantee.

---

## 8. Domain hygiene checklist

- [ ] Registrar lock enabled on `bighnesh.space`
- [ ] Registrar account on hardware-key 2FA
- [ ] WHOIS privacy on
- [ ] Auto-renew on, expiry calendar reminder 60 days out
- [ ] CAA records published
- [ ] SPF / DKIM / DMARC published with `p=reject`
- [ ] No wildcard DNS record
- [ ] **Quarterly dangling-CNAME audit** — every CNAME still points at a resource you own
- [ ] `security.txt` at `/.well-known/security.txt` with a contact address
- [ ] Certificate Transparency monitoring enabled (alerts on unexpected issuance)
- [ ] `status` page hosted off the production infrastructure
