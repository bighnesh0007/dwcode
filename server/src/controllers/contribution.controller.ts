/**
 * HTTP adapter for contributions.
 *
 *   GET    /api/v1/contributions                  auth   mine, contributor status and open limit
 *   POST   /api/v1/contributions                  auth   { kind, payload } → a draft
 *   GET    /api/v1/contributions/:id              auth   one of mine
 *   PUT    /api/v1/contributions/:id              auth   { payload } (drafts and rejected only)
 *   DELETE /api/v1/contributions/:id              auth   delete a draft
 *   POST   /api/v1/contributions/:id/check        auth   run a problem draft's solution on its inputs
 *   POST   /api/v1/contributions/:id/submit       auth   send for review
 *   POST   /api/v1/contributions/:id/withdraw     auth   back to draft
 *   GET    /api/v1/admin/contributions?kind=      admin  the review queue
 *   POST   /api/v1/admin/contributions/:id/approve admin { note? }
 *   POST   /api/v1/admin/contributions/:id/reject  admin { note }
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate.ts";
import type { ContributionService } from "../services/contribute/contribution.service.ts";
import { created, ok } from "../utils/respond.ts";
import type { CreateContributionInput, ReviewInput, UpdateContributionInput } from "../validation/contribution.schema.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

const idOf = (req: Request) => validatedParams<{ id: string }>(req).id;

export class ContributionController {
  constructor(private readonly contributions: ContributionService) {}

  mine = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.mine(requireUser(req)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const { kind, payload } = validatedBody<CreateContributionInput>(req);
    created(res, await this.contributions.create(requireUser(req), kind, payload));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.get(requireUser(req), idOf(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.update(requireUser(req), idOf(req), validatedBody<UpdateContributionInput>(req).payload));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.remove(requireUser(req), idOf(req)));
  };

  check = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.check(requireUser(req), idOf(req)));
  };

  submit = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.submit(requireUser(req), idOf(req)));
  };

  withdraw = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.withdraw(requireUser(req), idOf(req)));
  };

  queue = async (req: Request, res: Response): Promise<void> => {
    const { kind } = validatedQuery<{ kind?: "problem" | "question" | "application" }>(req);
    ok(res, { items: await this.contributions.queue(kind) });
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.approve(requireUser(req), idOf(req), validatedBody<ReviewInput>(req).note));
  };

  reject = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.contributions.reject(requireUser(req), idOf(req), validatedBody<ReviewInput>(req).note));
  };
}
