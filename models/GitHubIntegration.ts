import mongoose from "mongoose";
import { modelFromSchema } from "./model";

export const GitHubIntegrationSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Clerk User ID
  githubId: { type: String, required: true },
  githubUsername: { type: String, required: true },
  accessToken: { type: String, required: true },
  repoName: { type: String, default: "dwcode-workspace" },
  repoPrivate: { type: Boolean, default: false },
  defaultBranch: { type: String, default: "main" },
}, {
  timestamps: true
});

export const GitHubIntegration = modelFromSchema("GitHubIntegration", GitHubIntegrationSchema);
