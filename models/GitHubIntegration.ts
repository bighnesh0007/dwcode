import mongoose from "mongoose";

const GitHubIntegrationSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Clerk User ID
  githubId: { type: String, required: true },
  githubUsername: { type: String, required: true },
  accessToken: { type: String, required: true },
}, {
  timestamps: true
});

export const GitHubIntegration =
  mongoose.models.GitHubIntegration || mongoose.model("GitHubIntegration", GitHubIntegrationSchema);
