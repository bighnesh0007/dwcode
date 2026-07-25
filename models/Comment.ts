import mongoose from "mongoose";
import { modelFromSchema } from "./model";

export const CommentSchema = new mongoose.Schema({
    problemSlug: { type: String, required: true, index: true },
    userId: { type: String, required: true },        // Clerk user ID
    userName: { type: String, required: true },       // Clerk display name
    userImageUrl: { type: String, default: "" },      // Clerk avatar URL
    content: { type: String, required: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

export const Comment = modelFromSchema("Comment", CommentSchema);
