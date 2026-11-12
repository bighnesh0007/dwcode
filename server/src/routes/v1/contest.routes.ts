import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { ContestController } from "../../controllers/contest.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import { contestParamsSchema, createContestSchema, joinByCodeSchema } from "../../validation/contest.schema.ts";
import type { TokenVerifier } from "../../types/ports.ts";

export function contestRoutes(controller: ContestController, verifier: TokenVerifier): Router {
  const router = Router();
  const json = express.json({ limit: LIMITS.body.default });
  // Auth before the limiter so the `write` policy keys on the user.
  const write = [requireAuth(verifier), createLimiter("write")];

  router.get("/", optionalAuth(verifier), controller.list);
  router.post("/", ...write, json, validate({ body: createContestSchema }), controller.create);
  // Registered before /:id so "join-by-code" is never read as an id.
  router.post("/join-by-code", ...write, json, validate({ body: joinByCodeSchema }), controller.joinByCode);

  router.get("/:id", optionalAuth(verifier), validate({ params: contestParamsSchema }), controller.detail);
  router.post("/:id/join", ...write, validate({ params: contestParamsSchema }), controller.join);
  router.post("/:id/leave", ...write, validate({ params: contestParamsSchema }), controller.leave);
  router.delete("/:id", ...write, validate({ params: contestParamsSchema }), controller.remove);

  return router;
}
