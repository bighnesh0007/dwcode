/**
 * Submission grading: ONE implementation for client/ and server/.
 *
 * Moved here from client/lib/grading.ts when grading moved to the server
 * (ADR-006). A copy per app would drift, and a drift in `normalizeOutput` or
 * the early-break rule silently changes verdicts. Each app supplies only how a
 * single case is run (`RunCase`); everything that decides the verdict is here.
 *
 * Semantics are unchanged from the client implementation, which documented
 * them (audit C-4 / SEC-05): sequential order, normalised comparison, early
 * break on the first error, hidden cases never revealing input/expected/actual,
 * and a total time budget after which the verdict is Attempted, never Accepted.
 *
 * New: a case can report `unavailable` — the compiler could not run it at all.
 * That stops grading with `unavailable: true`, and the caller must NOT record a
 * verdict: our outage is not the user's wrong answer
 * (docs/audit/09-runtime-ownership.md §5.1).
 */
import { LIMITS } from "./limits.js";

export type GradeStatus = "Accepted" | "Attempted" | "Error";

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface Example {
  input: string;
  output: string;
}

export interface TestResult {
  index: number;
  passed: boolean;
  /** A hidden test: `expected` and `actual` are always empty. */
  hidden?: boolean;
  /** Present only when the compiler failed on this case. */
  error?: string;
  expected: string;
  actual: string;
}

export interface GradeResult {
  status: GradeStatus;
  results: TestResult[];
  /** Human-readable summary, rendered verbatim by the workspace output pane. */
  summary: string;
  executionTime: string;
  /** Output of the first test case, shown as the run output. */
  output: string;
  /** True when the compiler was unavailable. The verdict is meaningless: do not persist it. */
  unavailable?: boolean;
}

/** One case's outcome, as reported by the app's runner. */
export type CaseOutcome =
  | { kind: "ok"; output: string }
  /** The user's code failed: compile/runtime error, timeout, limit. Their result. */
  | { kind: "error"; message: string }
  /** The compiler could not run it: overloaded, unreachable. Ours. */
  | { kind: "unavailable"; message: string };

export type RunCase = (code: string, input: string) => Promise<CaseOutcome>;

/**
 * Normalise a value for comparison: parse as JSON so key order and whitespace
 * are irrelevant, falling back to a trimmed string compare for XML, CSV and
 * plain text.
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
 * Turn a compiler proxy's `output` field back into the text the script produced.
 *
 * The legacy proxy JSON-parses the compiler's output, so a top-level JSON string
 * such as `"Alice, Bob"` arrives as the bare value `Alice, Bob` and could never
 * equal a correct expectation of `"Alice, Bob"` (issue #12). For a JSON-output
 * script, a string that is not itself valid JSON text is re-encoded; one that
 * already parses is left alone. Non-JSON outputs are never touched.
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

/** Functions known to be missing from the open-source engine the old upstream ran. */
const KNOWN_UNSUPPORTED: Readonly<Record<string, string>> = {
  then:
    "`then` is not available in the DataWeave engine this site runs. " +
    "Bind the value instead, e.g. `do { var v = <expr> --- f(v) }`, or call a local `fun`.",
};

const UNRESOLVED = /Unable to resolve reference of ([A-Za-z_][\w:]*)/;

/**
 * Make "Unable to resolve reference of X" understandable (issue #8). The
 * original compiler message is always kept, unchanged, at the top.
 */
export function explainCompilerError(message: string): string {
  const match = UNRESOLVED.exec(message);
  if (!match) return message;

  const name = match[1] ?? "";
  const known = KNOWN_UNSUPPORTED[name];
  const hint = known
    ? `Hint: ${known}`
    : `Hint: \`${name}\` is not defined. Check the spelling and that its module is imported ` +
      "(e.g. `import * from dw::core::Strings`). A few functions from the Mule runtime are " +
      "also missing from the open-source engine this site runs.";
  return `${message}\n\n${hint}`;
}

