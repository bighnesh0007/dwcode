import mongoose from "mongoose";
import { modelFromSchema } from "./model.ts";

/**
 * Ported from client/models/GitHubIntegration.ts — keep identical while both
 * apps use it. NOTE: `accessToken` is stored in plaintext today (see
 * docs/vault/Findings/W2-R3 GitHub Tokens In Plaintext.md).
 */
export const GitHubIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    githubId: { type: String, required: true },
    githubUsername: { type: String, required: true },
    accessToken: { type: String, required: true },
    repoName: { type: String, default: "dwcode-workspace" },
    repoPrivate: { type: Boolean, default: false },
    defaultBranch: { type: String, default: "main" },
  },
  { timestamps: true },
);

export const GitHubIntegration = modelFromSchema("GitHubIntegration", GitHubIntegrationSchema);
