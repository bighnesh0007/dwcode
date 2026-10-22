/**
 * Grading on the server: the shared rules (gradeCases in @dwcode/shared) run
 * against our compiler service.
 *
 * The one thing decided here is how a compiler outcome maps to a case outcome:
 * the user's code failing is their result; the compiler being unable to run it
 * is ours, and stops grading without a verdict.
 */
import {
  explainCompilerError,
  formatCompilerOutput,
  gradeCases,
  type CaseOutcome,
  type GradeResult,
} from "@dwcode/shared";
import {
  isInfrastructureFailure,
  type CompilerServiceClient,
} from "../compiler/compilerService.client.ts";
import type { GradableProblem } from "../../repositories/problem.repository.ts";

export class GradingService {
  constructor(
    private readonly compiler: CompilerServiceClient,
    private readonly gradeHiddenTests: boolean,
  ) {}

  grade(code: string, problem: GradableProblem): Promise<GradeResult> {
    return gradeCases(
      (script, input) => this.runCase(script, input),
      code,
      problem.testCases,
      problem.examples,
      this.gradeHiddenTests ? problem.hiddenTestCases : [],
    );
  }

  private async runCase(code: string, input: string): Promise<CaseOutcome> {
    const result = await this.compiler.execute({
      script: code,
      // The stored case input is JSON text; the compiler takes it as-is. (The
      // old client path parsed it into an object first, which the upstream
      // then mangled — finding W2-R2.)
      inputs: [{ name: "payload", value: input || "{}", mimeType: "application/json" }],
    });
    if (result.ok) return { kind: "ok", output: formatCompilerOutput(result.output, code) };
    if (isInfrastructureFailure(result)) return { kind: "unavailable", message: result.error.message };
    return { kind: "error", message: explainCompilerError(result.error.message) };
  }
}
