import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { LearningController } from "../../controllers/learning.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  answersSchema,
  gradeMockSchema,
  onboardingSchema,
  questionParamsSchema,
  reviewAnswerSchema,
  roadmapParamsSchema,
  stepParamsSchema,
} from "../../validation/learning.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });

/** /api/v1/learning */
export function learningRoutes(c: LearningController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  const maybe = optionalAuth(verifier);
  router.get("/me", createLimiter("read"), auth, c.me);
  router.put("/onboarding", createLimiter("write"), auth, json(), validate({ body: onboardingSchema }), c.saveOnboarding);
  router.get("/placement", createLimiter("read"), c.placementQuiz);
  router.post("/placement", createLimiter("write"), maybe, json(), validate({ body: answersSchema }), c.gradePlacement);
  router.get("/roadmaps", createLimiter("read"), c.roadmaps);
  router.get("/roadmaps/:id", createLimiter("read"), maybe, validate({ params: roadmapParamsSchema }), c.roadmap);
  router.post("/roadmaps/:id/choose", createLimiter("write"), auth, validate({ params: roadmapParamsSchema }), c.chooseRoadmap);
  router.post(
    "/roadmaps/:id/steps/:stepId/quiz",
    createLimiter("write"), auth, json(), validate({ params: stepParamsSchema, body: answersSchema }), c.gradeQuiz,
  );
  return router;
}

/** /api/v1/certification */
export function certificationRoutes(c: LearningController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  router.get("/", createLimiter("read"), c.exam);
  router.post("/mock", createLimiter("write"), auth, c.startMock);
  router.post("/mock/grade", createLimiter("write"), auth, json(), validate({ body: gradeMockSchema }), c.gradeMock);
  router.get("/review", createLimiter("read"), auth, c.reviewQueue);
  router.post("/review/:id", createLimiter("write"), auth, json(), validate({ params: questionParamsSchema, body: reviewAnswerSchema }), c.answerReview);
  router.get("/readiness", createLimiter("read"), auth, c.readiness);
  return router;
}
