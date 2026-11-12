/**
 * HTTP adapter for contests.
 *
 *   GET    /api/v1/contests               list visible to the caller (optional auth)
 *   POST   /api/v1/contests               create (signed in)
 *   POST   /api/v1/contests/join-by-code  join a private contest by invite key
 *   GET    /api/v1/contests/:id           detail (optional auth; private needs membership)
 *   POST   /api/v1/contests/:id/join      join a public contest
 *   POST   /api/v1/contests/:id/leave     leave
 *   DELETE /api/v1/contests/:id           delete (creator only)
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams } from "../middleware/validate.ts";
import { created, noContent, ok } from "../utils/respond.ts";
import type { ContestService } from "../services/contest/contest.service.ts";
import type { CreateContestInput, JoinByCodeInput } from "../validation/contest.schema.ts";

export class ContestController {
  constructor(private readonly service: ContestService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.list(req.auth?.userId));
  };

  detail = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, await this.service.detail(id, req.auth?.userId));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const contest = await this.service.create(userId, validatedBody<CreateContestInput>(req));
    created(res, contest, `/api/v1/contests/${String(contest._id)}`);
  };

  joinByCode = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { inviteCode } = validatedBody<JoinByCodeInput>(req);
    ok(res, await this.service.joinByCode(inviteCode, userId));
  };

  join = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, await this.service.join(id, userId));
  };

  leave = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { id } = validatedParams<{ id: string }>(req);
    await this.service.leave(id, userId);
    noContent(res);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { id } = validatedParams<{ id: string }>(req);
    await this.service.remove(id, userId);
    noContent(res);
  };
}

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Sign in to continue.");
  return userId;
}
