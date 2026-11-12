/**
 * Publish an accepted solution to the user's GitHub repo. Ported from
 * client/lib/github.ts `pushSolutionToGithub`, unchanged in effect: same repo,
 * file path, file content, commit messages and README.
 *
 * Runs as its own queued job, never inside grading: a GitHub outage must not
 * fail, slow or change a submission. It throws on failure so the queue retries.
 */
import { DIFFICULTIES } from "@dwcode/shared";
import type { GitHubRepository } from "../../repositories/github.repository.ts";
import type { ProblemRepository } from "../../repositories/problem.repository.ts";
import type { SubmissionRepository } from "../../repositories/submission.repository.ts";
import type { FetchLike } from "../../types/ports.ts";

export const SOLUTIONS_REPO = "dwcode-solutions";

export interface PublishSolutionJob {
  userId: string;
  problem: { title: string; slug: string; difficulty: string };
  code: string;
}

export class SolutionPublisher {
  constructor(
    private readonly github: GitHubRepository,
    private readonly submissions: SubmissionRepository,
    private readonly problems: ProblemRepository,
    private readonly fetchImpl: FetchLike,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** @returns false when the user has no GitHub link (nothing to do). */
  async publish(job: PublishSolutionJob): Promise<boolean> {
    const link = await this.github.findLink(job.userId);
    if (!link) return false;
    const api = this.client(link.token);
    const repo = `/repos/${link.username}/${SOLUTIONS_REPO}`;

    const existing = await api(repo);
    if (existing.status === 404) {
      await api("/user/repos", "POST", {
        name: SOLUTIONS_REPO,
        description: "DataWeave solutions generated automatically by DWCode.",
        private: false,
        auto_init: true,
      }).then(ensureOk("create repository"));
      await this.sleep(2000); // repo creation takes a moment to propagate
    } else {
      ensureOk("inspect repository")(existing);
    }

    const { problem, code } = job;
    const name = problem.title || problem.slug;
    const content = `%dw 2.0\n// Solved: ${name}\n// Difficulty: ${problem.difficulty}\n// Solved via DWCode\n\n${code}`;
    await this.putFile(api, repo, `${problem.difficulty || "Uncategorized"}/${problem.slug}.dwl`, content,
      `Solved: ${name} (#${problem.difficulty})`);

    await this.putFile(api, repo, "README.md", await this.readme(job.userId), "Update stats in README.md");
    return true;
  }

  private async readme(userId: string): Promise<string> {
    const slugs = await this.submissions.acceptedSlugs(userId);
    const solved = await this.problems.findSummariesBySlugs(slugs);
    // Every tier in the registry, not a hand-written Easy/Medium/Hard list.
    const counts = DIFFICULTIES.map((d) => `- ${d}: ${solved.filter((p) => p.difficulty === d).length}`).join("\n");
    const latest = new Set(slugs.slice(-5));
    const latestLines = solved.filter((p) => latest.has(p.slug)).map((p) => `- ${p.title || p.slug}\n`).join("");
    return `# DWCode Solutions\n\nGenerated automatically by DWCode.\n\n## Stats\n\n- Total Solved: ${solved.length}\n${counts}\n\n## Latest Solved\n\n${latestLines}`;
  }

  private async putFile(api: Api, repo: string, path: string, content: string, message: string): Promise<void> {
    const current = await api(`${repo}/contents/${path}`);
    const sha = current.ok ? ((await current.json()) as { sha?: string }).sha : undefined;
    await api(`${repo}/contents/${path}`, "PUT", {
      message,
      content: Buffer.from(content).toString("base64"),
      ...(sha ? { sha } : {}),
    }).then(ensureOk(`write ${path}`));
  }

  private client(token: string): Api {
    return (path, method = "GET", body) =>
      this.fetchImpl(`https://api.github.com${path}`, {
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
}

type Api = (path: string, method?: string, body?: unknown) => Promise<Response>;

function ensureOk(action: string) {
  return (res: Response): Response => {
    // Never include the response body: it can echo request details.
    if (!res.ok) throw new Error(`GitHub: could not ${action} (HTTP ${res.status})`);
    return res;
  };
}
