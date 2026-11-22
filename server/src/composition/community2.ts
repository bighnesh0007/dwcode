/**
 * Domain module: profile extras (about, cosmetics, skill radar), the
 * activity feed, mentors and the jobs board. Built from DomainDeps only.
 */
import { Community2Controller } from "../controllers/community2.controller.ts";
import { BlogRepository } from "../repositories/blog.repository.ts";
import { ProblemCatalogRepository } from "../repositories/problemCatalog.repository.ts";
import { ProfileDetailRepository } from "../repositories/profileDetail.repository.ts";
import { StorePurchaseRepository } from "../repositories/storePurchase.repository.ts";
import { SubmissionRepository } from "../repositories/submission.repository.ts";
import { UserProfileRepository } from "../repositories/userProfile.repository.ts";
import { feedRoutes, jobRoutes, mentorRoutes, profileDetailRoutes } from "../routes/v1/community2.routes.ts";
import { ProfileExtrasService } from "../services/users/profileExtras.service.ts";
import { buildContributionService } from "./contribute.ts";
import { buildNotificationService } from "./notifications.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildCommunity2Domain(deps: DomainDeps): DomainModule[] {
  const extras = new ProfileExtrasService(
    new ProfileDetailRepository(),
    new UserProfileRepository(),
    new StorePurchaseRepository(),
    new ProblemCatalogRepository(),
    new SubmissionRepository(),
    new BlogRepository(),
    buildNotificationService(),
    deps.store,
    deps.clock,
  );
  const controller = new Community2Controller(extras, buildContributionService(deps));
  const v = deps.tokenVerifier;
  return [
    { path: "/profile-details", router: profileDetailRoutes(controller, v) },
    { path: "/feed", router: feedRoutes(controller, v) },
    { path: "/mentors", router: mentorRoutes(controller, v) },
    { path: "/jobs", router: jobRoutes(controller) },
  ];
}
