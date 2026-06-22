import mongoose from "mongoose";

const GitHubIntegrationSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Clerk User ID
  githubId: { type: String, required: true },
  githubUsername: { type: String, required: true },
  accessToken: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field on save
GitHubIntegrationSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

export const GitHubIntegration =
  mongoose.models.GitHubIntegration || mongoose.model("GitHubIntegration", GitHubIntegrationSchema);
