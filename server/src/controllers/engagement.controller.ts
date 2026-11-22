/**
 * HTTP adapter for engagement: the daily challenge and a user's progress.
 *
 *   GET /api/v1/daily               public; `solved` when signed in
 *   GET /api/v1/engagement/me       auth: streak, freezes, achievements
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import type { EngagementService } from "../services/engagement/engagement.service.ts";
import { ok } from "../utils/respond.ts";

export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  daily = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.engagement.daily(req.auth?.userId));
  };

  progress = async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth?.userId;
    if (!userId) throw new UnauthenticatedError("Authentication required.");
    ok(res, await this.engagement.progress(userId));
  };
}
