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
import { LIMITS } from "@dwcode/shared";
import { DWL_BACKEND_URL } from "@/lib/config";
import { getErrorMessage } from "@/lib/errors";

// Grading limits now come from the shared package (REF-01 closed audit risk
// M1-R5 — these were previously hand-copied from server/src/config/constants.ts).
const MAX_TESTS = LIMITS.grading.maxTests;
const TOTAL_BUDGET_MS = LIMITS.grading.totalBudgetMs;
const PER_TEST_TIMEOUT_MS = LIMITS.grading.perTestTimeoutMs;
const MAX_CODE_LENGTH = LIMITS.code.maxLength;

export type SubmissionStatus = "Accepted" | "Attempted" | "Error";

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface TestResult {
  index: number;
  passed: boolean;
  /** A hidden test: `expected` and `actual` are always empty. */
  hidden?: boolean;
  /** Present only when the compiler itself failed on this case. */
  error?: string;
  expected: string;
  actual: string;
}

export interface GradeResult {
  status: SubmissionStatus;
  results: TestResult[];
  /** Human-readable summary, rendered verbatim by the workspace output pane. */
  summary: string;
  executionTime: string;
  /** Output of the first test case, shown as the run output. */
  output: string;
}

/**
 * Normalise a value for comparison.
 *
 * Byte-for-byte identical to the comparison the browser used to perform, so
 * moving grading server-side does not silently change any verdict: parse as
 * JSON to make key order and whitespace irrelevant, and fall back to a trimmed
 * string compare when the output is not JSON (XML, CSV, plain text).
 */
export function normalizeOutput(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value.trim()));
  } catch {
    return value.trim();
  }
}

/** `output application/json` or `output json` in the script header. */
const JSON_OUTPUT_DIRECTIVE = /^\s*output\s+(?:application\/json|json)\b/m;

/**
 * Turn the compiler proxy's `output` field back into the text the script produced.
 *
 * The proxy JSON-parses the compiler's output, so a top-level JSON string such
 * as `"Alice, Bob"` arrives here as the bare value `Alice, Bob`. Passing that
 * through verbatim dropped the quotes, and it could then never equal a correct
 * `expectedOutput` of `"Alice, Bob"` (issue #12).
 *
 * So for a JSON-output script, a string that is not itself valid JSON text is
 * re-encoded. A string that already parses is left alone: it is either a
 * backend that returns unparsed JSON text, or a string whose content happens to
 * be JSON — both are shown exactly as before. Non-JSON outputs (XML, CSV, plain
 * text) are raw documents and are never touched.
 */
export function formatCompilerOutput(raw: unknown, script: string): string {
  if (typeof raw === "string") {
    const header = script.split(/^---\s*$/m)[0] ?? "";
    if (!JSON_OUTPUT_DIRECTIVE.test(header) || isJsonText(raw)) return raw;
    return JSON.stringify(raw);
  }
  return JSON.stringify(raw, null, 2);
}

function isJsonText(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

interface CompilerResult {
  success: boolean;
  output: string;
}

/** One call to the DataWeave compiler. Never throws. */
async function runOnce(code: string, input: string, signal: AbortSignal): Promise<CompilerResult> {
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
      signal,
    });
  } catch (networkErr) {
    return {
      success: false,
      output: `Could not reach the DataWeave compiler: ${getErrorMessage(networkErr)}`,
    };
  }

  let data: { error?: string; message?: string; output?: unknown; result?: unknown };
  try {
    data = await response.json();
  } catch {
    return { success: false, output: `Compiler returned a non-JSON response (HTTP ${response.status}).` };
  }

  if (!response.ok || data.error) {
    return {
      success: false,
      output: data.error || data.message || `Compilation failed (HTTP ${response.status})`,
    };
  }

  return {
    success: true,
    output: formatCompilerOutput(data.output ?? data.result, code),
  };
}

/**
 * Grade `code` against a problem's visible test cases and return the verdict.
 *
 * Falls back to the first example when a problem defines no test cases, matching
 * the previous client behaviour. A problem with neither is unverifiable and
 * grades `Attempted` — it can never be `Accepted`, which is the safe direction.
 */
