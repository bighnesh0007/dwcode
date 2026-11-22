import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/**
 * Community contributions (SFCode parity, Phase E): problem drafts,
 * certification questions and contributor applications. `payload` holds the
 * kind's fields; `check` is the last automatic check of a problem draft,
 * whose generated outputs become the published expectedOutputs.
 */
export const ContributionSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  authorId: { type: String, required: true, index: true },
  /** draft → submitted → approved | rejected; a rejected or submitted item can return to draft. */
  status: { type: String, required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  check: { type: mongoose.Schema.Types.Mixed, default: null },
  reviewNote: { type: String, default: "" },
  reviewedBy: { type: String, default: "" },
  /** The published problem's slug or question's id, once approved. */
  publishedRef: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { minimize: false });

export const Contribution = modelFromSchema("Contribution", ContributionSchema);
