import type { MetadataRoute } from "next";

/** Installable app (Phase F PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DWCode — practise DataWeave",
    short_name: "DWCode",
    description: "Practise DataWeave: problems, a playground, roadmaps, contests and MuleSoft certification prep.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0a10",
    theme_color: "#7c5cff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
