"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the site footer on routes that own the full viewport.
 *
 * `/problems/[slug]` is a full-height split-pane workspace (description | editor |
 * console) sized to `100dvh`; a footer underneath it just adds dead scroll.
 *
 * This is a thin client wrapper so that `<Footer />` itself stays a server
 * component — it is passed in as `children` and rendered on the server.
 */
const FULL_HEIGHT_ROUTES = [
  /^\/problems\/[^/]+$/, // the workspace, but NOT the /problems list
];

export function FooterGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (FULL_HEIGHT_ROUTES.some((pattern) => pattern.test(pathname))) return null;

  return <>{children}</>;
}
