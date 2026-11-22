import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { NotificationsController } from "../../controllers/notifications.controller.ts";
import { requireAdmin, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import { announcementSchema, markReadSchema } from "../../validation/notifications.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });

/** /api/v1/notifications */
export function notificationRoutes(c: NotificationsController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  // Limiter BEFORE auth: token verification is itself work an unauthenticated
  // flood could force, so it must be capped too (keyed by IP at that point).
  router.get("/", createLimiter("read"), auth, c.list);
  router.get("/unread", createLimiter("read"), auth, c.unread);
  router.post("/read", createLimiter("write"), auth, json(), validate({ body: markReadSchema }), c.markRead);
  return router;
}

/** /api/v1/announcement */
export function announcementRoutes(c: NotificationsController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", createLimiter("read"), c.announcement);
  router.put("/", createLimiter("write"), requireAuth(verifier), requireAdmin(), json(), validate({ body: announcementSchema }), c.setAnnouncement);
  return router;
}
