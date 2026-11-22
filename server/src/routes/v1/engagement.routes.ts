import { Router } from "express";
import type { EngagementController } from "../../controllers/engagement.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import type { TokenVerifier } from "../../types/ports.ts";

/** /api/v1/daily */
export function dailyRoutes(c: EngagementController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", optionalAuth(verifier), c.daily);
  return router;
}

/** /api/v1/engagement */
export function engagementRoutes(c: EngagementController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/me", requireAuth(verifier), c.progress);
  return router;
}
