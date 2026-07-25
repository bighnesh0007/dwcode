/**
 * FROZEN legacy routes: `POST /api/transform`, `GET /health`, `GET /healthcheck`.
 *
 * Self-contained on purpose — own CORS, own body parser, own error handler — so that
 * no refactor inside `/api/v1` can change what these three endpoints return. This
 * router is mounted FIRST in routes/index.ts.
 */
import express, { Router } from "express";
import type { LegacyTransformController } from "../../controllers/legacy/transform.legacy.controller.ts";
import { LIMITS } from "../../config/constants.ts";
import { legacyErrorHandler } from "../../middleware/legacyErrorHandler.ts";
import { legacyCors } from "../../middleware/security.ts";

export function legacyDataWeaveRoutes(controller: LegacyTransformController): Router {
  const router = Router();

  // Wide-open CORS, exactly as the original `app.use(cors())`.
  router.use(legacyCors());

  router.post(
    "/api/transform",
    express.json({ limit: LIMITS.body.legacy }),
    controller.transform,
  );

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/healthcheck", controller.healthcheck);

  // Router-scoped: keeps `{ error }` / 400 semantics away from the v1 envelope.
  router.use(legacyErrorHandler);

  return router;
}
