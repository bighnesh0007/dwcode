/** Submission persistence — no business rules. Delegates to data/repositories, where DATA_BACKEND picks the database. */
import * as submissions from "../data/repositories/submissions.ts";

export interface NewSubmission {
  problemId: string;
  problemSlug: string;
  userId: string;
  userName: string;
  userImageUrl: string;
  code: string;
  input: string;
  output: string;
  status: string;
  executionTime: string;
}

export interface SubmissionSummary {
  _id: string;
  problemId: string;
  problemSlug: string;
  status: string;
  executionTime: string;
  createdAt: Date;
  code: string;
  output: string;
}

export class SubmissionRepository {
  async create(data: NewSubmission): Promise<{ id: string; createdAt: Date }> {
    const doc = await submissions.create(data);
    return { id: String(doc._id), createdAt: doc.createdAt };
  }

  /** Whether (user, problem) has an Accepted submission other than `excludeId` — the first-solve check. */
  hasOtherAccepted(userId: string, problemId: string, excludeId: string): Promise<boolean> {
    return submissions.hasOtherAccepted(userId, problemId, excludeId);
  }

  /** Newest first. Served by the { userId, createdAt } index. */
  async listByUser(userId: string, limit: number, problemSlug?: string): Promise<SubmissionSummary[]> {
    const rows = await submissions.listRecentByUser(userId, limit, problemSlug);
    return rows.map((r) => ({
      _id: String(r._id),
      problemId: String(r.problemId),
      problemSlug: r.problemSlug,
      status: r.status ?? "Attempted",
      executionTime: r.executionTime ?? "0ms",
      createdAt: r.createdAt,
      code: r.code,
      output: r.output ?? "",
    }));
  }

  /** Distinct slugs this user has solved. */
  async acceptedSlugs(userId: string): Promise<string[]> {
    return (await submissions.slugsByOutcome(userId)).accepted;
  }

  /**
   * Solved and attempted problem slugs for one user, computed in the database
   * so the problem list's status marks are right however many submissions a
   * user has (a paged history would silently drop the oldest). A problem with
   * any Accepted run is solved, never attempted.
   */
  async progress(userId: string): Promise<{ solved: string[]; attempted: string[] }> {
    const { accepted, notAccepted } = await submissions.slugsByOutcome(userId);
    const solved = new Set(accepted);
    return { solved: accepted, attempted: notAccepted.filter((slug) => !solved.has(slug)) };
  }

  /** Dashboard numbers for one user, computed in the database. `daily` covers the last 365 days (UTC dates). */
  stats(userId: string, now: Date): Promise<{ total: number; accepted: number; daily: Record<string, number> }> {
    return submissions.activityStats(userId, new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
  }
}
