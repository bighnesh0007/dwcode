/**
 * Central config — the ONLY place the client package reads `process.env`.
 *
 * Mirrors the philosophy of server/src/config/env.ts: parse once at import time,
 * report every problem at once rather than failing on the first, and gate
 * features by capability so a partially-configured deploy still boots and says
 * what is missing (REF-07).
 *
 * THREE CONSTRAINTS SHAPE THIS FILE — read before editing.
 *
 * 1. It runs in the BROWSER as well as on the server. `components/Navbar.tsx`
 *    and `components/MaintenanceBanner.tsx` are client components that import
 *    from here. Server-only vars are simply absent there, so validation of them
 *    must be server-guarded and this module must NEVER throw in the browser.
 *
 * 2. Next.js inlines `process.env.NEXT_PUBLIC_X` by STATIC TEXT REPLACEMENT at
 *    build time. Dynamic access (`process.env[name]`) is not replaced and reads
 *    as undefined in the browser. Every public var must therefore be referenced
 *    as a literal property, which is why RAW below is written out longhand
 *    instead of looped over.
 *
 * 3. `next build` runs with most secrets absent — CI supplies only the three
 *    NEXT_PUBLIC_ vars. Missing values must therefore degrade to a reported
 *    disabled capability, never a thrown error, or the build breaks. Only a
 *    MALFORMED value (a non-URL in a URL field) is treated as fatal.
 */

const isServer = typeof window === "undefined";

/**
 * Literal reads so Next.js's static replacement can see them. Do not refactor
 * this into a loop — see constraint 2 above.
 */
const RAW = {
    // Server-only (no NEXT_PUBLIC_ prefix → stripped from the browser bundle).
    // Only non-secret values live here; secret NAMES are read inside the
    // isServer branch below so they never appear in a client bundle at all.
    GUEST_MIGRATION_ENABLED: process.env.GUEST_MIGRATION_ENABLED,
    GRADE_HIDDEN_TESTS: process.env.GRADE_HIDDEN_TESTS,
    // Public (inlined into the browser bundle)
    NEXT_PUBLIC_MAINTENANCE_MODE: process.env.NEXT_PUBLIC_MAINTENANCE_MODE,
    NEXT_PUBLIC_SHOW_ADMIN: process.env.NEXT_PUBLIC_SHOW_ADMIN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
} as const;

// ── Tiny validators ──────────────────────────────────────────────────────────
// Deliberately hand-rolled rather than pulling zod into the client bundle for
// four fields. SEC-15 introduces zod for request validation; if this file grows
// past a handful of values, move it over then.

const issues: string[] = [];

/** `true`/`1` → true, `false`/`0` → false, absent → fallback, anything else → issue. */
function booleanish(name: string, value: string | undefined, fallback = false): boolean {
    if (value === undefined || value === "") return fallback;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    issues.push(`${name}: expected true/false/1/0, got "${value}"`);
    return fallback;
}

// ── Exported values ──────────────────────────────────────────────────────────

/**
 * Maintenance banner. Public — safe to expose, it only toggles a banner.
 */
export const MAINTENANCE_MODE = booleanish(
    "NEXT_PUBLIC_MAINTENANCE_MODE",
    RAW.NEXT_PUBLIC_MAINTENANCE_MODE,
);

/**
 * Admin nav link visibility. Public, therefore a UI affordance ONLY and never a
 * security control — it ships in the browser bundle where anyone can read it.
 * The real gate is requireAdmin() on every admin route (audit finding L-2).
 */
export const SHOW_ADMIN = booleanish("NEXT_PUBLIC_SHOW_ADMIN", RAW.NEXT_PUBLIC_SHOW_ADMIN);

/**
 * Guest progress migration. OFF by default.
 *
 * /api/migrate-guest-progress trusted a client-supplied list of slugs and wrote
 * an `Accepted` submission for each with no verification, making every solved
 * count and leaderboard rank forgeable in one request (audit finding C-5).
 *
 * Deliberately NOT a NEXT_PUBLIC_ var: it gates a server route, so its state
 * must not be readable from or implied by the client bundle.
 *
 * Re-enable only once submissions are graded server-side end to end (FEAT-01),
 * so claimed guest solves can be re-graded rather than trusted.
 */
export const GUEST_MIGRATION_ENABLED = booleanish(
    "GUEST_MIGRATION_ENABLED",
    RAW.GUEST_MIGRATION_ENABLED,
);

/**
 * Run each problem's hidden test cases when grading a submission. OFF by default.
 *
 * Without them a submission is graded only on test cases the browser can see,
 * expected outputs included, so pasting the expected output passes (issue #10).
 * Turn on only after `npm --prefix client run audit:problems` reports that every
 * stored solution passes its hidden cases; a wrong hidden expectation would
 * otherwise make a problem impossible to solve.
 */
export const GRADE_HIDDEN_TESTS = booleanish("GRADE_HIDDEN_TESTS", RAW.GRADE_HIDDEN_TESTS);

// ── Capability reporting ─────────────────────────────────────────────────────

/**
 * Which server-side features are fully configured. Mirrors
 * CAPABILITY_REQUIREMENTS in server/src/config/env.ts.
 *
 * A missing value disables its capability and is REPORTED, not thrown — a
 * production build runs without most of these, and failing the build over an
 * absent secret would be worse than booting with the feature off.
 */
const CAPABILITY_REQUIREMENTS = {
    auth: ["CLERK_SECRET_KEY"],
    ai: ["GEMINI_API_KEY"],
    github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    admin: ["SUPER_ADMIN_USER_ID"],
} as const satisfies Record<string, readonly string[]>;

export type Capability = keyof typeof CAPABILITY_REQUIREMENTS;

/**
 * Reads secret env vars DYNAMICALLY and only on the server.
 *
 * Dynamic access is normally wrong in this file (constraint 2), but here it is
 * exactly what we want: it means Next.js has nothing to statically replace, so
 * these variable names never appear in the client bundle. Correct on the server,
 * where `process.env` is the real thing at runtime.
 */
function resolveCapabilities() {
    const enabled: Capability[] = [];
    const missing: { capability: Capability; vars: string[] }[] = [];

    for (const [capability, vars] of Object.entries(CAPABILITY_REQUIREMENTS)) {
        const absent = vars.filter((name) => {
            const value = process.env[name];
            return value === undefined || value === "";
        });
        if (absent.length === 0) enabled.push(capability as Capability);
        else missing.push({ capability: capability as Capability, vars: absent });
    }
    return { enabled, missing };
}

export const capabilities = isServer
    ? resolveCapabilities()
    : { enabled: [] as Capability[], missing: [] as { capability: Capability; vars: string[] }[] };

// ── Fail fast, on the server only ────────────────────────────────────────────

if (isServer) {
    // A malformed value is a configuration bug and should be loud. Absent values
    // are handled by the capability report above, not here.
    if (issues.length > 0) {
        const detail = issues.map((i) => `  - ${i}`).join("\n");
        // Thrown at import time so a bad deploy fails immediately and completely,
        // rather than 500ing on whichever request happens to touch the value.
        throw new Error(`Invalid environment configuration:\n${detail}`);
    }

    if (capabilities.missing.length > 0 && process.env.NODE_ENV !== "test") {
        for (const { capability, vars } of capabilities.missing) {
            console.warn(
                `[config] capability "${capability}" is disabled: missing ${vars.join(", ")}`,
            );
        }
    }

    // Relying on the built-in default is legitimate but worth surfacing: the
    // compiler is now on the submission path, so which host it points at is
    // operationally significant rather than a playground detail.
}
