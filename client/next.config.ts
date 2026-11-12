import path from "node:path";
import type { NextConfig } from "next";

/**
 * The workspace root is the REPO root, not `client/`.
 *
 * This used to be pinned to `import.meta.dirname` (i.e. client/) because the
 * repo previously had multiple lockfiles and Turbopack's root inference was
 * ambiguous. REF-01 changed both facts:
 *
 *  - there is now exactly ONE lockfile, at the repo root, so nothing is ambiguous
 *  - `@dwcode/shared` lives at `packages/shared`, OUTSIDE client/
 *
 * Keeping the old pin made Turbopack refuse to resolve anything above client/,
 * which failed the build with `Module not found: @dwcode/shared` in eleven files.
 */
const workspaceRoot = path.join(import.meta.dirname, "..");

/**
 * One public origin. The browser calls `/backend/*` on this site and Next.js
 * proxies it to the Express server on this machine, so the Cloudflare tunnel
 * exposes exactly one hostname, the API has no public address of its own, and
 * there is no cross-origin request to configure CORS for. Read at build time.
 */
const backendInternalUrl = (process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",

  rewrites() {
    return Promise.resolve([{ source: "/backend/:path*", destination: `${backendInternalUrl}/:path*` }]);
  },

  turbopack: {
    root: workspaceRoot,
  },

  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
