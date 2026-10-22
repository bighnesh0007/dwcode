import { GitHubIntegration } from "@/models/GitHubIntegration";
import { connect } from "./shared";

/** The user's GitHub connection, access token included — server-side only. */
export async function findByUserId(userId: string) {
  await connect();
  return GitHubIntegration.findOne({ userId }).lean();
}

/** Connection settings without the access token — safe to return to the client. */
export async function findSettings(userId: string) {
  await connect();
  return GitHubIntegration.findOne({ userId })
    .select("githubUsername repoName repoPrivate defaultBranch")
    .lean();
}

/** Create or refresh the user's connection after OAuth. */
export async function saveConnection(userId: string, githubId: string, githubUsername: string, accessToken: string) {
  await connect();
  await GitHubIntegration.findOneAndUpdate(
    { userId },
    { userId, githubId, githubUsername, accessToken, updatedAt: new Date() },
    { upsert: true },
  );
}

export async function deleteByUserId(userId: string) {
  await connect();
  await GitHubIntegration.findOneAndDelete({ userId });
}
