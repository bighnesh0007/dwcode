import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { PlaygroundController } from "../../controllers/playground.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  pushSchema,
  repoFileQuerySchema,
  repoFilesQuerySchema,
  shareParamsSchema,
  shareSchema,
} from "../../validation/playground.schema.ts";

/** 12 files × 100k chars plus test copies: the default 1mb is too small for a full share. */
const SHARE_BODY_LIMIT = "5mb";

export function playgroundRoutes(controller: PlaygroundController, verifier: TokenVerifier): Router {
  const router = Router();

  // Sharing works signed out, as before; the owner is recorded when known.
  router.post(
    "/shares",
    optionalAuth(verifier),
    createLimiter("write"),
    express.json({ limit: SHARE_BODY_LIMIT }),
    validate({ body: shareSchema }),
    controller.createShare,
  );
  router.get("/shares/:id", validate({ params: shareParamsSchema }), controller.loadShare);

  router.get("/github/files", requireAuth(verifier), validate({ query: repoFilesQuerySchema }), controller.listFiles);
  router.get("/github/file", requireAuth(verifier), validate({ query: repoFileQuerySchema }), controller.importFile);
  router.post(
    "/github/push",
    requireAuth(verifier),
    createLimiter("write"),
    express.json({ limit: LIMITS.body.legacy }),
    validate({ body: pushSchema }),
    controller.push,
  );
  return router;
}
