import mongoose from "mongoose";
import { modelFromSchema } from "./model";

export const BlogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },   // raw markdown
    authorId: { type: String, required: true },
    authorName: { type: String, default: "Anonymous" },
    authorImageUrl: { type: String, default: "" },
    tags: [{ type: String }],
    published: { type: Boolean, default: true },
    // Denormalized vote counters, kept in sync by /api/blog/[slug]/vote.
    // Documents created before this field existed lack it — consumers must ?? 0.
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

export const Blog = modelFromSchema("Blog", BlogSchema);
