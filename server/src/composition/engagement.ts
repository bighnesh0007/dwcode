/**
 * Domain module: engagement — daily challenge, streaks, freezes, achievements.
 * Built from DomainDeps only.
 */
import { EngagementController } from "../controllers/engagement.controller.ts";
import { CoinsRepository } from "../repositories/coins.repository.ts";
import { ContestQueryRepository } from "../repositories/contest.repository.ts";
import { ProblemCatalogRepository } from "../repositories/problemCatalog.repository.ts";
import { StorePurchaseRepository } from "../repositories/storePurchase.repository.ts";
import { SubmissionRepository } from "../repositories/submission.repository.ts";
import { dailyRoutes, engagementRoutes } from "../routes/v1/engagement.routes.ts";
import { EngagementService } from "../services/engagement/engagement.service.ts";
import type { Clock } from "../types/ports.ts";
import { buildNotificationService } from "./notifications.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

/** Also used by the container, which pays the daily bonus after grading. */
export function buildEngagementService(clock: Clock): EngagementService {
  return new EngagementService(
    new ProblemCatalogRepository(),
    new SubmissionRepository(),
    new StorePurchaseRepository(),
    new CoinsRepository(),
    new ContestQueryRepository(),
    clock,
    buildNotificationService(),
  );
}

export function buildEngagementDomain(deps: DomainDeps): DomainModule[] {
  const controller = new EngagementController(buildEngagementService(deps.clock));
  const v = deps.tokenVerifier;
  return [
    { path: "/daily", router: dailyRoutes(controller, v) },
    { path: "/engagement", router: engagementRoutes(controller, v) },
  ];
}
