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
  router.get("/", auth, createLimiter("read"), c.list);
  router.get("/unread", auth, createLimiter("read"), c.unread);
  router.post("/read", auth, createLimiter("write"), json(), validate({ body: markReadSchema }), c.markRead);
  return router;
}

/** /api/v1/announcement */
export function announcementRoutes(c: NotificationsController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", createLimiter("read"), c.announcement);
  router.put("/", requireAuth(verifier), requireAdmin(), createLimiter("write"), json(), validate({ body: announcementSchema }), c.setAnnouncement);
  return router;
}
