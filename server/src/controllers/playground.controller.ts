/**
 * HTTP adapter for playground sharing and GitHub import/publish.
 *
 *   POST /api/v1/playground/shares             anyone  — 201 { id }
 *   GET  /api/v1/playground/shares/:id         anyone
 *   GET  /api/v1/playground/github/files?repo= user    — list a repo's files
 *   GET  /api/v1/playground/github/file?repo=&path=   user — one file's content
 *   POST /api/v1/playground/github/push        user    — commit a run
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate.ts";
import type { PlaygroundGitHubService } from "../services/github/playgroundGitHub.service.ts";
import type { PlaygroundShareService } from "../services/playground/share.service.ts";
import { created, ok } from "../utils/respond.ts";
import type { PushInput, ShareInput } from "../validation/playground.schema.ts";

export class PlaygroundController {
  constructor(
    private readonly shares: PlaygroundShareService,
    private readonly github: PlaygroundGitHubService,
  ) {}

  createShare = async (req: Request, res: Response): Promise<void> => {
    const id = await this.shares.create(validatedBody<ShareInput>(req), req.auth?.userId);
    created(res, { id }, `/api/v1/playground/shares/${id}`);
  };

  loadShare = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, await this.shares.load(id));
  };

  listFiles = async (req: Request, res: Response): Promise<void> => {
    const { repo } = validatedQuery<{ repo: string }>(req);
    ok(res, await this.github.listFiles(requireUser(req), repo));
  };

  importFile = async (req: Request, res: Response): Promise<void> => {
    const { repo, path } = validatedQuery<{ repo: string; path: string }>(req);
    ok(res, await this.github.importFile(requireUser(req), repo, path));
  };

  push = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.github.publish(requireUser(req), validatedBody<PushInput>(req)));
  };
}

function requireUser(req: Request): string {
  const id = req.auth?.userId;
  if (!id) throw new UnauthenticatedError("Sign in to use GitHub.");
  return id;
}
