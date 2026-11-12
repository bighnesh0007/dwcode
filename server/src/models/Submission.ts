import mongoose from "mongoose";
import { SUBMISSION_STATUS_ENUM } from "@dwcode/shared";
import { modelFromSchema } from "./model.ts";

/**
 * Ported from client/models/Submission.ts. During the migration BOTH apps write
 * this collection, so the two schemas must stay identical — field for field,
 * default for default. Indexes are declared here for parity but are only built
 * when MONGO_AUTO_INDEX is on.
 */
export const SubmissionSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true },
  problemSlug: { type: String, required: true },
  userId: { type: String, default: "" },
  userName: { type: String, default: "Anonymous" },
  userImageUrl: { type: String, default: "" },
  code: { type: String, required: true },
  input: { type: String, default: "{}" },
  output: { type: String, default: "" },
  status: { type: String, enum: SUBMISSION_STATUS_ENUM, default: "Attempted" },
  executionTime: { type: String, default: "0ms" },
  createdAt: { type: Date, default: Date.now },
});

SubmissionSchema.index({ userId: 1, createdAt: -1 });
SubmissionSchema.index({ userId: 1, problemId: 1, status: 1 });
SubmissionSchema.index({ userId: 1, problemSlug: 1, status: 1 });

export const Submission = modelFromSchema("Submission", SubmissionSchema);
