/**
 * HTTP adapter for the GitHub link.
 *
 *   GET  /api/v1/github/connect?returnTo=  302 to GitHub (browser navigation)
 *   GET  /api/v1/github/callback           302 back to the site
 *   GET  /api/v1/github/status             the caller's link, never the token
 *   POST /api/v1/github/disconnect         remove the link
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedQuery } from "../middleware/validate.ts";
import type { GitHubRepository } from "../repositories/github.repository.ts";
import type { GitHubOAuthService } from "../services/github/githubOAuth.service.ts";
import { ok } from "../utils/respond.ts";

export class GitHubController {
  constructor(
    private readonly oauth: GitHubOAuthService,
    private readonly repo: GitHubRepository,
  ) {}

  connect = (req: Request, res: Response): void => {
    const userId = req.auth?.userId;
    if (!userId) {
      res.redirect(302, this.oauth.siteUrl("/sign-in"));
      return;
    }
    const { returnTo } = validatedQuery<{ returnTo?: string }>(req);
    res.redirect(302, this.oauth.authorizeUrl(userId, returnTo));
  };

  callback = async (req: Request, res: Response): Promise<void> => {
    const q = validatedQuery<{ code?: string; state?: string; error?: string }>(req);
    const target = await this.oauth.complete({
      ...(q.code === undefined ? {} : { code: q.code }),
      ...(q.state === undefined ? {} : { state: q.state }),
      ...(q.error === undefined ? {} : { error: q.error }),
      ...(req.auth?.userId ? { sessionUserId: req.auth.userId } : {}),
    });
    res.redirect(302, target);
  };

  status = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.repo.status(requireUser(req)));
  };

  disconnect = async (req: Request, res: Response): Promise<void> => {
    await this.repo.deleteLink(requireUser(req));
    ok(res, { connected: false });
  };
}

function requireUser(req: Request): string {
  const id = req.auth?.userId;
  if (!id) throw new UnauthenticatedError();
  return id;
}
