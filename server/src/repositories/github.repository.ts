import { GitHubIntegration } from "../models/GitHubIntegration.ts";

export interface GitHubLink {
  token: string;
  username: string;
}

export class GitHubRepository {
  async findLink(userId: string): Promise<GitHubLink | null> {
    const row = await GitHubIntegration.findOne({ userId }).select("accessToken githubUsername").lean();
    return row ? { token: row.accessToken, username: row.githubUsername } : null;
  }
}
