/**
 * The grading tests below were written against client/lib/grading.ts, which
 * ran each case through `fetch` to the legacy /api/transform shape. That module
 * is gone (grading runs in server/ now) but the RULES it tested live on in
 * gradeCases (@dwcode/shared). This re-creates its runner over a stubbed global
 * fetch so those tests keep testing the same rules, unchanged.
 */
import { explainCompilerError, formatCompilerOutput, gradeCases, type CaseOutcome, type TestCase } from "@dwcode/shared";

async function runOnce(code: string, input: string): Promise<CaseOutcome> {
  let parsedInput: unknown = {};
  try {
    parsedInput = JSON.parse(input || "{}");
  } catch {
    parsedInput = input || {};
  }
  let response: Response;
  try {
    response = await fetch("http://compiler.test/api/transform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: code, inputs: [{ name: "payload", value: parsedInput }] }),
    });
  } catch (err) {
    return { kind: "error", message: `Could not reach the DataWeave compiler: ${err instanceof Error ? err.message : String(err)}` };
  }
  let data: { error?: string; message?: string; output?: unknown; result?: unknown };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return { kind: "error", message: `Compiler returned a non-JSON response (HTTP ${response.status}).` };
  }
  if (!response.ok || data.error) {
    return { kind: "error", message: explainCompilerError(data.error || data.message || `Compilation failed (HTTP ${response.status})`) };
  }
  return { kind: "ok", output: formatCompilerOutput(data.output ?? data.result, code) };
}

export function gradeSubmission(
  code: string,
  testCases: TestCase[],
  examples: { input: string; output: string }[] = [],
  hiddenTestCases: TestCase[] = [],
) {
  return gradeCases(runOnce, code, testCases, examples, hiddenTestCases);
}
