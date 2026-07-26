/**
 * Changelog data — edit this file to update the Pipeline / Changelog page.
 *
 * STATUS VALUES:
 *   "shipped"    → released, live in production
 *   "in-progress"→ actively being built right now
 *   "planned"    → confirmed upcoming, not started yet
 *   "idea"       → being considered / community requested
 */

export type ChangelogStatus = "shipped" | "in-progress" | "planned" | "idea";

export type ChangelogCategory =
    | "feature"
    | "improvement"
    | "bugfix"
    | "security"
    | "performance"
    | "dx";   // developer experience

export interface ChangelogEntry {
    id: string;
    date?: string;          // ISO date string, e.g. "2025-07-15" — omit for planned/ideas
    status: ChangelogStatus;
    category: ChangelogCategory;
    title: string;
    description: string;
    tags?: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
    // ── Shipped ──────────────────────────────────────────────────────────────
    {
        id: "leaderboard-profiles-001",
        date: "2026-07-26",
        status: "shipped",
        category: "feature",
        title: "Leaderboard → public profiles",
        description:
            "Every player on the leaderboard is now clickable — jump straight to their public profile to see their tier, heatmap and recent submissions. Users without a public profile show as plain rows.",
        tags: ["leaderboard", "profile", "community"],
    },
    {
        id: "leaderboard-pagination-001",
        date: "2026-07-26",
        status: "shipped",
        category: "improvement",
        title: "Leaderboard pagination",
        description:
            "The leaderboard is paginated server-side (25 players per page) with sort by score, solved or accuracy. Rank numbers stay canonical across every sort, and your own rank card works from any page.",
        tags: ["leaderboard", "performance"],
    },
    {
        id: "monorepo-001",
        date: "2026-07-26",
        status: "shipped",
        category: "dx",
        title: "Monorepo restructure",
        description:
            "The app is now split into client/ (the Next.js frontend) and server/ (a new TypeScript backend). A single `npm run dev` starts both.",
        tags: ["architecture", "dx"],
    },
    {
        id: "backend-001",
        date: "2026-07-26",
        status: "shipped",
        category: "feature",
        title: "New backend service",
        description:
            "A layered Express + TypeScript API with request validation, structured logging, rate limiting, and Clerk JWT auth. The legacy DataWeave /api/transform contract is preserved byte-for-byte, guarded by characterization tests.",
        tags: ["backend", "api", "dx"],
    },
    {
        id: "sponsor-001",
        date: "2026-07-26",
        status: "shipped",
        category: "feature",
        title: "Sponsorships",
        description:
            "A new /sponsor page with Razorpay checkout, preset tiers, and a public sponsor wall. Every payment is verified server-side via HMAC signature before it counts.",
        tags: ["sponsor", "payments", "community"],
    },
    {
        id: "theme-store-001",
        date: "2026-07-26",
        status: "shipped",
        category: "feature",
        title: "Theme Store",
        description:
            "Seven purchasable accent themes with a live try-before-you-buy preview across the whole site. Coins are now spendable — debits are atomic and race-safe.",
        tags: ["themes", "coins", "gamification"],
    },
    {
        id: "playground-redesign-001",
        date: "2026-07-26",
        status: "shipped",
        category: "improvement",
        title: "Playground redesign",
        description:
            "A decluttered toolbar, the AI panel removed, and a new settings dialog covering editor theme, font size, indent, wrap, minimap, line numbers, and opt-in auto-run. Your layout preference is persisted.",
        tags: ["playground", "editor", "ux"],
    },
    {
        id: "footer-002",
        date: "2026-07-26",
        status: "shipped",
        category: "improvement",
        title: "Site footer",
        description:
            "A new footer with quick links across the site. Changelog moved from the navbar into it, and the footer stays hidden inside the problem workspace to keep the editor distraction-free.",
        tags: ["ui", "navigation"],
    },
    {
        id: "blog-dark-001",
        date: "2026-07-26",
        status: "shipped",
        category: "bugfix",
        title: "Blog — dark-theme fixes",
        description:
            "LinkedIn embed tiles are now readable in dark mode, and long-form post styling has been rebuilt from scratch — the old prose classes were inert and did nothing.",
        tags: ["blog", "dark-mode"],
    },
    {
        id: "admin-users-001",
        date: "2026-07-26",
        status: "shipped",
        category: "bugfix",
        title: "Admin user directory fixed",
        description:
            "Users who never submitted code were invisible in the admin directory. It now unions profiles, submissions, comments, coins, and roles, with activity tabs and per-user counts.",
        tags: ["admin", "bugfix"],
    },
    {
        id: "security-001",
        date: "2026-07-26",
        status: "shipped",
        category: "security",
        title: "Security hardening",
        description:
            "Removed an unauthenticated AI endpoint that exposed the server's Gemini key. CI now scans every push for committed secrets and live API keys.",
        tags: ["security", "ci"],
    },
    {
        id: "cicd-001",
        date: "2026-07-26",
        status: "shipped",
        category: "dx",
        title: "CI/CD overhaul",
        description:
            "Separate frontend and backend pipelines with path filtering and caching, a one-click Render blueprint for the backend, and Vercel config for the frontend.",
        tags: ["ci", "deploy", "dx"],
    },
    {
        id: "blog-votes-001",
        date: "2026-07-26",
        status: "shipped",
        category: "feature",
        title: "Blog voting",
        description:
            "Upvote or downvote any blog post, with the score updating live.",
        tags: ["blog", "community"],
    },
    {
        id: "rank-avatars-001",
        date: "2026-07-26",
        status: "shipped",
        category: "feature",
        title: "Rank avatars",
        description:
            "Profile pictures now carry tier effects that match your rank — and Grandmasters get an animated ring.",
        tags: ["profile", "gamification"],
    },
    {
        id: "profile-redesign-001",
        date: "2026-07-26",
        status: "shipped",
        category: "improvement",
        title: "Public profiles redesigned",
        description:
            "Public profiles got a full refresh: tier badge, score, streak, solve breakdown rings, an activity heatmap, and recent submissions.",
        tags: ["profile", "ui"],
    },
    {
        id: "weekly-contests-001",
        date: "2026-07-26",
        status: "shipped",
        category: "feature",
        title: "Weekly contests",
        description:
            "A public contest with randomly selected problems is scheduled automatically every Saturday at 15:00 UTC — show up, solve, climb the leaderboard.",
        tags: ["contests", "community", "gamification"],
    },
    {
        id: "not-found-001",
        date: "2026-07-26",
        status: "shipped",
        category: "improvement",
        title: "404 page with rotating memes",
        description:
            "Getting lost is now a feature. Dead links serve a fresh meme on every visit — we can neither confirm nor deny that some team members type bad URLs on purpose.",
        tags: ["404", "fun"],
    },
    {
        id: "profile-public-001",
        date: "2025-07-17",
        status: "shipped",
        category: "feature",
        title: "Public user profiles",
        description:
            "Every user now has a shareable public profile at /profile/[username] showing their solve breakdown by difficulty, a 30-day activity heatmap, acceptance rate, followers/following counts, and their last 10 submissions.",
        tags: ["profile", "community"],
    },
    {
        id: "profile-follow-001",
        date: "2025-07-17",
        status: "shipped",
        category: "feature",
        title: "Follow / unfollow users",
        description:
            "Users can follow and unfollow each other directly from public profile pages. Follower and following counts update in real time.",
        tags: ["profile", "community", "social"],
    },
    {
        id: "profile-edit-001",
        date: "2025-07-17",
        status: "shipped",
        category: "feature",
        title: "Edit profile — username & bio",
        description:
            "An \"Edit Profile\" dialog on the profile page lets users set a custom username (3–20 alphanumeric characters) and a short bio. Usernames are unique and case-insensitively validated.",
        tags: ["profile", "ux"],
    },
    {
        id: "profile-setup-001",
        date: "2025-07-17",
        status: "shipped",
        category: "feature",
        title: "Automatic profile setup on first sign-in",
        description:
            "On first authenticated load, a default username is auto-generated from the user's email and a UserProfile record is created silently — no manual setup required.",
        tags: ["profile", "onboarding"],
    },
    {
        id: "charts-001",
        date: "2025-07-17",
        status: "shipped",
        category: "feature",
        title: "Activity heatmap & progress rings",
        description:
            "New reusable chart components: a 30-day submission heatmap with intensity-based colouring, and SVG progress rings showing solve percentages per difficulty level.",
        tags: ["profile", "ui", "charts"],
    },
    {
        id: "hydration-fix-001",
        date: "2025-07-17",
        status: "shipped",
        category: "bugfix",
        title: "Hydration error with DialogTrigger fixed",
        description:
            "A React hydration mismatch on the profile page caused by DialogTrigger with asChild was resolved by switching to the render prop pattern.",
        tags: ["profile", "bugfix", "react"],
    },
    {
        id: "shadcn-label-001",
        date: "2025-07-17",
        status: "shipped",
        category: "dx",
        title: "Added missing shadcn Label component",
        description:
            "The Label UI component was missing from the component library. It has been added so form fields across the app render correctly.",
        tags: ["ui", "dx"],
    },
    {
        id: "dashboard-enhancements-001",
        date: "2025-07-17",
        status: "shipped",
        category: "improvement",
        title: "Home dashboard enhancements",
        description:
            "The home dashboard now shows username, follower/following counts, and a link to the user's public profile. The profile data fetch also auto-triggers setup if a username is missing.",
        tags: ["dashboard", "profile", "ux"],
    },
    {
        id: "tour-001",
        date: "2025-07-17",
        status: "shipped",
        category: "feature",
        title: "Product Tour for new users",
        description:
            "First-time signed-in users now see a friendly step-by-step walkthrough introducing Playground, Problems, Contests, Blog, and the Leaderboard.",
        tags: ["onboarding", "ux"],
    },
    {
        id: "changelog-001",
        date: "2025-07-17",
        status: "shipped",
        category: "feature",
        title: "Pipeline & Changelog page",
        description:
            "This very page! A public roadmap showing shipped features, what's in progress, and what's coming next.",
        tags: ["transparency", "community"],
    },
    {
        id: "blog-002",
        date: "2025-07-17",
        status: "shipped",
        category: "bugfix",
        title: "Blog — LinkedIn embed rendering fix",
        description:
            "The blog listing page was showing raw <iframe> HTML as plain text instead of a preview card. Fixed: the list now shows a clean LinkedIn preview tile; the detail page renders the embed correctly.",
        tags: ["blog", "embeds"],
    },
    {
        id: "blog-003",
        date: "2025-07-17",
        status: "shipped",
        category: "improvement",
        title: "Blog — shareable links & login-free reading",
        description:
            "Blog posts are now fully public — no sign-in required to read. Each post has a Share button that uses the Web Share API on mobile or copies the URL on desktop.",
        tags: ["blog", "sharing"],
    },
    {
        id: "admin-001",
        date: "2025-07-17",
        status: "shipped",
        category: "improvement",
        title: "Admin link controlled by environment variable",
        description:
            "The Admin nav button is now hidden by default. Set NEXT_PUBLIC_SHOW_ADMIN=true in your environment to reveal it.",
        tags: ["admin", "config"],
    },
    {
        id: "maintenance-001",
        date: "2025-07-16",
        status: "shipped",
        category: "feature",
        title: "Maintenance mode banner",
        description:
            "Operators can flip NEXT_PUBLIC_MAINTENANCE_MODE=true to show a friendly overlay banner site-wide without blocking browsing.",
        tags: ["ops", "config"],
    },
    {
        id: "backend-url-001",
        date: "2025-07-16",
        status: "shipped",
        category: "dx",
        title: "Single-place backend URL config",
        description:
            "The DataWeave compiler backend URL is now controlled by DWL_BACKEND_URL in .env.local. Change one env var to switch between local Docker, staging, or production — no code edits needed.",
        tags: ["config", "dx"],
    },
    {
        id: "footer-001",
        date: "2025-07-16",
        status: "shipped",
        category: "improvement",
        title: "Apache 2.0 license footer",
        description: "A global footer now appears on every page stating the project's open-source Apache 2.0 license.",
        tags: ["legal"],
    },
    {
        id: "stats-001",
        date: "2025-07-15",
        status: "shipped",
        category: "bugfix",
        title: "Dashboard stats scoped to authenticated user",
        description:
            "Solved, Attempted, and Bookmarked counts on the home dashboard were previously returning global aggregates. They are now correctly filtered to the signed-in user's data only.",
        tags: ["dashboard", "auth"],
    },
    {
        id: "bookmark-001",
        date: "2025-07-15",
        status: "shipped",
        category: "bugfix",
        title: "Bookmarks scoped per user",
        description:
            "Bookmarks now store a userId field and enforce a compound unique index on {problemId, userId}. The API routes require authentication and return only the calling user's bookmarks.",
        tags: ["bookmarks", "auth"],
    },
    {
        id: "guest-migration-001",
        date: "2025-07-15",
        status: "shipped",
        category: "feature",
        title: "Guest progress migration on sign-in",
        description:
            "Accepted solves made as a guest are persisted to localStorage and silently migrated to the user's account on first authenticated dashboard load.",
        tags: ["guest", "onboarding"],
    },

