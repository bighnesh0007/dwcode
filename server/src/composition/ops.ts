/**
 * Domain module: platform and admin — telemetry, analytics, the audit log
 * and moderation. Built from DomainDeps only.
 */
import { OpsController } from "../controllers/ops.controller.ts";
import { ContributionRepository } from "../repositories/contribution.repository.ts";
import { OpsRepository } from "../repositories/ops.repository.ts";
import { opsAdminRoutes, telemetryRoutes } from "../routes/v1/ops.routes.ts";
import { OpsService } from "../services/admin/ops.service.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildOpsDomain(deps: DomainDeps): DomainModule[] {
  const controller = new OpsController(new OpsService(new OpsRepository(), new ContributionRepository(), deps.clock), deps.identity);
  return [
    { path: "/telemetry", router: telemetryRoutes(controller) },
    { path: "/admin/ops", router: opsAdminRoutes(controller, deps.tokenVerifier) },
  ];
}
