import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { SubmissionController } from "../../controllers/submission.controller.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import { jobParamsSchema, listQuerySchema, submitSchema } from "../../validation/submission.schema.ts";
import type { TokenVerifier } from "../../types/ports.ts";

export function submissionRoutes(controller: SubmissionController, verifier: TokenVerifier): Router {
  const router = Router();

  // Auth before the limiter so the `submission` policy (12/min) keys on the user.
  router.post(
    "/",
    requireAuth(verifier),
    createLimiter("submission"),
    express.json({ limit: LIMITS.body.default }),
    validate({ body: submitSchema }),
    controller.submit,
  );

  // Polled while grading runs, so it gets the looser `global` limit only.
  router.get("/jobs/:jobId", requireAuth(verifier), validate({ params: jobParamsSchema }), controller.job);

  router.get("/", requireAuth(verifier), validate({ query: listQuerySchema }), controller.list);
  router.get("/progress", requireAuth(verifier), controller.progress);
  router.get("/stats", requireAuth(verifier), controller.stats);

  return router;
}
