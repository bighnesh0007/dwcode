/**
 * HTTP adapter for practice modes.
 *
 *   POST /api/v1/interview/start      auth   { preset }
 *   GET  /api/v1/interview/current    auth   the session and live outcomes, or null
 *   POST /api/v1/interview/finish     auth   end it and return the scorecard
 *   GET  /api/v1/code-size/:slug      public; `mine` when signed in
 *   POST /api/v1/explain              auth   { code, error } → plain-English explanation
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams } from "../middleware/validate.ts";
import type { CodeSizeService } from "../services/practice/codeSize.service.ts";
import type { ExplainService } from "../services/practice/explain.service.ts";
import type { InterviewService } from "../services/practice/interview.service.ts";
import { ok } from "../utils/respond.ts";
import type { ExplainInput, StartInterviewInput } from "../validation/practice.schema.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

export class PracticeController {
  constructor(
    private readonly interviews: InterviewService,
    private readonly sizes: CodeSizeService,
    private readonly explainer: ExplainService,
  ) {}

  startInterview = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.interviews.start(requireUser(req), validatedBody<StartInterviewInput>(req).preset));
  };

  currentInterview = async (req: Request, res: Response): Promise<void> => {
    ok(res, { interview: await this.interviews.current(requireUser(req)) });
  };

  finishInterview = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.interviews.finish(requireUser(req)));
  };

  codeSize = async (req: Request, res: Response): Promise<void> => {
    const { slug } = validatedParams<{ slug: string }>(req);
    ok(res, await this.sizes.ranking(slug, req.auth?.userId));
  };

  explain = async (req: Request, res: Response): Promise<void> => {
    requireUser(req);
    const body = validatedBody<ExplainInput>(req);
    ok(res, await this.explainer.explain(body.code, body.error));
  };
}
