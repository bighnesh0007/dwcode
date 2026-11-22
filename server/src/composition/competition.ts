/**
 * Domain module: competition — contest standings, ratings, teams, countries.
 * Built from DomainDeps only. The contest events job is built by the container.
 */
import { CompetitionController } from "../controllers/competition.controller.ts";
import { CoinsRepository } from "../repositories/coins.repository.ts";
import { CompetitionRepository } from "../repositories/competition.repository.ts";
import { TeamRepository } from "../repositories/team.repository.ts";
import { UserProfileRepository } from "../repositories/userProfile.repository.ts";
import { UserStatsRepository } from "../repositories/userStats.repository.ts";
import {
  countryRoutes,
  groupLeaderboardRoutes,
  ratingRoutes,
  standingsRoutes,
  teamRoutes,
} from "../routes/v1/competition.routes.ts";
import { CompetitionService } from "../services/competition/competition.service.ts";
import { TeamService } from "../services/competition/team.service.ts";
import type { Clock } from "../types/ports.ts";
import { buildNotificationService } from "./notifications.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildCompetitionService(clock: Clock): CompetitionService {
  return new CompetitionService(new CompetitionRepository(), new CoinsRepository(), clock, buildNotificationService());
}

export function buildCompetitionDomain(deps: DomainDeps): DomainModule[] {
  const controller = new CompetitionController(
    buildCompetitionService(deps.clock),
    new TeamService(new TeamRepository(), new UserStatsRepository()),
    new UserProfileRepository(),
  );
  const v = deps.tokenVerifier;
  return [
    { path: "/contests", router: standingsRoutes(controller, v) },
    { path: "/ratings", router: ratingRoutes(controller, v) },
    { path: "/teams", router: teamRoutes(controller, v) },
    { path: "/leaderboards", router: groupLeaderboardRoutes(controller) },
    { path: "/profile-country", router: countryRoutes(controller, v) },
  ];
}
