import mongoose from "mongoose";
import { SUBMISSION_STATUS_ENUM } from "@dwcode/shared";
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
  status: { type: String, enum: SUBMISSION_STATUS_ENUM, default: "Attempted" },
  executionTime: { type: String, default: "0ms" },
  createdAt: { type: Date, default: Date.now },
});

/*
 * Indexes (PERF-02). `submissions` is the hottest collection on the platform and
 * previously had NONE, so every query below was a collection scan.
 *
 * Each index is justified by an observed query — no speculative indexes, since
 * every one costs write throughput and RAM.
 */

// Submission history: Submission.find({ userId }).sort({ createdAt: -1 })
// Also serves the profile page and the GitHub README rebuild.
SubmissionSchema.index({ userId: 1, createdAt: -1 });

// First-solve check in POST /api/submissions:
//   Submission.countDocuments({ userId, problemId, status, _id: { $ne } })
SubmissionSchema.index({ userId: 1, problemId: 1, status: 1 });

// Guest-progress + "have I solved this?" lookups:
//   Submission.exists({ userId, problemSlug, status: "Accepted" })
SubmissionSchema.index({ userId: 1, problemSlug: 1, status: 1 });

/*
 * NOT indexed, deliberately: the leaderboard's `Submission.find()` reads the
 * whole collection with no filter, so no index can help it. That query needs to
 * become an aggregation pipeline (PERF-01), not an index.
 */

export const Submission = modelFromSchema("Submission", SubmissionSchema);
