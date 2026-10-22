/**
 * Server-side submission grading (audit finding C-4, task SEC-05).
 *
 * WHY THIS EXISTS
 * Grading used to run entirely in the browser: Workspace.tsx fetched the test
 * cases, executed them, compared the outputs, decided `Accepted`, and POSTed
 * that verdict to /api/submissions — which stored it verbatim and paid out
 * coins on it. A single crafted request earned a first-solve bonus, a difficulty
 * bonus, a leaderboard solve and a public GitHub commit, with no DataWeave
 * written. Every ranked artefact on the platform was forgeable.
 *
 * The verdict is now computed here, on the server, from the problem document —
 * never from the request body.
 *
 * SCOPE (deliberate, see docs/audit/README.md)
 * This is an interim fix, not FEAT-01. It reproduces the previous grading
 * semantics EXACTLY — same normalisation, same sequential order, same
 * early-break on a compiler error, same visible test cases — so no user's
 * verdict changes as a result of moving the computation server-side. What
 * changes is only who is trusted to compute it.
 *
 * One deliberate exception since: top-level JSON string outputs are now
 * re-quoted before comparison (see formatCompilerOutput), because without it
 * those problems could not be passed at all (issue #12).
 *
 * `hiddenTestCases` run only when GRADE_HIDDEN_TESTS is on (issue #10). Visible
 * test cases ship to the browser with their expected outputs, so with only
 * those, pasting the expected output is always Accepted. Hidden cases close
 * that, but a wrong hidden expectation would make a problem unpassable, so the
 * flag stays off until `npm run audit:problems` reports every solution passing.
 * Hidden results never reveal their input, expected output or actual output.
 */
import { gradeCases, formatCompilerOutput, type CaseOutcome, type GradeResult, type TestCase } from "@dwcode/shared";
import { DWL_BACKEND_URL } from "@/lib/config";
import { getErrorMessage } from "@/lib/errors";
import { explainCompilerError } from "@/lib/compilerErrors";
import { LIMITS } from "@dwcode/shared";

/*
 * The grading rules themselves now live in @dwcode/shared (gradeCases), shared
 * with server/'s grading worker, so the two cannot drift. This module only
 * supplies how one case runs from the Next.js side. Re-exports keep every
 * existing import of "@/lib/grading" working.
 */
export { normalizeOutput, formatCompilerOutput } from "@dwcode/shared";
export type { GradeResult, TestCase, TestResult } from "@dwcode/shared";
export type SubmissionStatus = GradeResult["status"];

const PER_TEST_TIMEOUT_MS = LIMITS.grading.perTestTimeoutMs;

/**
 * One call to the DataWeave compiler. Never throws.
 *
 * Network failures are reported as the user's error, exactly as before: this
 * path is being retired in favour of server/'s queue, which does distinguish
 * them, and changing verdicts here in passing is not this change's job.
 */
async function runOnce(code: string, input: string): Promise<CaseOutcome> {
  let parsedInput: unknown = {};
  try {
    parsedInput = JSON.parse(input || "{}");
  } catch {
    parsedInput = input || {};
  }

  let response: Response;
  try {
    response = await fetch(`${DWL_BACKEND_URL}/api/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: code, inputs: [{ name: "payload", value: parsedInput }] }),
      signal: AbortSignal.timeout(PER_TEST_TIMEOUT_MS),
    });
  } catch (networkErr) {
    return { kind: "error", message: `Could not reach the DataWeave compiler: ${getErrorMessage(networkErr)}` };
  }

  let data: { error?: string; message?: string; output?: unknown; result?: unknown };
  try {
    data = await response.json();
  } catch {
    return { kind: "error", message: `Compiler returned a non-JSON response (HTTP ${response.status}).` };
  }

  if (!response.ok || data.error) {
    return {
      kind: "error",
      message: explainCompilerError(data.error || data.message || `Compilation failed (HTTP ${response.status})`),
    };
  }

  return { kind: "ok", output: formatCompilerOutput(data.output ?? data.result, code) };
}

/** Grade `code` against a problem's cases. See gradeCases in @dwcode/shared. */
export function gradeSubmission(
  code: string,
  testCases: TestCase[],
  examples: { input: string; output: string }[] = [],
  hiddenTestCases: TestCase[] = [],
): Promise<GradeResult> {
  return gradeCases(runOnce, code, testCases, examples, hiddenTestCases);
}
