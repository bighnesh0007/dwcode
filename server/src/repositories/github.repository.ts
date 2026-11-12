import { config } from "../config/index.ts";
import { decryptToken, encryptToken } from "../lib/crypto/tokenCipher.ts";
import * as github from "../data/repositories/githubIntegrations.ts";

export interface GitHubLink {
  token: string;
  username: string;
}

export interface GitHubLinkDetails extends GitHubLink {
  repoName: string;
  repoPrivate: boolean;
  defaultBranch: string;
}

export interface GitHubStatus {
  connected: boolean;
  username?: string;
  repoName: string;
  repoPrivate: boolean;
  defaultBranch: string;
}

const DEFAULT_REPO = "dwcode-workspace";

/**
 * Tokens are written encrypted (`enc:v1:`), and read in either form, so rows
 * linked before encryption keep working until the user reconnects. Persistence
 * goes through data/repositories, where DATA_BACKEND picks the database.
 */
export class GitHubRepository {
  constructor(private readonly encryptionKey: string | undefined = config.secrets.tokenEncryptionKey) {}

  async findLink(userId: string): Promise<GitHubLink | null> {
    const row = await github.findByUserId(userId);
    return row ? { token: decryptToken(row.accessToken, this.encryptionKey), username: row.githubUsername } : null;
  }

  async findLinkDetails(userId: string): Promise<GitHubLinkDetails | null> {
    const row = await github.findByUserId(userId);
    if (!row) return null;
    return {
      token: decryptToken(row.accessToken, this.encryptionKey),
      username: row.githubUsername,
      repoName: row.repoName || DEFAULT_REPO,
      repoPrivate: row.repoPrivate ?? false,
      defaultBranch: row.defaultBranch || "",
    };
  }

  /** Never includes the token. */
  async status(userId: string): Promise<GitHubStatus> {
    const row = await github.findSettings(userId);
    return {
      connected: Boolean(row),
      ...(row ? { username: row.githubUsername } : {}),
      repoName: row?.repoName || DEFAULT_REPO,
      repoPrivate: row?.repoPrivate || false,
      defaultBranch: row?.defaultBranch || "main",
    };
  }

  /** Upsert the link. Refuses to store a token in plaintext. */
  async saveLink(input: { userId: string; githubId: string; githubUsername: string; accessToken: string }): Promise<void> {
    if (!this.encryptionKey) throw new Error("TOKEN_ENCRYPTION_KEY is required to store GitHub tokens.");
    await github.saveConnection(
      input.userId,
      input.githubId,
      input.githubUsername,
      encryptToken(input.accessToken, this.encryptionKey),
    );
  }

  async deleteLink(userId: string): Promise<void> {
    await github.deleteByUserId(userId);
  }
}
