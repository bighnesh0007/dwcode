import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/** Site-wide settings set by admins (the announcement banner, …), one row per key. */
export const AppSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedBy: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now },
});

export const AppSetting = modelFromSchema("AppSetting", AppSettingSchema);
