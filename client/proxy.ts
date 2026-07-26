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
