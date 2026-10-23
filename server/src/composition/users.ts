/**
 * Domain module: users — profiles, follows, coins, store, leaderboard,
 * guest-progress. Built from DomainDeps only.
 */
import { UsersController } from "../controllers/users.controller.ts";
import { CoinsRepository } from "../repositories/coins.repository.ts";
import { StorePurchaseRepository } from "../repositories/storePurchase.repository.ts";
import { UserProfileRepository } from "../repositories/userProfile.repository.ts";
import { UserStatsRepository } from "../repositories/userStats.repository.ts";
import {
  coinsRoutes,
  guestProgressRoutes,
  leaderboardRoutes,
  profileRoutes,
  storeRoutes,
} from "../routes/v1/users.routes.ts";
import { GuestProgressService } from "../services/users/guestProgress.service.ts";
import { LeaderboardService } from "../services/users/leaderboard.service.ts";
import { ProfileService } from "../services/users/profile.service.ts";
import { StoreService } from "../services/users/store.service.ts";
import type { DomainDeps, DomainModule } from "./types.ts";

export function buildUsersDomain(deps: DomainDeps): DomainModule[] {
  const profiles = new UserProfileRepository();
  const stats = new UserStatsRepository();
  const coins = new CoinsRepository();

  const controller = new UsersController(
    new ProfileService(profiles, stats, deps.identity, deps.clock),
    new StoreService(new StorePurchaseRepository(), coins),
    new LeaderboardService(stats, profiles),
    coins,
    new GuestProgressService(),
  );

  const v = deps.tokenVerifier;
  return [
    { path: "/profile", router: profileRoutes(controller, v) },
    { path: "/coins", router: coinsRoutes(controller, v) },
    { path: "/store", router: storeRoutes(controller, v) },
    { path: "/leaderboard", router: leaderboardRoutes(controller, v) },
    { path: "/guest-progress", router: guestProgressRoutes(controller) },
  ];
}
