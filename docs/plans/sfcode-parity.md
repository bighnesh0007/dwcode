# SFCode → DWCode feature parity

SFCode (`bighnesh0007/SFCode`, live at sf.bighnesh.space) is DWCode's sibling for
Salesforce. This compares the two as of 2026-11-21 (SFCode `e573d95`, DWCode
`4fd01bf`) and plans how to bring every transferable SFCode feature to DWCode,
adapted to DataWeave.

**Legend:** ✅ DWCode has it · 🟡 partial · ❌ missing · ⛔ Salesforce-only (adapted instead)

## 1. Inventory

### Practice

| SFCode | DWCode today | Status |
|---|---|---|
| Problem arena with hidden tests | Problems + workspace, hidden tests behind `GRADE_HIDDEN_TESTS` | ✅ |
| Playground (Apex / SOQL / LWC) | DataWeave playground, multi-file, GitHub import, share links | ✅ |
| **Debugging Arena**: start from broken code | — | ❌ |
| **Interview mode**: random timed set, scorecard, verdict | Workspace has a per-problem timer only | 🟡 |
| **"Explain my error"** in plain English | Rules-based compiler hints (`lib/compilerErrors.ts`) | 🟡 |
| **Progressive hints** (`POST /challenges/:slug/hints/:n`), revealed one at a time | All hints shown at once in the Description tab | 🟡 |
| **Learning tab** per problem (`/challenges/:slug/learning`) | Solution reveal only | ❌ |
| **Code-size ranking** per problem (`/challenges/:slug/size`) | — | ❌ |
| **Per-problem discussion** threads | Comments on problems | ✅ |
| Problem generator | AI generate (`/create`) | ✅ |
| Apex / SOQL / Flow / LWC arenas, org connection | — | ⛔ (DataWeave equivalent is the one arena) |

### Learning

| SFCode | DWCode today | Status |
|---|---|---|
| **Roadmaps**: DAG of steps → problems, lessons, diagrams, quizzes | — | ❌ |
| **Welcome placement quiz** sets your level | Product tour only | ❌ |
| **Weekly plan** sized to hours/week | — | ❌ |
| **Certification prep**: question banks, timed mock exams weighted like the real one, spaced review (Leitner), readiness meter | — | ❌ → MuleSoft **MCD Level 1** / **DataWeave** prep |
| Onboarding gate (role, level, goal) | — | ❌ |

### Engagement

| SFCode | DWCode today | Status |
|---|---|---|
| **Daily Challenge**: one problem for everyone, bonus coins | — | ❌ |
| Streaks with **streak freezes** | Streak shown on profile, no freezes | 🟡 |
| **Achievements** computed from activity | — | ❌ |
| **Points-based ranks** (admin-editable points table) | Rank tiers on avatars | 🟡 |
| **Celebration** on solve / rank-up (`RankWatcher`) | — | ❌ |
| **Notifications** (bell, unread, contest results) | — | ❌ |
| **Email notifications** + preferences | — | ❌ |
| **Announcement banner** (admin-set) | Maintenance banner only | 🟡 |
| Coin store: **slots** (frame, badge, accent, editor, banner), **rarities**, **equip** | Store with skins, no slots/rarity/equip | 🟡 |

### Competition

| SFCode | DWCode today | Status |
|---|---|---|
| Contests with live standings, top-3 coins | Contests, join by code | ✅ |
| **Auto contest calendar** (Weekly Sun, Biweekly Sat) | Manual only | ❌ |
| **Contest rating** (multiplayer Elo) + **rating tiers** | — | ❌ |
| Contest **reminders**, **countdown**, **result notifications** | — | ❌ |
| Leaderboards by **rating**, **team**, **country** | Points leaderboard only | 🟡 |
| **Teams** (create, invite code, listed, leave, remove) | — | ❌ |

### Community

| SFCode | DWCode today | Status |
|---|---|---|
| Blog with comments, votes, moderation (hide) | Blog, votes, comments | 🟡 (no hide/moderation) |
| Profiles: handle URL, streaks, achievements, **skill radar**, **about** | Profiles, heatmap, follow | 🟡 |
| **Activity feed** (`/feed`) | — | ❌ |
| **Contribute**: problem drafts → auto-check → submit → admin review queue; contributor applications | — | ❌ |
| **Contribute certification questions** | — | ❌ |
| **Mentors** (directory, ask) | — | ❌ |
| **Jobs board** | — | ❌ |
| Sponsorship (Razorpay) | ✅ (DWCode only) | — |

### Platform and admin

| SFCode | DWCode today | Status |
|---|---|---|
| **⌘K search palette** | Global search | ✅ |
| **Signed-in home dashboard**: live stats, contest countdown, rank ladder, live demo, FAQ | Home with stats + heatmap | 🟡 |
| **PWA**: service worker, `/offline` page | — | ❌ |
| **Telemetry**: client errors, CSP reports, page views → admin error inbox with resolve | — | ❌ |
| Admin: **analytics**, **audit log**, **moderation**, **user suspension**, **review queues**, **points table**, **store editor**, **email test**, **announcements** | Admin problems, users, roles | 🟡 |
| **Privacy** and **Terms** pages | — | ❌ |
| **JSON-LD** structured data for SEO | Sitemap only | 🟡 |
| Changelog page | ✅ (DWCode only) | — |

