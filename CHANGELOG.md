# Changelog

Notable changes, newest first. From the next release on, the full notes are
generated on [GitHub Releases](https://github.com/bighnesh0007/dwcode/releases)
from merged pull requests; this file keeps the headline summary.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security
- Next.js 16.4.2: patches critical advisories; production audit 11 → 2 low (#60)
- Problem creation and AI generation only write an allowlist of fields — no more
  mass assignment of `_id` or provenance
- The problem page no longer sends hidden test cases to the browser

### Added
- Hidden-test grading behind `GRADE_HIDDEN_TESTS`, and `audit:problems` to check
  every problem's data before turning it on (#62)
- Submitted code in the problem's History tab, with Copy and Load into editor (#66)
- Playground JSON inputs accept DataWeave-style syntax (unquoted keys) (#65)
- Hints when a script calls a function the engine does not have, e.g. `then` (#67)
- Migration 003 for the broken odd/even solution (#61)
- Repository layer for all client data access — phase 1 of the PostgreSQL
  migration (#23)
- Labels, milestones, CodeQL, dependency review, OpenSSF Scorecard, release
  drafter and an `@claude` agent workflow

### Fixed
- Correct answers that are a top-level JSON string were always graded wrong (#12)
- Leaderboard showed "Migrated" instead of names, and scored Expert solves as 0 (#43)
- LinkedIn embeds in blog posts render again (#20)
- CI: dependency audit and Docker jobs had failed on every run since the
  workspace conversion (#60)
- Vercel skipped previews when a PR's latest commit was a merge (#64)
