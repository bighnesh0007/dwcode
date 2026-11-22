import express, { Router } from "express";
import type { OpsController } from "../../controllers/ops.controller.ts";
import { requireAdmin, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  auditQuerySchema,
  clientErrorSchema,
  cspReportSchema,
  errorsQuerySchema,
  fingerprintParamsSchema,
  moderateSchema,
  moderationParamsSchema,
  pageViewSchema,
} from "../../validation/ops.schema.ts";

const small = (type: string | string[] = "application/json") => express.json({ limit: "16kb", type });

/** /api/v1/telemetry — anonymous, small, rate-limited. */
export function telemetryRoutes(c: OpsController): Router {
  const router = Router();
  router.post("/error", createLimiter("write"), small(), validate({ body: clientErrorSchema }), c.clientError);
  router.post("/csp", createLimiter("write"), small(["application/csp-report", "application/json"]), validate({ body: cspReportSchema }), c.csp);
  router.post("/pageview", createLimiter("read"), small(), validate({ body: pageViewSchema }), c.pageView);
  return router;
}

/** /api/v1/admin/ops — admin only. */
export function opsAdminRoutes(c: OpsController, verifier: TokenVerifier): Router {
  const router = Router();
  const admin = [requireAuth(verifier), requireAdmin()];
  router.get("/analytics", createLimiter("read"), ...admin, c.analytics);
  router.get("/audit", createLimiter("read"), ...admin, validate({ query: auditQuerySchema }), c.audit);
  router.get("/moderation", createLimiter("read"), ...admin, c.moderation);
  router.put("/moderation", createLimiter("write"), ...admin, small(), validate({ body: moderateSchema }), c.moderate);
  router.delete("/moderation/:kind/:ref", createLimiter("write"), ...admin, validate({ params: moderationParamsSchema }), c.unmoderate);
  router.get("/errors", createLimiter("read"), ...admin, validate({ query: errorsQuerySchema }), c.errors);
  router.post("/errors/:fingerprint/resolve", createLimiter("write"), ...admin, validate({ params: fingerprintParamsSchema }), c.resolveError);
  return router;
}
