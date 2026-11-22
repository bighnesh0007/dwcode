import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/** Platform and admin records (SFCode parity, Phase F). */

/** Who did what, for every admin action. Append-only. */
export const AuditEntrySchema = new mongoose.Schema({
  actorId: { type: String, required: true },
  action: { type: String, required: true },
  target: { type: String, default: "" },
  detail: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
}, { minimize: false });
export const AuditEntry = modelFromSchema("AuditEntry", AuditEntrySchema);

/** Hidden blog posts and comments, and suspended users: one row per (kind, ref). */
export const ModerationSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  ref: { type: String, required: true },
  reason: { type: String, default: "" },
  actorId: { type: String, required: true },
  /** Suspensions may end; hides do not. */
  until: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
ModerationSchema.index({ kind: 1, ref: 1 }, { unique: true });
export const Moderation = modelFromSchema("Moderation", ModerationSchema);

/** Client errors and CSP reports, grouped by fingerprint. */
export const ClientErrorSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true },
  kind: { type: String, required: true },
  message: { type: String, required: true },
  source: { type: String, default: "" },
  sample: { type: mongoose.Schema.Types.Mixed, default: {} },
  count: { type: Number, default: 0 },
  resolved: { type: Boolean, default: false, index: true },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
}, { minimize: false });
export const ClientError = modelFromSchema("ClientError", ClientErrorSchema);

/** Page views per UTC day and path. */
export const PageViewSchema = new mongoose.Schema({
  day: { type: String, required: true },
  path: { type: String, required: true },
  count: { type: Number, default: 0 },
});
PageViewSchema.index({ day: 1, path: 1 }, { unique: true });
export const PageView = modelFromSchema("PageView", PageViewSchema);
