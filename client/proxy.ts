import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Auth middleware (Next.js 16 names this proxy.ts).
 *
 * Strategy: protect a KNOWN-PRIVATE list instead of allowlisting public routes.
 * The old protect-by-default matcher quietly contradicted the product:
 *  - /profile/[username] — the PUBLIC profile viewer — bounced anonymous
 *    visitors to sign-in, so shared profile links never worked signed-out.
 *  - /blog was documented as "no sign-in required to read" yet redirected.
 *  - /sponsor supports anonymous donations but couldn't be reached anonymously.
 *  - Unknown URLs redirected to sign-in instead of rendering the 404 page.
 * Page-level gates (blog/new sign-in check, admin fetch-probe + server-side
 * requireAdmin on its APIs) already guard the actual actions; middleware here
 * only decides who can LOAD a page.
 */
/*
 * DEPRECATED API — tracked, not ignored.
 *
 * @clerk/nextjs 7.6.1 (picked up when REF-01 regenerated the lockfile)
 * deprecates `createRouteMatcher`, and its reasoning matches audit finding
 * W1-R8 exactly: "Middleware-based auth checks rely on path matching, which can
 * diverge from how Next.js routes requests and leave protected resources
 * reachable." That is the same class as the Next.js middleware/proxy bypass
 * fixed in 16.2.12.
 *
 * Suppressed rather than migrated HERE because migrating means moving
 * `auth.protect()` into each of /profile, /create, /admin and /blog/new — an
 * auth change that does not belong inside a build-system refactor.
 *
 * This is LOW RISK today: every protected action already enforces authorisation
 * server-side in its own route handler (Week 1 SEC-01…SEC-04). This matcher only
 * decides who may LOAD a page, so a bypass exposes an empty shell, not data.
 *
 * Tracked as SEC-21 in docs/audit/03-backlog.md.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
const isProtectedRoute = createRouteMatcher([
  "/profile",        // own dashboard only — /profile/[username] stays public
  "/create(.*)",
  "/admin(.*)",
  "/blog/new(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
