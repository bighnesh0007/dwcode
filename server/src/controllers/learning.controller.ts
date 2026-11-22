/**
 * HTTP adapter for learning paths and certification prep.
 *
 *   GET  /api/v1/learning/me                               auth    onboarding, placement, roadmap
 *   PUT  /api/v1/learning/onboarding                       auth    { role, level, goal, hours, roadmapId? }
 *   GET  /api/v1/learning/placement                        public  questions, no answers
 *   POST /api/v1/learning/placement                        public  { answers } → level (kept when signed in)
 *   GET  /api/v1/learning/roadmaps                         public
 *   GET  /api/v1/learning/roadmaps/:id                     public; progress and weekly plan when signed in
 *   POST /api/v1/learning/roadmaps/:id/choose              auth
 *   POST /api/v1/learning/roadmaps/:id/steps/:stepId/quiz  auth    { answers }
 *   GET  /api/v1/certification                             public  exam outline
 *   POST /api/v1/certification/mock                        auth    a new mock (seed + questions)
 *   POST /api/v1/certification/mock/grade                  auth    { seed, answers }
 *   GET  /api/v1/certification/review                      auth    questions due
 *   POST /api/v1/certification/review/:id                  auth    { answer }
 *   GET  /api/v1/certification/readiness                   auth
 */
import type { Request, Response } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import { validatedBody, validatedParams } from "../middleware/validate.ts";
import type { LearningService } from "../services/learning/learning.service.ts";
import { ok } from "../utils/respond.ts";
import type { AnswersInput, GradeMockInput, OnboardingInput, ReviewAnswerInput } from "../validation/learning.schema.ts";

function requireUser(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) throw new UnauthenticatedError("Authentication required.");
  return userId;
}

export class LearningController {
  constructor(private readonly learning: LearningService) {}

  me = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.learning.me(requireUser(req)));
  };

  saveOnboarding = async (req: Request, res: Response): Promise<void> => {
    const { roadmapId, ...onboarding } = validatedBody<OnboardingInput>(req);
    ok(res, await this.learning.saveOnboarding(requireUser(req), onboarding, roadmapId));
  };

  placementQuiz = (_req: Request, res: Response): void => {
    ok(res, this.learning.placementQuiz());
  };

  gradePlacement = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.learning.gradePlacement(req.auth?.userId, validatedBody<AnswersInput>(req).answers));
  };

  roadmaps = (_req: Request, res: Response): void => {
    ok(res, { roadmaps: this.learning.roadmaps() });
  };

  roadmap = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.learning.roadmap(validatedParams<{ id: string }>(req).id, req.auth?.userId));
  };

  chooseRoadmap = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.learning.chooseRoadmap(requireUser(req), validatedParams<{ id: string }>(req).id));
  };

  gradeQuiz = async (req: Request, res: Response): Promise<void> => {
    const { id, stepId } = validatedParams<{ id: string; stepId: string }>(req);
    ok(res, await this.learning.gradeQuiz(requireUser(req), id, stepId, validatedBody<AnswersInput>(req).answers));
  };

  exam = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.learning.exam());
  };

  startMock = async (req: Request, res: Response): Promise<void> => {
    requireUser(req);
    ok(res, await this.learning.startMock());
  };

  gradeMock = async (req: Request, res: Response): Promise<void> => {
    const { seed, answers } = validatedBody<GradeMockInput>(req);
    ok(res, await this.learning.gradeMock(requireUser(req), seed, answers));
  };

  reviewQueue = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.learning.reviewQueue(requireUser(req)));
  };

  answerReview = async (req: Request, res: Response): Promise<void> => {
    const { id } = validatedParams<{ id: string }>(req);
    ok(res, await this.learning.answerReview(requireUser(req), id, validatedBody<ReviewAnswerInput>(req).answer));
  };

  readiness = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.learning.readiness(requireUser(req)));
  };
}
