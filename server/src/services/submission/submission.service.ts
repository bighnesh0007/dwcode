/**
 * Submit: grade → record → reward → publish. The server-side replacement for
 * the Next.js POST /api/submissions, with the same rules:
 *
 *   - the verdict is computed here, from the problem document; the request
 *     carries only { problemId, code, input? } (audit C-4)
 *   - identity comes from the verified token and Clerk, never the body
 *   - coins are paid against this verdict: first solve once, difficulty bonus
 *     on every Accepted
 *
 * And one rule the Next.js route could not keep: when the compiler is
 * unavailable, NOTHING is recorded and no coins move. The job fails, the queue
 * retries it, and the user is told to resubmit only if every attempt fails.
 */
import { COIN_RULES, coinRewardFor, type GradeResult, type TestResult } from "@dwcode/shared";
import { CompilerUnavailableError, NotFoundError } from "../../errors/AppError.ts";
import { contextLogger } from "../../lib/logger.ts";
import type { CoinsRepository } from "../../repositories/coins.repository.ts";
import type { ProblemRepository } from "../../repositories/problem.repository.ts";
import type { SubmissionRepository } from "../../repositories/submission.repository.ts";
import type { IdentityProvider } from "../../types/ports.ts";
import type { GradingService } from "../grading/grading.service.ts";
import type { PublishSolutionJob } from "../github/solutionPublisher.ts";

export interface SubmitCommand {
  userId: string;
  problemId: string;
  code: string;
  input?: string;
}

export interface SubmitOutcome {
  submissionId: string;
  problemSlug: string;
  status: GradeResult["status"];
  summary: string;
  results: TestResult[];
  executionTime: string;
  output: string;
  createdAt: string;
}

export class SubmissionService {
  constructor(
    private readonly problems: ProblemRepository,
    private readonly submissions: SubmissionRepository,
    private readonly coins: CoinsRepository,
    private readonly identity: IdentityProvider,
    private readonly grading: GradingService,
    /** Fire-and-forget: GitHub publishing is its own retried job. */
    private readonly publishSolution: (job: PublishSolutionJob) => Promise<void>,
  ) {}

  async submit(cmd: SubmitCommand): Promise<SubmitOutcome> {
    const log = contextLogger();
    const problem = await this.problems.findForGrading(cmd.problemId);
    if (!problem) throw new NotFoundError("Problem not found.");

    const grade = await this.grading.grade(cmd.code, problem);
    if (grade.unavailable) {
      // Thrown, not returned: the queue retries a thrown job, and nothing below
      // — the record, the coins — may happen for a verdict we did not reach.
      throw new CompilerUnavailableError("The compiler is unavailable. Your submission was not recorded.", 5);
    }

    const user = await this.identity.getUser(cmd.userId);
    const saved = await this.submissions.create({
      problemId: problem.id,
      problemSlug: problem.slug,
      userId: cmd.userId,
      userName: user?.displayName ?? "Anonymous",
      userImageUrl: user?.imageUrl ?? "",
      code: cmd.code,
      input: typeof cmd.input === "string" ? cmd.input : "{}",
      output: grade.output,
      status: grade.status,
      executionTime: grade.executionTime,
    });

    if (grade.status === "Accepted") {
      // The submission is recorded; a reward failure must not undo or fail it.
      try {
        const earlier = await this.submissions.countAcceptedExcept(cmd.userId, problem.id, saved.id);
        if (earlier === 0) {
          await this.coins.award(cmd.userId, COIN_RULES.firstSolve, "first_solve", `First solve: ${problem.slug}`);
        }
        await this.coins.award(cmd.userId, coinRewardFor(problem.difficulty), "difficulty_bonus", `${problem.difficulty} problem solved`);
      } catch (err) {
        log.error({ err, submissionId: saved.id }, "[submissions] coin award failed");
      }
      void this.publishSolution({
        userId: cmd.userId,
        problem: { title: problem.title, slug: problem.slug, difficulty: problem.difficulty },
        code: cmd.code,
      }).catch((err: unknown) => log.warn({ err }, "[submissions] could not enqueue GitHub publish"));
    }

    return {
      submissionId: saved.id,
      problemSlug: problem.slug,
      status: grade.status,
      summary: grade.summary,
      results: grade.results,
      executionTime: grade.executionTime,
      output: grade.output,
      createdAt: saved.createdAt.toISOString(),
    };
  }
}
