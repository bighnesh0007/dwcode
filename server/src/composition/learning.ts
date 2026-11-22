/**
 * Domain module: learning paths — onboarding, placement, roadmaps, weekly
 * plan and MCD Level 1 prep. Built from DomainDeps only.
 */
import { LearningController } from "../controllers/learning.controller.ts";
import { LearnerRepository } from "../repositories/learner.repository.ts";
import { ProblemCatalogRepository } from "../repositories/problemCatalog.repository.ts";
import { SubmissionRepository } from "../repositories/submission.repository.ts";
import { certificationRoutes, learningRoutes } from "../routes/v1/learning.routes.ts";
import { LearningService } from "../services/learning/learning.service.ts";
import { buildContributionService } from "./contribute.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildLearningDomain(deps: DomainDeps): DomainModule[] {
  const contributions = buildContributionService(deps);
  const controller = new LearningController(
    new LearningService(new LearnerRepository(), new ProblemCatalogRepository(), new SubmissionRepository(), deps.clock, () => contributions.approvedQuestions()),
  );
  const v = deps.tokenVerifier;
  return [
    { path: "/learning", router: learningRoutes(controller, v) },
    { path: "/certification", router: certificationRoutes(controller, v) },
  ];
}
