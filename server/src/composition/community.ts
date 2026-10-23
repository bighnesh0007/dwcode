/**
 * Domain module: community. Placeholder — filled in by the route migration.
 * Owns its routes under /api/v1; built from DomainDeps only.
 */
import { Router } from "express";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildCommunityDomain(_deps: DomainDeps): DomainModule[] {
  return [{ path: "/community", router: Router() }];
}
