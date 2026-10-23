import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { AdminController } from "../../controllers/admin.controller.ts";
import { requireAdmin, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import { grantRoleSchema, roleParamsSchema } from "../../validation/admin.schema.ts";

/** Every route is admin-only; role changes are further restricted to the super admin in the service. */
export function adminRoutes(controller: AdminController, verifier: TokenVerifier): Router {
  const router = Router();
  router.use(requireAuth(verifier), requireAdmin());

  router.get("/users", controller.users);
  router.get("/roles", controller.roles);
  router.post(
    "/roles",
    createLimiter("write"),
    express.json({ limit: LIMITS.body.default }),
    validate({ body: grantRoleSchema }),
    controller.grant,
  );
  router.delete("/roles/:userId", createLimiter("write"), validate({ params: roleParamsSchema }), controller.revoke);
  return router;
}
