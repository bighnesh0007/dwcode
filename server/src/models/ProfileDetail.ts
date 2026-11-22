import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/**
 * Profile extras (SFCode parity, Phase E): headline, about and links,
 * equipped cosmetics, and the mentor listing. Kept beside UserProfile, not
 * in it, so the profile document and its copy/parity tooling are unchanged.
 */
export const ProfileDetailSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  headline: { type: String, default: "" },
  about: { type: String, default: "" },
  links: { type: mongoose.Schema.Types.Mixed, default: {} },
  equipped: { type: mongoose.Schema.Types.Mixed, default: {} },
  mentorActive: { type: Boolean, default: false, index: true },
  mentorTopics: { type: [String], default: [] },
  mentorNote: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now },
}, { minimize: false });

export const ProfileDetail = modelFromSchema("ProfileDetail", ProfileDetailSchema);
