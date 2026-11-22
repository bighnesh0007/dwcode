import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { ContributionController } from "../../controllers/contribution.controller.ts";
import { requireAdmin, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  contributionParamsSchema,
  createContributionSchema,
  queueQuerySchema,
  reviewSchema,
  updateContributionSchema,
} from "../../validation/contribution.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });
const params = validate({ params: contributionParamsSchema });

/** /api/v1/contributions — the author's own contributions. */
export function contributionRoutes(c: ContributionController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  router.get("/", createLimiter("read"), auth, c.mine);
  router.post("/", createLimiter("write"), auth, json(), validate({ body: createContributionSchema }), c.create);
  router.get("/:id", createLimiter("read"), auth, params, c.get);
  router.put("/:id", createLimiter("write"), auth, json(), validate({ params: contributionParamsSchema, body: updateContributionSchema }), c.update);
  router.delete("/:id", createLimiter("write"), auth, params, c.remove);
  // Each check runs the solution once per case on the compiler: the AI budget caps it per user.
  router.post("/:id/check", createLimiter("read"), auth, createLimiter("ai"), params, c.check);
  router.post("/:id/submit", createLimiter("write"), auth, params, c.submit);
  router.post("/:id/withdraw", createLimiter("write"), auth, params, c.withdraw);
  return router;
}

/** /api/v1/admin/contributions — the review queue. */
export function contributionReviewRoutes(c: ContributionController, verifier: TokenVerifier): Router {
  const router = Router();
  const admin = [requireAuth(verifier), requireAdmin()];
  router.get("/", createLimiter("read"), ...admin, validate({ query: queueQuerySchema }), c.queue);
  router.post("/:id/approve", createLimiter("write"), ...admin, json(), validate({ params: contributionParamsSchema, body: reviewSchema }), c.approve);
  router.post("/:id/reject", createLimiter("write"), ...admin, json(), validate({ params: contributionParamsSchema, body: reviewSchema }), c.reject);
  return router;
}
