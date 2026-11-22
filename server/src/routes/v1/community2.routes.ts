import express, { Router } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { Community2Controller } from "../../controllers/community2.controller.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import { aboutSchema, askSchema, emailPrefsSchema, equipSchema, mentorSchema, usernameParamSchema } from "../../validation/profileExtras.schema.ts";

const json = () => express.json({ limit: LIMITS.body.default });

/** /api/v1/profile-details */
export function profileDetailRoutes(c: Community2Controller, verifier: TokenVerifier): Router {
  const router = Router();
  const auth = requireAuth(verifier);
  router.get("/me", createLimiter("read"), auth, c.mine);
  router.put("/me", createLimiter("write"), auth, json(), validate({ body: aboutSchema }), c.updateAbout);
  router.put("/equip", createLimiter("write"), auth, json(), validate({ body: equipSchema }), c.equip);
  router.put("/mentor", createLimiter("write"), auth, json(), validate({ body: mentorSchema }), c.setMentor);
  router.get("/email", createLimiter("read"), auth, c.emailPrefs);
  router.put("/email", createLimiter("write"), auth, json(), validate({ body: emailPrefsSchema }), c.setEmailPrefs);
  router.get("/u/:username", createLimiter("read"), validate({ params: usernameParamSchema }), c.publicView);
  return router;
}

/** /api/v1/feed */
export function feedRoutes(c: Community2Controller, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", createLimiter("read"), requireAuth(verifier), c.feed);
  return router;
}

/** /api/v1/mentors */
export function mentorRoutes(c: Community2Controller, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", createLimiter("read"), c.mentors);
  router.post("/:username/ask", createLimiter("write"), requireAuth(verifier), json(), validate({ params: usernameParamSchema, body: askSchema }), c.ask);
  return router;
}

/** /api/v1/jobs */
export function jobRoutes(c: Community2Controller): Router {
  const router = Router();
  router.get("/", createLimiter("read"), c.jobs);
  return router;
}
