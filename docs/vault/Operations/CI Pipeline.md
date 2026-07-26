---
tags: [ops, ci]
---
# CI Pipeline

`.github/workflows/main.yml` — six jobs, all required by the master ruleset.

| Job | Gates |
|---|---|
| Frontend · client | typecheck, lint, test, `next build` |
| Backend · server | typecheck, lint, test, build |
| Secret hygiene | tracked env files, credential patterns |
| Dependency audit | `scripts/audit-gate.mjs` |
| Docker image builds | image builds **and** its Node major satisfies `engines` |
| Detect changed areas | paths filter |

## Two lessons baked in

**A check that cannot fail is worse than no check.** The first version of the
credential scanner used a backslash-continued regex; the literal backslash made
`git grep` die with `fatal: Trailing backslash`, and the enclosing `if` read that
failure as "nothing found". Green job, zero scanning. It now **self-tests
against a known token shape** before trusting a clean result.

**Unfixable advisories expire.** `audit-gate.mjs` lets an advisory be accepted
only with a written justification *and* an expiry date, so CI fails again later
and forces a re-review instead of ignoring it forever. See
[[W1-R8 Dependency CVEs]].

## Ruleset on master

No deletion, no force-push (**no bypass**), PR required, all six checks, strict.
Repo admin may bypass the PR requirement.

## Related
[[Operations]] · [[W1-R8 Dependency CVEs]] · [[Deployment]]
