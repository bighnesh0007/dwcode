import mongoose from "mongoose";
import { modelFromSchema } from "./model";

export const SubmissionSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true },
  problemSlug: { type: String, required: true },
  // Clerk user info (optional for backward compat)
  userId: { type: String, default: "" },
  userName: { type: String, default: "Anonymous" },
  userImageUrl: { type: String, default: "" },
  code: { type: String, required: true },
  input: { type: String, default: "{}" },
  output: { type: String, default: "" },
  status: { type: String, enum: ["Accepted", "Attempted", "Error"], default: "Attempted" },
  executionTime: { type: String, default: "0ms" },
  createdAt: { type: Date, default: Date.now },
});

export const Submission = modelFromSchema("Submission", SubmissionSchema);
