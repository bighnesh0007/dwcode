import mongoose from "mongoose";
import { modelFromSchema } from "./model";

export const BlogVoteSchema = new mongoose.Schema(
    {
        blogSlug: { type: String, required: true },
        userId: { type: String, required: true },
        value: { type: Number, required: true, enum: [1, -1] },
    },
    { timestamps: true }
);

// One vote per user per post. This unique index is what makes voting
// idempotent under retries and safe under concurrent first-vote races.
BlogVoteSchema.index({ blogSlug: 1, userId: 1 }, { unique: true });

export const BlogVote = modelFromSchema("BlogVote", BlogVoteSchema);
