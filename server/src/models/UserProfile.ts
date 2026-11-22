import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/** Ported from client/models/UserProfile.ts — keep schema and indexes identical while both apps use it. */
export const UserProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true }, // Clerk User ID
    username: { type: String, required: true, unique: true },
    bio: { type: String, default: "" },
    /** ISO 3166-1 alpha-2, set by the user; absent until they choose one. */
    country: { type: String },
    followers: { type: [String], default: [] }, // Array of userIds
    following: { type: [String], default: [] }, // Array of userIds
  },
  {
    timestamps: true,
  },
);

export const UserProfile = modelFromSchema("UserProfile", UserProfileSchema);
