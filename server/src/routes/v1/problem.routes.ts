import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type {
  ProblemController,
  ProblemGenerationController,
  ProblemReportController,
} from "../../controllers/problem.controller.ts";
import { optionalAuth, requireAdmin, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  createProblemSchema,
  createReportSchema,
  generatePublicSchema,
  generateSchema,
  listProblemsQuerySchema,
  listReportsQuerySchema,
  mineQuerySchema,
  mineReportQuerySchema,
  problemIdParamsSchema,
  problemKeyParamsSchema,
  summariesSchema,
  updateProblemSchema,
  updateReportSchema,
} from "../../validation/problem.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });

export function problemRoutes(c: ProblemController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);

  router.get("/", validate({ query: listProblemsQuerySchema }), c.list);
  router.get("/stats", c.stats);
  router.get("/mine", auth, validate({ query: mineQuerySchema }), c.mine);
  // A read, but POST so a long key list is not limited by URL length. No auth: summaries are public.
  router.post("/summaries", json(), validate({ body: summariesSchema }), c.summaries);
  // Public; an admin's token adds the hidden cases and solution.
  router.get("/:id", optionalAuth(verifier), validate({ params: problemKeyParamsSchema }), c.get);
  // On demand only (the "Show solution" button). Public, as the page always was.
  router.get("/:id/solution", createLimiter("global"), validate({ params: problemKeyParamsSchema }), c.solution);

  router.post("/", auth, createLimiter("write"), json(), validate({ body: createProblemSchema }), c.create);
  router.put(
    "/:id",
    auth,
    requireAdmin(),
    createLimiter("write"),
    json(),
    validate({ params: problemIdParamsSchema, body: updateProblemSchema }),
    c.update,
  );
  router.delete("/:id", auth, requireAdmin(), createLimiter("write"), validate({ params: problemIdParamsSchema }), c.remove);

  return router;
}

export function problemReportRoutes(c: ProblemReportController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);

  router.get("/mine", auth, validate({ query: mineReportQuerySchema }), c.mine);
  router.get("/", auth, requireAdmin(), validate({ query: listReportsQuerySchema }), c.list);
  router.post("/", auth, createLimiter("write"), json(), validate({ body: createReportSchema }), c.create);
  router.patch(
    "/:id",
    auth,
    requireAdmin(),
    createLimiter("write"),
    json(),
    validate({ params: problemIdParamsSchema, body: updateReportSchema }),
    c.update,
  );

  return router;
}

export function problemGenerationRoutes(c: ProblemGenerationController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);

  router.post("/", auth, requireAdmin(), createLimiter("generation"), createLimiter("aiDaily"), json(), validate({ body: generateSchema }), c.generate);
  // The caller's own key, but it still writes to the problem bank: same limits.
  router.post("/public", auth, createLimiter("generation"), createLimiter("aiDaily"), json(), validate({ body: generatePublicSchema }), c.generatePublic);

  return router;
}
