/**
 * Domain module: admin. Placeholder — filled in by the route migration.
 * Owns its routes under /api/v1; built from DomainDeps only.
 */
import { Router } from "express";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildAdminDomain(_deps: DomainDeps): DomainModule[] {
  return [{ path: "/admin", router: Router() }];
}
