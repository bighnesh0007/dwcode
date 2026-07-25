import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  turbopack: {
    // The repo root has its own package.json + lockfile (for the `concurrently`
    // dev runner), so Turbopack detected two lockfiles and inferred the REPO ROOT
    // as the workspace root. The Next.js app is this directory, so pin it
    // explicitly: it silences the warning and, more usefully, stops Turbopack
    // watching and resolving across the whole monorepo (including server/).
    root: import.meta.dirname,
  },
};

export default nextConfig;
