import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { PracticeController } from "../../controllers/practice.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import { explainSchema, sizeParamsSchema, startInterviewSchema } from "../../validation/practice.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });

/** /api/v1/interview */
export function interviewRoutes(c: PracticeController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  router.post("/start", createLimiter("write"), auth, json(), validate({ body: startInterviewSchema }), c.startInterview);
  router.get("/current", createLimiter("read"), auth, c.currentInterview);
  router.post("/finish", createLimiter("write"), auth, c.finishInterview);
  return router;
}

/** /api/v1/code-size */
export function codeSizeRoutes(c: PracticeController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/:slug", createLimiter("read"), optionalAuth(verifier), validate({ params: sizeParamsSchema }), c.codeSize);
  return router;
}

/** /api/v1/explain */
export function explainRoutes(c: PracticeController, verifier: TokenVerifier): Router {
  const router = Router();
  // IP-capped before auth, then the per-user AI budget once the user is known.
  router.post("/", createLimiter("read"), requireAuth(verifier), createLimiter("ai"), json(), validate({ body: explainSchema }), c.explain);
  return router;
}
