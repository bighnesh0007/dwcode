import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/**
 * A learner's path state (SFCode parity, Phase D): onboarding answers,
 * placement, roadmap quizzes passed, spaced-review boxes and mock scores —
 * one document per user, read and written whole.
 */
export const LearnerStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  state: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
}, { minimize: false });

export const LearnerState = modelFromSchema("LearnerState", LearnerStateSchema);
