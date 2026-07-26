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

const nextConfig: NextConfig = {
  output: "standalone",

  turbopack: {
    root: workspaceRoot,
  },

  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
