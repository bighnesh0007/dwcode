/**
 * Playground ↔ GitHub: import a file, list a repo's files, publish a run.
 * Ported from client/app/api/playground/github/* and client/lib/github.ts
 * `publishPlaygroundToGitHub` (same repo layout, file set and commit message).
 */
import { BadRequestError, ForbiddenError, NotFoundError, UpstreamError } from "../../errors/AppError.ts";
import type { GitHubLinkDetails, GitHubRepository } from "../../repositories/github.repository.ts";
import type { Clock, FetchLike } from "../../types/ports.ts";
import type { PushInput } from "../../validation/playground.schema.ts";
import { encodePath, ensureOk, githubApi, type GitHubApi } from "./githubApi.ts";

const MAX_LISTED_FILES = 300;

export interface PublishResult {
  repo: string;
  branch: string;
  commitSha: string;
  url: string;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "dataweave-run"
  );
}

export class PlaygroundGitHubService {
  constructor(
    private readonly repo: GitHubRepository,
    private readonly fetchImpl: FetchLike,
    private readonly clock: Clock,
  ) {}

  private async link(userId: string): Promise<GitHubLinkDetails> {
    const link = await this.repo.findLinkDetails(userId);
    if (!link) throw new ForbiddenError("GitHub not connected. Connect via the playground toolbar.");
    return link;
  }

  async importFile(userId: string, repoName: string, path: string): Promise<{ fileName: string; content: string; sha: string }> {
    const api = githubApi(this.fetchImpl, (await this.link(userId)).token);
    const res = await api(`/repos/${repoName}/contents/${encodePath(path)}`);
    if (res.status === 404) throw new NotFoundError("File not found, or no access to that repository.");
    ensureOk("read that file")(res);
    const data = (await res.json()) as { type?: string; content?: string; sha?: string };
    if (data.type !== "file" || typeof data.content !== "string") {
      throw new BadRequestError("Path points to a directory, not a file.");
    }
    return {
      fileName: path.split("/").pop() || "imported.json",
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha ?? "",
    };
  }

  async listFiles(userId: string, repoName: string): Promise<{ files: string[]; branch: string }> {
    const api = githubApi(this.fetchImpl, (await this.link(userId)).token);
    const repoRes = await api(`/repos/${repoName}`);
    if (!repoRes.ok) throw new NotFoundError("Repo not found or no access.");
    const branch = ((await repoRes.json()) as { default_branch?: string }).default_branch ?? "main";
    const treeRes = await api(`/repos/${repoName}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    if (!treeRes.ok) throw new UpstreamError("Could not fetch repository tree.");
    const tree = ((await treeRes.json()) as { tree?: { type: string; path?: string }[] }).tree ?? [];
    const files = tree
      .filter((item): item is { type: string; path: string } => item.type === "blob" && typeof item.path === "string")
      .map((item) => item.path)
      .slice(0, MAX_LISTED_FILES);
    return { files, branch };
  }

  async publish(userId: string, input: PushInput): Promise<PublishResult> {
    const link = await this.repo.findLinkDetails(userId);
    if (!link) throw new ForbiddenError("Connect GitHub before publishing.");
    const api = githubApi(this.fetchImpl, link.token);
    const repoPath = `/repos/${link.username}/${link.repoName}`;

    // Ensure the repository exists.
    const existing = await api(repoPath);
    let defaultBranch: string | undefined;
    if (existing.ok) {
      defaultBranch = ((await existing.json()) as { default_branch?: string }).default_branch;
    } else if (existing.status === 404) {
      const created = await api("/user/repos", "POST", {
        name: link.repoName,
        description: "DataWeave projects and solutions published from DWCode.",
        private: link.repoPrivate,
        auto_init: true,
      }).then(ensureOk("create repository"));
      defaultBranch = ((await created.json()) as { default_branch?: string }).default_branch;
    } else {
      ensureOk("inspect repository")(existing);
    }
    const branch = link.defaultBranch || defaultBranch || "main";

    const now = this.clock.now();
    const datePath = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
    ].join("/");
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const title = input.message?.trim().slice(0, 100) || "DataWeave playground run";
    const projectPath = `playground/${datePath}/${timestamp}-${slugify(title)}`;
    const inputFiles = input.files.map((f, i) => ({
      name: f.name?.trim() ? f.name.trim().slice(0, 80) : `input-${i + 1}.json`,
      content: f.content,
    }));

    const files: { path: string; content: string }[] = [
      { path: `${projectPath}/transform.dwl`, content: input.script },
      ...inputFiles.map((f) => ({ path: `${projectPath}/inputs/${f.name.replace(/[\\/]/g, "-")}`, content: f.content })),
      {
        path: `${projectPath}/README.md`,
        content: `# ${title}\n\nPublished from DWCode on ${now.toISOString()}.\n\n## Structure\n\n- \`transform.dwl\`: DataWeave script\n- \`inputs/\`: input payloads and variables\n- \`tests.json\`: playground test expectations\n- \`output.txt\`: latest output when available\n`,
      },
      { path: `${projectPath}/tests.json`, content: JSON.stringify(input.testCases, null, 2) },
      {
        path: `${projectPath}/metadata.json`,
        content: JSON.stringify(
          { source: "DWCode Playground", publishedAt: now.toISOString(), inputCount: inputFiles.length, testCount: input.testCases.length },
          null,
          2,
        ),
      },
    ];
    if (input.output) files.push({ path: `${projectPath}/output.txt`, content: input.output });

    const commitSha = await this.commitFiles(api, repoPath, branch, files, `playground: ${title} (${now.toISOString()})`);
    return {
      repo: `${link.username}/${link.repoName}`,
      branch,
      commitSha,
      url: `https://github.com/${link.username}/${link.repoName}/tree/${branch}/${projectPath}`,
    };
  }

  private async commitFiles(
    api: GitHubApi,
    repoPath: string,
    branch: string,
    files: { path: string; content: string }[],
    message: string,
  ): Promise<string> {
    const ref = (await (await api(`${repoPath}/git/ref/heads/${encodeURIComponent(branch)}`).then(ensureOk("read branch"))).json()) as {
      object: { sha: string };
    };
    const parentSha = ref.object.sha;
    const parent = (await (await api(`${repoPath}/git/commits/${parentSha}`).then(ensureOk("read commit"))).json()) as {
      tree: { sha: string };
    };
    const tree = await Promise.all(
      files.map(async (file) => {
        const blob = (await (
          await api(`${repoPath}/git/blobs`, "POST", {
            content: Buffer.from(file.content).toString("base64"),
            encoding: "base64",
          }).then(ensureOk("upload file"))
        ).json()) as { sha: string };
        return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
      }),
    );
    const newTree = (await (await api(`${repoPath}/git/trees`, "POST", { base_tree: parent.tree.sha, tree }).then(ensureOk("create tree"))).json()) as {
      sha: string;
    };
    const commit = (await (
      await api(`${repoPath}/git/commits`, "POST", { message, tree: newTree.sha, parents: [parentSha] }).then(ensureOk("create commit"))
    ).json()) as { sha: string };
    await api(`${repoPath}/git/refs/heads/${encodeURIComponent(branch)}`, "PATCH", { sha: commit.sha }).then(ensureOk("update branch"));
    return commit.sha;
  }
}
