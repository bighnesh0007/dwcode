import mongoose from "mongoose";
import { modelFromSchema } from "./model";

export const UserRoleSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    userName: { type: String, default: "" },
    role: { type: String, enum: ["admin", "user"], default: "admin" },
    grantedBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

// PERF-02: UserRole.find({ role: "admin" }) runs on every admin-directory load
// and inside requireAdmin()'s DB path.
UserRoleSchema.index({ role: 1 });

export const UserRole = modelFromSchema("UserRole", UserRoleSchema);