export async function gradeSubmission(
  code: string,
  testCases: TestCase[],
  examples: { input: string; output: string }[] = [],
  hiddenTestCases: TestCase[] = [],
): Promise<GradeResult> {
  const started = Date.now();

  if (typeof code !== "string" || !code.trim()) {
    return {
      status: "Error",
      results: [],
      summary: "✗ Error:\nNo code submitted.",
      executionTime: "0ms",
      output: "",
    };
  }
  if (code.length > MAX_CODE_LENGTH) {
    return {
      status: "Error",
      results: [],
      summary: `✗ Error:\nSubmission exceeds the ${MAX_CODE_LENGTH.toLocaleString()} character limit.`,
      executionTime: "0ms",
      output: "",
    };
  }

  const visible: TestCase[] =
    testCases.length > 0
      ? testCases
      : examples.length > 0
        ? [{ input: examples[0].input, expectedOutput: examples[0].output }]
        : [];
  const cases: (TestCase & { hidden: boolean })[] = [
    ...visible.map((tc) => ({ ...tc, hidden: false })),
    ...hiddenTestCases.map((tc) => ({ ...tc, hidden: true })),
  ].slice(0, MAX_TESTS);

  if (cases.length === 0) {
    return {
      status: "Attempted",
      results: [],
      summary: "⚠ No test cases defined. Cannot verify correctness.",
      executionTime: `${Date.now() - started}ms`,
      output: "",
    };
  }

  const results: TestResult[] = [];
  const lines: string[] = [];
  let allPassed = true;
  let status: SubmissionStatus = "Attempted";
  let firstOutput = "";

  for (let i = 0; i < cases.length; i++) {
    // Total wall-clock guard across all cases. A submission that blows the
    // budget grades Attempted, never Accepted.
    if (Date.now() - started > TOTAL_BUDGET_MS) {
      allPassed = false;
      lines.push(`Test ${i + 1}: ✗ Skipped — grading time budget exceeded.`);
      break;
    }

    const tc = cases[i];
    const result = await runOnce(code, tc.input, AbortSignal.timeout(PER_TEST_TIMEOUT_MS));

    if (i === 0) firstOutput = result.output;

    if (!result.success) {
      // Preserves the previous behaviour: a compiler error ends grading
      // immediately and the whole submission is an Error, not a wrong answer.
      // A hidden case's error message can echo its input, so it is withheld.
      allPassed = false;
      status = "Error";
      if (tc.hidden) {
        results.push({ index: i, passed: false, hidden: true, error: "Error on a hidden test.", expected: "", actual: "" });
        lines.push(`Hidden test ${i + 1}: ✗ Error — your code failed on a hidden input.`);
      } else {
        results.push({ index: i, passed: false, error: result.output, expected: tc.expectedOutput, actual: "" });
        lines.push(`Test ${i + 1}: ✗ Error — ${result.output}`);
      }
      break;
    }

    const passed = normalizeOutput(result.output) === normalizeOutput(tc.expectedOutput);
    if (!passed) allPassed = false;

    if (tc.hidden) {
      results.push({ index: i, passed, hidden: true, expected: "", actual: "" });
      lines.push(`Hidden test ${i + 1}: ${passed ? "✓ Passed" : "✗ Failed"}`);
      continue;
    }

    results.push({
      index: i,
      passed,
      expected: tc.expectedOutput,
      actual: result.output,
    });
    lines.push(
      `Test ${i + 1}: ${passed ? "✓ Passed" : "✗ Failed"}\n` +
        `  Expected: ${tc.expectedOutput.slice(0, 120)}\n` +
        `  Got:      ${result.output.slice(0, 120)}`,
    );
  }

  if (status !== "Error") status = allPassed ? "Accepted" : "Attempted";

  return {
    status,
    results,
    summary: lines.join("\n\n"),
    executionTime: `${Date.now() - started}ms`,
    output: firstOutput,
  };
}
