/**
 * Central config — all environment-driven values live here.
 *
 * Server-side vars  → used in API routes / server components (no NEXT_PUBLIC_ prefix).
 * Client-side vars  → must carry NEXT_PUBLIC_ prefix to be bundled into the browser.
 */

// ─── DataWeave compiler backend ───────────────────────────────────────────────
// Set DWL_BACKEND_URL in your .env.local (or hosting dashboard) to point at
// any environment's backend without touching source code.
// Default falls back to the production Render instance.
export const DWL_BACKEND_URL =
    process.env.DWL_BACKEND_URL ?? "https://dwlbackend.onrender.com";

// ─── Maintenance mode ─────────────────────────────────────────────────────────
// Set NEXT_PUBLIC_MAINTENANCE_MODE=true to show the maintenance banner.
// Uses NEXT_PUBLIC_ so the client bundle can read it directly.
export const MAINTENANCE_MODE =
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

// ─── Admin UI visibility ───────────────────────────────────────────────────────
// Set NEXT_PUBLIC_SHOW_ADMIN=true to show the Admin nav link.
// Leave unset (or false) in production to hide it entirely.
export const SHOW_ADMIN =
    process.env.NEXT_PUBLIC_SHOW_ADMIN === "true";
