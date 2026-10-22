# Runbook — GitHub repository settings

Everything that makes this repository "fully set up" but **cannot live in git**:
these are toggles in the GitHub UI. The files in `.github/` assume they are on.

Work top to bottom; each step says where it is and why it matters. Tick them off
in a PR description or an issue so the state is recorded.

---

## 1. Security (Settings → Advanced Security)

| Setting | Value | Why |
|---|---|---|
| Private vulnerability reporting | **Enable** | `SECURITY.md` and the issue chooser link to it |
| Dependency graph | **Enable** | Required by Dependabot and `dependency-review` |
| Dependabot alerts | **Enable** | Alerts on known-vulnerable dependencies |
| Dependabot security updates | **Enable** | Auto-PRs for vulnerable dependencies (versions PRs come from `dependabot.yml`) |
| Grouped security updates | **Enable** | One PR per ecosystem instead of one per package |
| Code scanning → CodeQL | **Leave "default setup" OFF** | `.github/workflows/codeql.yml` is advanced setup; both together makes uploads fail |
| Secret scanning | **Enable** | Finds committed credentials across all history |
| Push protection | **Enable** | Blocks a push that contains a credential — complements the CI secret scan |
| Copilot Autofix | Optional | Suggests fixes for code-scanning alerts |

## 2. Branch protection (Settings → Rules → Rulesets → New branch ruleset)

Create one ruleset named **master**, target `master`, enforcement **Active**:

- **Restrict deletions** and **Block force pushes**
- **Require a pull request before merging** — 1 approval; dismiss stale approvals
  on push; require conversation resolution
- **Require status checks to pass** — strict (branch must be up to date), with:
  - `Frontend · client`
  - `Backend · server`
  - `Secret hygiene`
  - `Dependency audit`
  - `Docker image builds`
  - `Analyze (javascript-typescript)`
  - `Dependency review`
  - `Conventional PR title`
- **Require linear history** — only if you switch to squash merging (below)
- Bypass list: repository admin, so you can still merge an emergency fix

> A check only appears in the picker after it has run once. Open any PR after
> merging the workflows, then come back and add them.

## 3. Pull requests (Settings → General → Pull Requests)

- **Allow squash merging** — default message: *Pull request title and description*
  (titles are Conventional Commits, enforced by `pr-checks.yml`)
- Disable merge commits and rebase merging once everyone is used to squash
- **Always suggest updating pull request branches**
- **Allow auto-merge** — lets green Dependabot PRs merge themselves
- **Automatically delete head branches**

## 4. Actions (Settings → Actions → General)

- Workflow permissions: **Read repository contents** (workflows request more per job)
- **Allow GitHub Actions to create and approve pull requests**: off
- Fork PR workflows from outside collaborators: **Require approval for first-time contributors**

## 5. Features (Settings → General → Features)

- **Issues**: on
- **Discussions**: **enable** — the issue chooser already links to it. Create
  categories *Q&A* (answerable), *Ideas*, *Show and tell*, *Announcements*
  (maintainers only)
- **Projects**: on (see §8)
- **Wiki**: off — docs live in `docs/`, where they are reviewed like code
- **Sponsorships**: on — `.github/FUNDING.yml` is ready once GitHub Sponsors is approved

## 6. About panel (repository home → ⚙ next to About)

- Description: *A LeetCode-style practice platform for MuleSoft DataWeave*
- Website: `https://dwcode.vercel.app`
- Topics: `dataweave` `mulesoft` `nextjs` `typescript` `education` `coding-practice`
  `open-source` `hacktoberfest`
- Settings → General → **Social preview**: upload a 1280×640 image

## 7. Labels and milestones

Run **Actions → Repo sync → Run workflow** once after merging. It creates every
label in `.github/labels.yml` and every milestone in `.github/milestones.yml`,
and files the open issues into their milestones. Afterwards it re-runs on its own
whenever those files change. Delete GitHub's unused defaults by hand if you like;
the workflow never deletes anything.

## 8. Project board (Projects → New project → Board)

GitHub Projects can't be created by the built-in Actions token, so create it once:

1. New project → **Board**, name it **DWCode roadmap**, link it to this repository
2. Columns: *Triage* · *Ready* · *In progress* · *In review* · *Done*
3. Add fields: **Priority** (P0–P3), **Milestone**, **Area**
4. Workflows (project ⋯ → Workflows): *Item added → Triage*, *PR merged → Done*,
   *Item closed → Done*; enable **Auto-add** for `is:issue is:open repo:bighnesh0007/dwcode`
5. Save a **Table** view grouped by Milestone — this is the migration tracker

## 9. Agents

- **Claude**: install the Claude GitHub app (`https://github.com/apps/claude`) on
  this repository and add an `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`)
  repository secret. Then `@claude` in an issue or PR comment runs
  `.github/workflows/claude.yml`. Only owners/members/collaborators can trigger it.
- **Copilot coding agent** (if you use it): it reads
  `.github/copilot-instructions.md`, which points at the same rules as `CLAUDE.md`.

## 10. Insights to check monthly

- **Insights → Community standards** — should be all green after this setup
- **Security → Overview** — open code-scanning, Dependabot and secret alerts
- **OpenSSF Scorecard** — `https://scorecard.dev/viewer/?uri=github.com/bighnesh0007/dwcode`
- **Insights → Traffic / Contributors / Dependency graph**
