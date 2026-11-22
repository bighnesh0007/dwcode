/**
 * Domain module: contributions — problem drafts checked on the compiler,
 * certification questions, contributor applications and the admin review
 * queue. Built from DomainDeps only.
 */
import { ContributionController } from "../controllers/contribution.controller.ts";
import { CoinsRepository } from "../repositories/coins.repository.ts";
import { ContributionRepository } from "../repositories/contribution.repository.ts";
import { ProblemAccessRepository } from "../repositories/problemAccess.repository.ts";
import { ProblemCatalogRepository } from "../repositories/problemCatalog.repository.ts";
import { contributionReviewRoutes, contributionRoutes } from "../routes/v1/contribution.routes.ts";
import { ContributionService } from "../services/contribute/contribution.service.ts";
import { ProblemService } from "../services/problem/problem.service.ts";
import { buildNotificationService } from "./notifications.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildContributionService(deps: Pick<DomainDeps, "compiler" | "clock">): ContributionService {
  const coins = new CoinsRepository();
  return new ContributionService(
    new ContributionRepository(),
    new ProblemService(new ProblemCatalogRepository(), new ProblemAccessRepository(), coins),
    coins,
    buildNotificationService(),
    deps.compiler,
    () => new Date(deps.clock.nowMs()),
  );
}

export function buildContributionDomain(deps: DomainDeps): DomainModule[] {
  const controller = new ContributionController(buildContributionService(deps));
  const v = deps.tokenVerifier;
  return [
    { path: "/contributions", router: contributionRoutes(controller, v) },
    { path: "/admin/contributions", router: contributionReviewRoutes(controller, v) },
  ];
}
