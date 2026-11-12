import express, { Router, type RequestHandler } from "express";
import { LIMITS } from "../../config/constants.ts";
import type { CommunityController } from "../../controllers/community.controller.ts";
import { optionalAuth, requireAuth } from "../../middleware/auth.ts";
import { createLimiter } from "../../middleware/rateLimit.ts";
import { validate } from "../../middleware/validate.ts";
import type { TokenVerifier } from "../../types/ports.ts";
import {
  commentListQuerySchema,
  createBlogSchema,
  createCommentSchema,
  idParamsSchema,
  noteQuerySchema,
  saveNoteSchema,
  slugParamsSchema,
  toggleBookmarkSchema,
  voteSchema,
} from "../../validation/community.schema.ts";

/** Auth before the limiter so the `write` policy keys on the user. */
function writeGuard(verifier: TokenVerifier): RequestHandler[] {
  return [requireAuth(verifier), createLimiter("write")];
}

function json(): RequestHandler {
  return express.json({ limit: LIMITS.body.default });
}

export function commentRoutes(c: CommunityController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", validate({ query: commentListQuerySchema }), c.listComments);
  router.post("/", ...writeGuard(verifier), json(), validate({ body: createCommentSchema }), c.createComment);
  router.delete("/:id", ...writeGuard(verifier), validate({ params: idParamsSchema }), c.deleteComment);
  return router;
}

export function noteRoutes(c: CommunityController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", requireAuth(verifier), validate({ query: noteQuerySchema }), c.getNote);
  router.put("/", ...writeGuard(verifier), json(), validate({ body: saveNoteSchema }), c.saveNote);
  return router;
}

export function bookmarkRoutes(c: CommunityController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", optionalAuth(verifier), c.listBookmarks);
  router.post("/", ...writeGuard(verifier), json(), validate({ body: toggleBookmarkSchema }), c.toggleBookmark);
  return router;
}

export function blogRoutes(c: CommunityController, verifier: TokenVerifier): Router {
  const router = Router();
  router.get("/", c.listPosts);
  router.post("/", ...writeGuard(verifier), json(), validate({ body: createBlogSchema }), c.createPost);
  router.get("/:slug", validate({ params: slugParamsSchema }), c.getPost);
  router.delete("/:slug", ...writeGuard(verifier), validate({ params: slugParamsSchema }), c.deletePost);
  router.get("/:slug/vote", optionalAuth(verifier), validate({ params: slugParamsSchema }), c.getVotes);
  router.post(
    "/:slug/vote",
    ...writeGuard(verifier),
    json(),
    validate({ params: slugParamsSchema, body: voteSchema }),
    c.vote,
  );
  return router;
}
