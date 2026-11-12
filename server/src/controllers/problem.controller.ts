/**
 * HTTP adapter for the problem bank, reports and AI generation.
 *
 *   GET    /api/v1/problems                 listing (no test cases, no secrets)
 *   GET    /api/v1/problems/stats           counts per difficulty
 *   GET    /api/v1/problems/mine            the caller's own problems
 *   POST   /api/v1/problems/summaries       summaries by ids/slugs
 *   GET    /api/v1/problems/:idOrSlug       detail; secrets for admins only
 *   POST   /api/v1/problems                 signed-in
 *   PUT    /api/v1/problems/:id             admin
 *   DELETE /api/v1/problems/:id             admin
 *   GET    /api/v1/problem-reports/mine     the caller's open report
 *   GET    /api/v1/problem-reports          admin triage list
 *   POST   /api/v1/problem-reports          signed-in
 *   PATCH  /api/v1/problem-reports/:id      admin
 *   POST   /api/v1/generate                 admin, platform key
 *   POST   /api/v1/generate/public          signed-in, own key
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate.ts";
import type { ReportStatus } from "../models/ProblemReport.ts";
import type { ProblemService } from "../services/problem/problem.service.ts";
import type { ProblemGenerationService } from "../services/problem/problemGeneration.service.ts";
import type { ProblemReportService } from "../services/problem/problemReport.service.ts";
import { created, ok } from "../utils/respond.ts";
import type {
  CreateProblemInput,
  CreateReportInput,
  GenerateInput,
  GeneratePublicInput,
  SummariesInput,
  UpdateProblemInput,
  UpdateReportInput,
} from "../validation/problem.schema.ts";

/** A response to a non-admin never carries the hidden cases or the solution. */
function withoutSecrets<T extends object>(problem: T): Omit<T, "hiddenTestCases" | "solution"> {
  const rest = { ...problem } as Record<string, unknown>;
  delete rest.hiddenTestCases;
  delete rest.solution;
  return rest as Omit<T, "hiddenTestCases" | "solution">;
}

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

export class ProblemController {
  constructor(private readonly problems: ProblemService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.problems.list(validatedQuery<{ difficulty?: string; category?: string }>(req)));
  };

  stats = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.problems.stats());
  };

  mine = async (req: Request, res: Response): Promise<void> => {
    const { limit } = validatedQuery<{ limit: number }>(req);
    ok(res, await this.problems.listMine(requireUser(req), limit));
  };

  summaries = async (req: Request, res: Response): Promise<void> => {
    const body = validatedBody<SummariesInput>(req);
    ok(res, await this.problems.summaries({ ...(body.ids ? { ids: body.ids } : {}), ...(body.slugs ? { slugs: body.slugs } : {}) }, body.limit));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, await this.problems.get(id, req.auth?.userId));
  };

  solution = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, await this.problems.solution(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const problem = await this.problems.create(validatedBody<CreateProblemInput>(req), requireUser(req));
    created(res, withoutSecrets(problem), `/api/v1/problems/${String(problem._id)}`);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, await this.problems.update(id, validatedBody<UpdateProblemInput>(req)));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    await this.problems.delete(id);
    // 200 with a body, not 204: the web client's apiRequest parses every response as JSON.
    ok(res, { id });
  };
}

export class ProblemReportController {
  constructor(private readonly reports: ProblemReportService) {}

  mine = async (req: Request, res: Response): Promise<void> => {
    const { problemId } = validatedQuery<{ problemId: string }>(req);
    ok(res, { report: await this.reports.mine(problemId, requireUser(req)) });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { status } = validatedQuery<{ status: ReportStatus }>(req);
    ok(res, { reports: await this.reports.listByStatus(status) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const result = await this.reports.create(validatedBody<CreateReportInput>(req), requireUser(req));
    if (result.alreadyReported) ok(res, result);
    else created(res, result);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, { report: await this.reports.update(id, validatedBody<UpdateReportInput>(req), requireUser(req)) });
  };
}

export class ProblemGenerationController {
  constructor(private readonly generation: ProblemGenerationService) {}

  /** Admin only, so the full document (solution included) is returned. */
  generate = async (req: Request, res: Response): Promise<void> => {
    requireUser(req);
    const problem = await this.generation.generateAsAdmin(validatedBody<GenerateInput>(req));
    created(res, problem, `/api/v1/problems/${String(problem._id)}`);
  };

  generatePublic = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUser(req);
    const { geminiApiKey, ...request } = validatedBody<GeneratePublicInput>(req);
    const problem = await this.generation.generateWithOwnKey(request, geminiApiKey, userId);
    created(res, withoutSecrets(problem), `/api/v1/problems/${String(problem._id)}`);
  };
}
