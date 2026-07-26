# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting:
**[Report a vulnerability](https://github.com/bighnesh0007/dwcode/security/advisories/new)**

*(Enable it once at Settings → Code security → Private vulnerability reporting.)*

Helpful to include: what you found, how to reproduce it, what an attacker could
do with it, and the commit or URL you tested. A proof of concept is welcome; a
working exploit against other people's data is not.

**Please don't:** test against other users' accounts or data, run automated
scanners against the live site, or attempt denial of service. A local checkout
is the right place to prove a finding.

You'll get an acknowledgement within a few days. This is a community project
maintained in spare time — there is no paid bounty, but real findings are
credited in the release notes unless you'd rather stay anonymous.

## Supported versions

Only the deployed `master` branch. There are no maintained release branches.

## Scope

| In scope | Out of scope |
|---|---|
| This repository's code | The DataWeave compiler upstream (third-party, not ours) |
| `dwcode.vercel.app` and the API it calls | Clerk, MongoDB Atlas, Vercel, Render, Google Gemini |
| Auth, authorisation, data exposure, injection, XSS | Findings that require a compromised device or account |
| Anything that lets one user affect another's data or ranking | Missing headers with no demonstrated impact |

## Known state

This project has been through a documented security audit; the findings, their
status and the remaining work are public in
**[`docs/audit/`](docs/audit/)**.

Being open about that is deliberate. Two things follow from it:

- Issues already listed there are **known** — a report is still useful if you
  can show impact beyond what is documented.
- Several are **fixed but not yet fully hardened**, and each says so explicitly.
  If you find a bypass of a fix, that is very much worth reporting.

Two areas worth knowing about before you test:

- **The DataWeave execution runtime is a third-party service** not owned by this
  project ([`docs/audit/09-runtime-ownership.md`](docs/audit/09-runtime-ownership.md)).
  Please don't attack it — it isn't ours to authorise testing against.
- **`docs/audit/02-security.md` lists unfixed items** with severities. Those are
  acknowledged, not undiscovered.

## What we ask of ourselves

- Secrets never enter the repository. CI scans every push for credential
  patterns and fails the build on a match.
- Dependencies are audited in CI; unfixable advisories require a written
  justification with an **expiry date**, so they get re-reviewed rather than
  ignored forever ([`scripts/audit-gate.mjs`](scripts/audit-gate.mjs)).
- Security fixes get a regression test, so a fix cannot silently be undone.
