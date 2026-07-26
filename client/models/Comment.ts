import mongoose from "mongoose";
import { LIMITS } from "@dwcode/shared";
import { modelFromSchema } from "./model";

/**
 * A discussion comment on any commentable resource.
 *
 * Generalised from problem-only comments so blog posts can reuse the same
 * model, API and UI rather than growing a parallel `BlogComment` with its own
 * copy of the delete-authorisation, coin-award and moderation logic.
 *
 * MIGRATION NOTE (002): `problemSlug` is RETAINED and still written for
 * problem comments, even though `targetId` now carries the same value. Keeping
 * it means the previous release's code and this one can both run against the
 * database during a rolling deploy — the rule in
 * docs/runbooks/database-migrations.md. It can be dropped once the release has
 * settled.
 */
export const COMMENT_TARGET_TYPES = ["problem", "blog"] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

export const CommentSchema = new mongoose.Schema({
    /** What is being commented on. */
    targetType: {
        type: String,
        enum: [...COMMENT_TARGET_TYPES],
        required: true,
        default: "problem",
    },
    /** Slug of the target — a problem slug or a blog slug. */
    targetId: { type: String, required: true },

    /**
     * Legacy field, kept in sync for problem comments during the 002 rollout.
     * Prefer `targetId`. See the migration note above.
     */
    problemSlug: { type: String },

    userId: { type: String, required: true },        // Clerk user ID
    userName: { type: String, required: true },      // Clerk display name
    userImageUrl: { type: String, default: "" },     // Clerk avatar URL
    content: { type: String, required: true, maxlength: LIMITS.comment.maxLength },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// The discussion query: Comment.find({ targetType, targetId }).sort({ createdAt: -1 }).
// Covers the sort as well as the filter, so Mongo never sorts in memory.
CommentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// Retained so the PREVIOUS release's query keeps using an index during a rolling
// deploy. Migration 002 drops it once nothing reads `problemSlug`.
CommentSchema.index({ problemSlug: 1, createdAt: -1 });

// A user's own comments — used by the admin directory aggregate.
CommentSchema.index({ userId: 1 });

export const Comment = modelFromSchema("Comment", CommentSchema);
