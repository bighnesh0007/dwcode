import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { CompetitionController } from "../../controllers/competition.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  contestIdParamsSchema,
  countrySchema,
  createTeamSchema,
  joinTeamSchema,
  listedSchema,
  removeMemberSchema,
  teamSlugParamsSchema,
  usernameParamsSchema,
} from "../../validation/competition.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });

/** Mounted at /api/v1/contests, beside the contests router: only /:id/standings. */
export function standingsRoutes(c: CompetitionController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/:id/standings", createLimiter("read"), optionalAuth(verifier), validate({ params: contestIdParamsSchema }), c.standings);
  return router;
}

/** /api/v1/ratings */
export function ratingRoutes(c: CompetitionController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", createLimiter("read"), c.ratings);
  router.get("/me", createLimiter("read"), requireAuth(verifier), c.myRating);
  router.get("/u/:username", createLimiter("read"), validate({ params: usernameParamsSchema }), c.userRating);
  return router;
}

/** /api/v1/teams */
export function teamRoutes(c: CompetitionController, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  const write = createLimiter("write");
  router.get("/", createLimiter("read"), c.teamDirectory);
  router.post("/", write, auth, json(), validate({ body: createTeamSchema }), c.createTeam);
  router.get("/mine", createLimiter("read"), auth, c.myTeam);
  router.post("/join", write, auth, json(), validate({ body: joinTeamSchema }), c.joinTeam);
  router.get("/:slug", createLimiter("read"), optionalAuth(verifier), validate({ params: teamSlugParamsSchema }), c.team);
  router.post("/:slug/leave", write, auth, validate({ params: teamSlugParamsSchema }), c.leaveTeam);
  router.post("/:slug/remove", write, auth, json(), validate({ params: teamSlugParamsSchema, body: removeMemberSchema }), c.removeMember);
  router.post("/:slug/listed", write, auth, json(), validate({ params: teamSlugParamsSchema, body: listedSchema }), c.setListed);
  return router;
}

/** /api/v1/leaderboards */
export function groupLeaderboardRoutes(c: CompetitionController): Router {
  const router = Router();
  router.get("/teams", createLimiter("read"), c.teamLeaderboard);
  router.get("/countries", createLimiter("read"), c.countryLeaderboard);
  return router;
}

/** /api/v1/profile-country */
export function countryRoutes(c: CompetitionController, verifier: TokenVerifier): Router {
  const router = Router();
  router.put("/", createLimiter("write"), requireAuth(verifier), json(), validate({ body: countrySchema }), c.setCountry);
  return router;
}
