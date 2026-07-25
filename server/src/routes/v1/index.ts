import { Router } from "express";
import type { Container } from "../../container.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { v1Cors } from "../../middleware/security.ts";
import { sponsorshipRoutes } from "./sponsorship.routes.ts";

/**
 * The `/api/v1` surface.
 *
 * CORS is allowlisted here (unlike the legacy router, which stays wide open), and a
 * global limiter sits in front of every domain router. Body parsing is per-route, not
 * global, so the webhook can receive raw bytes.
 */
export function v1Routes(container: Container): Router {
  const router = Router();

  router.use(v1Cors());
  router.use(createLimiter("global"));

  router.use(
    "/sponsorship",
    sponsorshipRoutes(container.sponsorshipController, container.tokenVerifier),
  );

  return router;
}
