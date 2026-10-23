import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/** Ported from client/models/UserRole.ts — keep identical while both apps use it. */
export const UserRoleSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  userName: { type: String, default: "" },
  role: { type: String, enum: ["admin", "user"], default: "admin" },
  grantedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

UserRoleSchema.index({ role: 1 });

export const UserRole = modelFromSchema("UserRole", UserRoleSchema);