    // ── In progress ───────────────────────────────────────────────────────────
    {
        id: "notifications-001",
        status: "in-progress",
        category: "feature",
        title: "In-app notifications",
        description:
            "A notification bell in the navbar that surfaces activity like contest start reminders, new problems, and comment replies.",
        tags: ["notifications", "ux"],
    },

    // ── Planned ───────────────────────────────────────────────────────────────
    {
        id: "ai-hints-001",
        status: "planned",
        category: "feature",
        title: "AI-powered hints",
        description:
            "Ask for a contextual hint on any problem without revealing the full solution. Powered by Gemini.",
        tags: ["ai", "problems"],
    },
    {
        id: "collections-001",
        status: "planned",
        category: "feature",
        title: "Problem collections / learning paths",
        description:
            "Curated sets of problems grouped by topic (Arrays, Objects, Reduce, Date-Time…) so users can follow a structured learning path.",
        tags: ["problems", "learning"],
    },
    {
        id: "discussion-001",
        status: "planned",
        category: "feature",
        title: "Per-problem discussion threads",
        description:
            "A dedicated discussion section on each problem page where users can ask questions, share approaches, and upvote helpful comments.",
        tags: ["community", "problems"],
    },
    {
        id: "embed-snippet-001",
        status: "planned",
        category: "feature",
        title: "Embeddable playground snippets",
        description:
            "An <iframe> embed so any DWCode playground snippet can be embedded directly in blog posts, documentation, or external sites.",
        tags: ["playground", "sharing"],
    },

    // ── Ideas ─────────────────────────────────────────────────────────────────
    {
        id: "mobile-app-001",
        status: "idea",
        category: "feature",
        title: "Mobile app (PWA)",
        description:
            "Progressive Web App version of DWCode for offline problem browsing and code reading on mobile.",
        tags: ["mobile", "pwa"],
    },
];
