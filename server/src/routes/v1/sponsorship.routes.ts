import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { SponsorshipController } from "../../controllers/sponsorship.controller.ts";
import { optionalAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { sanitizeBody } from "../../middleware/security.ts";
import { validate } from "../../middleware/validate.ts";
import {
  createOrderSchema,
  publicSponsorsQuerySchema,
  verifyCallbackSchema,
} from "../../validation/sponsorship.schema.ts";
import type { TokenVerifier } from "../../types/ports.ts";

export function sponsorshipRoutes(
  controller: SponsorshipController,
  verifier: TokenVerifier,
): Router {
  const router = Router();
  const json = express.json({ limit: LIMITS.body.text });

  router.get("/config", controller.getConfig);

  router.get(
    "/sponsors",
    validate({ query: publicSponsorsQuerySchema }),
    controller.listSponsors,
  );

  // Anonymous donations are allowed, so auth is optional — but identity, when present,
  // is taken from the verified token rather than the body.
  router.post(
    "/orders",
    createLimiter("write"),
    json,
    sanitizeBody,
    optionalAuth(verifier),
    validate({ body: createOrderSchema }),
    controller.createOrder,
  );

  router.post(
    "/verify",
    createLimiter("write"),
    json,
    sanitizeBody,
    optionalAuth(verifier),
    validate({ body: verifyCallbackSchema }),
    controller.verify,
  );

  /*
   * The webhook needs the RAW bytes: the signature is an HMAC over exactly what
   * Razorpay sent, so `express.json()` here would irreversibly break verification.
   * It is also deliberately NOT rate-limited by user (Razorpay is not a user) and not
   * body-sanitised (that would mutate the signed payload).
   */
  router.post(
    "/webhook",
    express.raw({ type: "*/*", limit: LIMITS.body.text }),
    controller.webhook,
  );

  return router;
}
