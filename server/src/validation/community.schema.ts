/**
 * Community request schemas. All `.strict()`: unknown fields (a forged userId,
 * userName, upvotes…) are a 400, never silently written.
 */
import { z } from "zod";
import { LIMITS } from "../config/constants.ts";
import { COMMENT_TARGET_TYPES } from "../models/Comment.ts";
import type { CommentTarget } from "../repositories/comment.repository.ts";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be an ObjectId");
const trimmed = z.string().trim();

/**
 * Both shapes are accepted during the migration-002 rollout:
 *   NEW { targetType, targetId }   OLD { problemSlug } (means a problem comment).
 */
const targetFields = {
  targetType: z.enum(COMMENT_TARGET_TYPES).optional(),
  targetId: trimmed.max(200).optional(),
  problemSlug: trimmed.max(200).optional(),
};

function resolveTarget(v: { targetType?: CommentTarget["targetType"] | undefined; targetId?: string | undefined; problemSlug?: string | undefined }): CommentTarget | null {
  if (v.targetType && v.targetId) return { targetType: v.targetType, targetId: v.targetId };
  if (v.problemSlug) return { targetType: "problem", targetId: v.problemSlug };
  return null;
}

const TARGET_MESSAGE = "targetType + targetId (or problemSlug) required";

export const commentListQuerySchema = z
  .object({
    ...targetFields,
    // Lenient like the old route: anything that is not a positive integer means "default".
    limit: z.string().optional(),
  })
  .strict()
  .transform((v, ctx) => {
    const target = resolveTarget(v);
    if (!target) {
      ctx.addIssue({ code: "custom", message: TARGET_MESSAGE });
      return z.NEVER;
    }
    const n = Number(v.limit);
    return { target, limit: Number.isInteger(n) && n > 0 ? n : undefined };
  });
export type CommentListQuery = z.output<typeof commentListQuerySchema>;

export const createCommentSchema = z
  .object({
    ...targetFields,
    // Length is enforced in the service (413, as before); this only bounds the parse.
    content: z.string().max(LIMITS.comment.maxLength * 4),
  })
  .strict()
  .transform((v, ctx) => {
    const target = resolveTarget(v);
    if (!target) {
      ctx.addIssue({ code: "custom", message: TARGET_MESSAGE });
      return z.NEVER;
    }
    return { target, content: v.content };
  });
export type CreateCommentInput = z.output<typeof createCommentSchema>;

export const idParamsSchema = z.object({ id: objectId }).strict();

export const noteQuerySchema = z.object({ problemId: objectId }).strict();

export const saveNoteSchema = z
  .object({
    problemId: objectId,
    problemSlug: trimmed.min(1, "problemSlug required").max(200),
    content: z.string().max(LIMITS.note.maxLength * 2),
  })
  .strict();
export type SaveNoteInput = z.infer<typeof saveNoteSchema>;

export const toggleBookmarkSchema = z
  .object({ problemId: objectId, problemSlug: trimmed.min(1).max(200) })
  .strict();
export type ToggleBookmarkInput = z.infer<typeof toggleBookmarkSchema>;

export const createBlogSchema = z
  .object({
    title: z.string().max(300),
    content: z.string().max(100_000),
    tags: z.union([z.array(trimmed.max(50)).max(20), z.string().max(1000)]).optional(),
  })
  .strict();
export type CreateBlogInput = z.infer<typeof createBlogSchema>;

export const slugParamsSchema = z.object({ slug: z.string().min(1).max(300) }).strict();

export const voteSchema = z
  .object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) })
  .strict();
export type VoteInput = z.infer<typeof voteSchema>;
