/**
 * HTTP adapter for profile extras, the feed, mentors and jobs (Phase E).
 *
 *   GET  /api/v1/profile-details/me             auth    about, equipped, owned items
 *   PUT  /api/v1/profile-details/me             auth    { headline, about, links }
 *   PUT  /api/v1/profile-details/equip          auth    { slot, itemId }
 *   PUT  /api/v1/profile-details/mentor         auth    { active, topics, note }
 *   GET  /api/v1/profile-details/u/:username    public  about, equipped, skill radar, mentor
 *   GET  /api/v1/feed                           auth    solves and posts by people you follow
 *   GET  /api/v1/mentors                        public
 *   POST /api/v1/mentors/:username/ask          auth    { message }
 *   GET  /api/v1/jobs                           public  approved job posts
 */
import { JOB_LISTING_DAYS, type CosmeticSlot } from "@dwcode/shared";
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams } from "../middleware/validate.ts";
import type { ContributionService } from "../services/contribute/contribution.service.ts";
import type { ProfileExtrasService } from "../services/users/profileExtras.service.ts";
import { ok } from "../utils/respond.ts";
import type { AboutBody, AskBody, EquipBody, MentorBody } from "../validation/profileExtras.schema.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

export class Community2Controller {
  constructor(
    private readonly extras: ProfileExtrasService,
    private readonly contributions: ContributionService,
  ) {}

  mine = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.extras.mine(requireUser(req)));
  };

  updateAbout = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<AboutBody>(req);
    const links = Object.fromEntries(Object.entries(body.links).filter((e): e is [string, string] => typeof e[1] === "string"));
    ok(res, await this.extras.updateAbout(requireUser(req), { headline: body.headline, about: body.about, links }));
  };

  equip = async (req: Request, res: Response): Promise<void> => {
    const { slot, itemId } = validatedBody<EquipBody>(req);
    ok(res, await this.extras.equip(requireUser(req), slot as CosmeticSlot, itemId));
  };

  setMentor = async (req: Request, res: Response): Promise<void> => {
    const { active, topics, note } = validatedBody<MentorBody>(req);
    ok(res, await this.extras.setMentor(requireUser(req), { active, topics, note }));
  };

  publicView = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.extras.publicView(validatedParams<{ username: string }>(req).username));
  };

  feed = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.extras.feed(requireUser(req)));
  };

  mentors = async (_req: Request, res: Response): Promise<void> => {
    ok(res, { mentors: await this.extras.mentors() });
  };

  ask = async (req: Request, res: Response): Promise<void> => {
    const { username } = validatedParams<{ username: string }>(req);
    ok(res, await this.extras.ask(requireUser(req), username, validatedBody<AskBody>(req).message));
  };

  jobs = async (_req: Request, res: Response): Promise<void> => {
    ok(res, { jobs: await this.contributions.jobs(JOB_LISTING_DAYS), listingDays: JOB_LISTING_DAYS });
  };
}
