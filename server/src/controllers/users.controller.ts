/**
 * HTTP adapter for the users domain: profiles, follows, coins, store,
 * leaderboard, guest-progress. Identity always comes from `req.auth`.
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate.ts";
import type { CoinsRepository } from "../repositories/coins.repository.ts";
import type { GuestProgressService } from "../services/users/guestProgress.service.ts";
import type { LeaderboardQuery, LeaderboardService } from "../services/users/leaderboard.service.ts";
import type { ProfileService } from "../services/users/profile.service.ts";
import type { StoreService } from "../services/users/store.service.ts";
import { ok } from "../utils/respond.ts";
import type { FollowInput, PurchaseInput, UpdateIdentityInput } from "../validation/users.schema.ts";

const COIN_HISTORY = 20;

export class UsersController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly store: StoreService,
    private readonly leaderboardService: LeaderboardService,
    private readonly coins: CoinsRepository,
    private readonly guest: GuestProgressService,
  ) {}

  dashboard = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.profiles.dashboard(requireUser(req)));
  };

  publicProfile = async (req: Request, res: Response): Promise<void> => {
    const { username } = validatedParams<{ username: string }>(req);
    ok(res, await this.profiles.publicProfile(username, req.auth?.userId));
  };

  setup = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.profiles.setup(requireUser(req)));
  };

  updateIdentity = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<UpdateIdentityInput>(req);
    ok(res, await this.profiles.updateIdentity(requireUser(req), body.username, body.bio));
  };

  follow = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<FollowInput>(req);
    ok(res, await this.profiles.toggleFollow(requireUser(req), body.targetUsername));
  };

  coinSummary = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.coins.summary(requireUser(req), COIN_HISTORY));
  };

  catalogue = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.store.catalogue(req.auth?.userId));
  };

  purchase = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<PurchaseInput>(req);
    ok(res, await this.store.purchase(requireUser(req, "Sign in to buy items."), body.itemId));
  };

  leaderboard = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.leaderboardService.get(validatedQuery<LeaderboardQuery>(req), req.auth?.userId));
  };

  migrateGuestProgress = (_req: Request, _res: Response): void => {
    this.guest.migrate();
  };
}

function requireUser(req: Request, message = "Authentication required."): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError(message);
  return userId;
}
