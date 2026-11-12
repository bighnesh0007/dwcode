import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { CompilerController } from "../../controllers/compiler.controller.ts";
import { optionalAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import { runSchema } from "../../validation/compiler.schema.ts";
import type { TokenVerifier } from "../../types/ports.ts";

export function compilerRoutes(controller: CompilerController, verifier: TokenVerifier): Router {
  const router = Router();

  // Order matters: auth first so the limiter can key on the user (falling back
  // to IP when signed out), and the limiter before the body parser so a flood
  // is refused before its bytes are parsed. No sanitizeBody: scripts are code,
  // and "sanitising" them would change what the user wrote.
  router.post(
    "/run",
    optionalAuth(verifier),
    createLimiter("compiler"),
    express.json({ limit: LIMITS.body.default }),
    validate({ body: runSchema }),
    controller.run,
  );

  return router;
}
