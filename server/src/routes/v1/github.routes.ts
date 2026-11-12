import { Router } from "express";
import type { GitHubController } from "../../controllers/github.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import { callbackQuerySchema, connectQuerySchema } from "../../validation/github.schema.ts";

export function githubRoutes(controller: GitHubController, verifier: TokenVerifier): Router {
  const router = Router();

  // Browser navigations: optionalAuth so a signed-out user is redirected to
  // sign-in rather than shown a JSON 401.
  router.get("/connect", createLimiter("auth"), optionalAuth(verifier), validate({ query: connectQuerySchema }), controller.connect);
  // The signed state, not the session, identifies the user here: Clerk's
  // short-lived session cookie may have expired during the GitHub round trip.
  router.get("/callback", createLimiter("auth"), optionalAuth(verifier), validate({ query: callbackQuerySchema }), controller.callback);

  router.get("/status", requireAuth(verifier), controller.status);
  router.post("/disconnect", requireAuth(verifier), createLimiter("write"), controller.disconnect);
  return router;
}