## 2. Missing from DWCode, by priority

1. Daily Challenge (with bonus coins) and streak freezes
2. Achievements, points-based ranks with an editable points table, celebrations
3. Notifications: in-app bell, then email with preferences
4. Interview mode with scorecard and verdict
5. Debugging Arena: broken DataWeave scripts to fix
6. Progressive hints, a Learning tab, code-size ranking per problem
7. AI "Explain my error" on top of the existing rules-based hints
8. Contest calendar (auto Weekly/Biweekly), Elo rating + tiers, reminders, countdown
9. Rating, team and country leaderboards; Teams
10. Roadmaps with placement quiz, lessons, diagrams, quizzes and a weekly plan
11. Certification prep for **MuleSoft Certified Developer – Level 1**: banks, mock exams, spaced review, readiness
12. Contribute flow: problem drafts auto-checked against the compiler, review queue, contributor applications
13. Store slots, rarities and equip
14. Profiles: about, skill radar (by DataWeave topic), achievements, activity feed
15. Admin: analytics, audit log, moderation, suspension, review queues, announcements, store editor
16. Telemetry and an admin error inbox
17. PWA (service worker, offline page), Privacy/Terms, JSON-LD
18. Mentors and a jobs board

## 3. Plan

Each phase is one or more PRs through the normal gate. Content features
(roadmaps, certification, problems) are JSON in the repo so contributors can
add to them by PR, as in SFCode.

### Phase A — Engagement core ✅ (biggest retention win, least new content)

Shipped: daily challenge (`GET /api/v1/daily`, +15 coins on its day), streaks
with store-bought freezes, achievements (`GET /api/v1/engagement/me`), solve
celebrations, notifications (follower, blog comment, daily bonus, achievement)
and the admin announcement banner. Ranks were already score-based in
`@dwcode/shared`; the editable points table is deferred to Phase F's admin work.
- Daily Challenge: deterministic pick per UTC day, bonus coins on first solve, home card
- Streaks: current/longest computed on read, earned freezes
- Achievements: pure functions over solves and activity (nothing to backfill)
- Ranks from points with an admin-editable points table; celebration on solve and rank-up
- In-app notifications (bell, unread count); announcement banner set from admin

### Phase B — Practice modes ✅
- Interview mode: random timed set by difficulty, scorecard, verdict; infrastructure errors don't count against the learner
- Debugging Arena: problems that start from a broken script, tagged by bug type (selector, `null`, type coercion, `reduce`, precedence like #54)
- Progressive hints (reveal one at a time, optional coin cost), Learning tab (concept + docs links), code-size ranking (comments and whitespace stripped)
- "Explain my error": AI explanation, used when the rules in `lib/compilerErrors.ts` don't match

### Phase C — Competition ✅
- Contest calendar: Weekly (Sun) and Biweekly (Sat), auto-created with problem picks
- Multiplayer Elo rating (start 1500, K-bounded), rating history, tiers
- Reminders and result notifications, countdown banner
- Teams (create, invite code, listed/unlisted), team and country leaderboards

### Phase D — Learning paths
- Roadmaps (Beginner, Integration Developer, Interview prep) as a DAG of steps → problems, lessons, diagrams, quizzes
- Welcome placement quiz (three tiers) and onboarding gate (role, level, goal, hours/week)
- Weekly plan sized to the hours chosen
- MCD Level 1 prep: question bank with explanations, timed mock weighted by exam section, Leitner spaced review, readiness meter
  - Questions must be original, not copied from MuleSoft exams

### Phase E — Community and contribution
- Contribute: drafts, an automatic check that runs the solution through the compiler and generates `expectedOutput` (never hand-written, per CLAUDE.md), submit, admin review queue, contributor applications
- Certification-question contributions
- Profiles: about section, skill radar by DataWeave topic, achievements, activity feed
- Store: slots (frame, badge, accent, editor theme, banner), rarities, equip
- Mentors directory, jobs board

### Phase F — Platform and admin
- Admin: analytics, audit log, moderation (blog/comment hide), user suspension, review queues, store editor, email test
- Telemetry (client errors, CSP, page views) with an admin error inbox
- Email notifications with per-user preferences
- PWA: service worker and offline page; Privacy and Terms pages; JSON-LD
- Signed-in home dashboard: live stats, contest countdown, rank ladder, FAQ

### Not carried over (Salesforce-only)
Org connection (OAuth/PKCE, pasted token), check-only deploy grading, Apex/SOQL/Flow/LWC
arenas and playgrounds, anonymous Apex. DataWeave grading already runs on the compiler service.
