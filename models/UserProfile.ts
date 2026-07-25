import mongoose from "mongoose";
import { modelFromSchema } from "./model";

export const UserProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Clerk User ID
  username: { type: String, required: true, unique: true },
  bio: { type: String, default: "" },
  followers: { type: [String], default: [] }, // Array of userIds
  following: { type: [String], default: [] }, // Array of userIds
}, {
  timestamps: true
});

export const UserProfile = modelFromSchema("UserProfile", UserProfileSchema);