/**
 * Grade `code` against a problem's cases.
 *
 * Falls back to the first example when a problem defines no test cases. A
 * problem with neither is unverifiable and grades `Attempted` — never
 * `Accepted`, which is the safe direction.
 */
export async function gradeCases(
  run: RunCase,
  code: string,
  testCases: TestCase[],
  examples: Example[] = [],
  hiddenTestCases: TestCase[] = [],
  now: () => number = Date.now,
): Promise<GradeResult> {
  const started = now();
  const elapsed = () => `${now() - started}ms`;

  if (typeof code !== "string" || !code.trim()) {
    return { status: "Error", results: [], summary: "✗ Error:\nNo code submitted.", executionTime: "0ms", output: "" };
  }
  if (code.length > LIMITS.code.maxLength) {
    return {
      status: "Error",
      results: [],
      summary: `✗ Error:\nSubmission exceeds the ${LIMITS.code.maxLength.toLocaleString()} character limit.`,
      executionTime: "0ms",
      output: "",
    };
  }

  const first = examples[0];
  const visible: TestCase[] =
    testCases.length > 0 ? testCases : first ? [{ input: first.input, expectedOutput: first.output }] : [];
  const cases = [
    ...visible.map((tc) => ({ ...tc, hidden: false })),
    ...hiddenTestCases.map((tc) => ({ ...tc, hidden: true })),
  ].slice(0, LIMITS.grading.maxTests);

  if (cases.length === 0) {
    return {
      status: "Attempted",
      results: [],
      summary: "⚠ No test cases defined. Cannot verify correctness.",
      executionTime: elapsed(),
      output: "",
    };
  }

  const results: TestResult[] = [];
  const lines: string[] = [];
  let allPassed = true;
  let status: GradeStatus = "Attempted";
  let firstOutput = "";

  for (let i = 0; i < cases.length; i++) {
    if (now() - started > LIMITS.grading.totalBudgetMs) {
      allPassed = false;
      lines.push(`Test ${i + 1}: ✗ Skipped — grading time budget exceeded.`);
      break;
    }

    const tc = cases[i]!;
    const outcome = await run(code, tc.input);

    if (outcome.kind === "unavailable") {
      return {
        status: "Error",
        results,
        summary: `✗ The compiler is unavailable. Nothing was recorded — please submit again.\n${outcome.message}`,
        executionTime: elapsed(),
        output: "",
        unavailable: true,
      };
    }

    const output = outcome.kind === "ok" ? outcome.output : outcome.message;
    if (i === 0) firstOutput = output;

    if (outcome.kind === "error") {
      allPassed = false;
      status = "Error";
      if (tc.hidden) {
        results.push({ index: i, passed: false, hidden: true, error: "Error on a hidden test.", expected: "", actual: "" });
        lines.push(`Hidden test ${i + 1}: ✗ Error — your code failed on a hidden input.`);
      } else {
        results.push({ index: i, passed: false, error: outcome.message, expected: tc.expectedOutput, actual: "" });
        lines.push(`Test ${i + 1}: ✗ Error — ${outcome.message}`);
      }
      break;
    }

    const passed = normalizeOutput(outcome.output) === normalizeOutput(tc.expectedOutput);
    if (!passed) allPassed = false;

    if (tc.hidden) {
      results.push({ index: i, passed, hidden: true, expected: "", actual: "" });
      lines.push(`Hidden test ${i + 1}: ${passed ? "✓ Passed" : "✗ Failed"}`);
      continue;
    }

    results.push({ index: i, passed, expected: tc.expectedOutput, actual: outcome.output });
    lines.push(
      `Test ${i + 1}: ${passed ? "✓ Passed" : "✗ Failed"}\n` +
        `  Expected: ${tc.expectedOutput.slice(0, 120)}\n` +
        `  Got:      ${outcome.output.slice(0, 120)}`,
    );
  }

  if (status !== "Error") status = allPassed ? "Accepted" : "Attempted";

  return { status, results, summary: lines.join("\n\n"), executionTime: elapsed(), output: firstOutput };
}
