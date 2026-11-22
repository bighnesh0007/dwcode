import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/** In-app notifications. Always read and written scoped by userId. */
export const NotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  /** e.g. "achievement", "daily_bonus", "follower", "comment", "announcement". */
  kind: { type: String, required: true },
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, default: "", maxlength: 1000 },
  /** Site-relative path, never an external URL. */
  link: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });

export const Notification = modelFromSchema("Notification", NotificationSchema);
