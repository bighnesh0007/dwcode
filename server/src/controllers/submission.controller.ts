/**
 * HTTP adapter for submissions.
 *
 *   POST /api/v1/submissions          202 { jobId } — graded in the background
 *   GET  /api/v1/submissions/jobs/:id the job's state; the verdict when done
 *   GET  /api/v1/submissions          the caller's history
 */
import type { Request, Response } from "express";
import { NotFoundError, UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate.ts";
import { accepted, ok } from "../utils/respond.ts";
import type { SubmissionRepository } from "../repositories/submission.repository.ts";
import type { JobQueue } from "../services/queue/jobQueue.ts";
import type { SubmitCommand, SubmitOutcome } from "../services/submission/submission.service.ts";
import type { SubmitInput } from "../validation/submission.schema.ts";

export class SubmissionController {
  constructor(
    private readonly queue: JobQueue<SubmitCommand, SubmitOutcome>,
    private readonly submissions: SubmissionRepository,
  ) {}

  submit = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const body = validatedBody<SubmitInput>(req);
    const { id } = await this.queue.enqueue({
      userId,
      problemId: body.problemId,
      code: body.code,
      ...(body.input === undefined ? {} : { input: body.input }),
    });
    res.location(`/api/v1/submissions/jobs/${id}`);
    accepted(res, { jobId: id, state: "queued" });
  };

  job = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { jobId } = validatedParams<{ jobId: string }>(req);
    const status = await this.queue.status(jobId);
    // Someone else's job is reported exactly like a missing one: a different
    // answer would confirm the id exists.
    if (status?.data.userId !== userId) throw new NotFoundError("Job not found.");
    ok(res, {
      jobId: status.id,
      state: status.state,
      ...(status.position === undefined ? {} : { position: status.position }),
      ...(status.result === undefined ? {} : { result: status.result }),
      ...(status.error === undefined ? {} : { error: status.error }),
    });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { limit } = validatedQuery<{ limit: number }>(req);
    ok(res, await this.submissions.listByUser(userId, limit));
  };
}

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Sign in to submit.");
  return userId;
}
