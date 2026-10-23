import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { UsersController } from "../../controllers/users.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  emptyBodySchema,
  followSchema,
  leaderboardQuerySchema,
  purchaseSchema,
  updateIdentitySchema,
  usernameParamsSchema,
} from "../../validation/users.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });

/** /api/v1/profile */
export function profileRoutes(c: UsersController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  router.get("/", auth, c.dashboard);
  router.get("/u/:username", optionalAuth(verifier), validate({ params: usernameParamsSchema }), c.publicProfile);
  router.post("/setup", auth, createLimiter("write"), json(), validate({ body: emptyBodySchema }), c.setup);
  router.put("/username", auth, createLimiter("write"), json(), validate({ body: updateIdentitySchema }), c.updateIdentity);
  router.post("/follow", auth, createLimiter("write"), json(), validate({ body: followSchema }), c.follow);
  return router;
}

/** /api/v1/coins */
export function coinsRoutes(c: UsersController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", requireAuth(verifier), c.coinSummary);
  return router;
}

/** /api/v1/store — browsable anonymously; buying needs sign-in. */
export function storeRoutes(c: UsersController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", optionalAuth(verifier), c.catalogue);
  router.post("/", requireAuth(verifier), createLimiter("write"), json(), validate({ body: purchaseSchema }), c.purchase);
  return router;
}

/** /api/v1/leaderboard — public; `me` is filled when signed in. */
export function leaderboardRoutes(c: UsersController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", optionalAuth(verifier), validate({ query: leaderboardQuerySchema }), c.leaderboard);
  return router;
}

/** /api/v1/guest-progress — disabled: 503 before auth or body, as the old route. */
export function guestProgressRoutes(c: UsersController): Router {
  const router = Router();
  router.post("/", c.migrateGuestProgress);
  return router;
}
