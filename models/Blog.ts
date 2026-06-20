import mongoose from "mongoose";

const BlogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },   // raw markdown
    authorId: { type: String, required: true },
    authorName: { type: String, default: "Anonymous" },
    authorImageUrl: { type: String, default: "" },
    tags: [{ type: String }],
    published: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

export const Blog =
    mongoose.models.Blog || mongoose.model("Blog", BlogSchema);
