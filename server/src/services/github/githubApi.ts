/** A tiny authenticated GitHub REST client over an injectable fetch. */
import { UpstreamError } from "../../errors/AppError.ts";
import type { FetchLike } from "../../types/ports.ts";

export const GITHUB_API = "https://api.github.com";

export type GitHubApi = (path: string, method?: string, body?: unknown) => Promise<Response>;

export function githubApi(fetchImpl: FetchLike, token: string): GitHubApi {
  return (path, method = "GET", body) =>
    fetchImpl(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
}

/** Throws an UpstreamError naming the action. The body is never echoed: it can contain request details. */
export function ensureOk(action: string) {
  return (res: Response): Response => {
    if (!res.ok) throw new UpstreamError(`GitHub: could not ${action} (HTTP ${res.status}).`);
    return res;
  };
}

/** Encode each segment of a repo-relative path for use in a URL. */
export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
