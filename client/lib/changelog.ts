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
    {
        id: "editor-themes-001",
        status: "in-progress",
        category: "improvement",
        title: "Code editor theme picker",
        description:
            "Let users choose their preferred editor theme (VS Dark, Monokai, Solarised, etc.) and persist the preference.",
        tags: ["editor", "ux"],
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
    {
        id: "weekly-challenge-001",
        status: "idea",
        category: "feature",
        title: "Weekly challenge",
        description:
            "A new featured problem every Monday with a global leaderboard reset, special badges for top finishers, and community voting on the next challenge.",
        tags: ["community", "gamification"],
    },
];
