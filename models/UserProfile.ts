import mongoose from "mongoose";

const UserProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Clerk User ID
  username: { type: String, required: true, unique: true },
  bio: { type: String, default: "" },
  followers: { type: [String], default: [] }, // Array of userIds
  following: { type: [String], default: [] }, // Array of userIds
}, {
  timestamps: true
});

export const UserProfile =
  mongoose.models.UserProfile || mongoose.model("UserProfile", UserProfileSchema);
