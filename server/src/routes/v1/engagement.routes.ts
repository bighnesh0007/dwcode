import { Router } from "express";
import type { EngagementController } from "../../controllers/engagement.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import type { TokenVerifier } from "../../types/ports.ts";

/** /api/v1/daily */
export function dailyRoutes(c: EngagementController, verifier: TokenVerifier): Router {
  const router = Router();
  // Limiter before auth, so token verification is capped too (keyed by IP).
  router.get("/", createLimiter("read"), optionalAuth(verifier), c.daily);
  return router;
}

/** /api/v1/engagement */
export function engagementRoutes(c: EngagementController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/me", createLimiter("read"), requireAuth(verifier), c.progress);
  return router;
}
