# Governance

## Roles

- **Maintainer** — [@bighnesh0007](https://github.com/bighnesh0007). Owns the
  roadmap, reviews and merges pull requests, cuts releases, and handles security
  reports. Listed in [`.github/CODEOWNERS`](.github/CODEOWNERS).
- **Contributors** — anyone who opens an issue, a discussion or a pull request.
- **Collaborators** — contributors given triage or write access after sustained,
  high-quality contributions. They may label, triage and review.

## How decisions are made

- **Day-to-day changes** are decided in the pull request: one maintainer approval
  and green CI.
- **Larger changes** — a new dependency, a schema or API change, anything labelled
  `breaking-change` or `migration` — start as an issue or discussion so the
  approach is agreed before code is written. Architectural decisions are recorded
  as ADRs in [`docs/vault/Decisions/`](docs/vault/Decisions.md).
- **Roadmap** — milestones in [`.github/milestones.yml`](.github/milestones.yml),
  summarised in [ROADMAP.md](ROADMAP.md).

## Releases

Every merge to `master` updates a draft release (`release-drafter.yml`). A
maintainer publishes it with a semantic version: `breaking-change` → major,
`enhancement`/`migration` → minor, everything else → patch.

## Conduct

Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md). Maintainers enforce it.
