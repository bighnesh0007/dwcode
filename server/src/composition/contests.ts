/**
 * Domain module: contests (user-created and the weekly contest's join/leave).
 * Owns its routes under /api/v1; built from DomainDeps only.
 */
import { ContestController } from "../controllers/contest.controller.ts";
import { ContestQueryRepository } from "../repositories/contest.repository.ts";
import { contestRoutes } from "../routes/v1/contest.routes.ts";
import { ContestService } from "../services/contest/contest.service.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildContestsDomain(deps: DomainDeps): DomainModule[] {
  const service = new ContestService(new ContestQueryRepository(), deps.identity, deps.clock);
  return [{ path: "/contests", router: contestRoutes(new ContestController(service), deps.tokenVerifier) }];
}
