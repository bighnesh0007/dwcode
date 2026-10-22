/**
 * Compiler access for maintenance scripts.
 *
 * Mirrors client/lib/grading.ts (which is TypeScript, so scripts cannot import
 * it): same request shape, same output formatting, same normalisation. A pass
 * here therefore means a pass for a user submitting the same code.
 */
export const COMPILER_URL = (process.env.DWL_BACKEND_URL || "https://dataweave-playground-h1p7.onrender.com").replace(/\/$/, "");

export function normalizeOutput(value) {
  try {
    return JSON.stringify(JSON.parse(value.trim()));
  } catch {
    return value.trim();
  }
}

export function formatCompilerOutput(raw, script) {
  if (typeof raw === "string") {
    const header = script.split(/^---\s*$/m)[0] ?? "";
    const isJsonOutput = /^\s*output\s+(?:application\/json|json)\b/m.test(header);
    let isJsonText = true;
    try {
      JSON.parse(raw);
    } catch {
      isJsonText = false;
    }
    return !isJsonOutput || isJsonText ? raw : JSON.stringify(raw);
  }
  return JSON.stringify(raw, null, 2);
}

/** Run `script` against one input. Throws with the compiler's message on failure. */
export async function runScript(script, input) {
  let value = {};
  try {
    value = JSON.parse(input || "{}");
  } catch {
    value = input || {};
  }
  const response = await fetch(`${COMPILER_URL}/api/transform`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, inputs: [{ name: "payload", value }] }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(String(data.error || data.message || `HTTP ${response.status}`));
  }
  return formatCompilerOutput(data.output ?? data.result, script);
}

/** Every case a problem defines, labelled. Examples first, then visible, then hidden. */
export function casesOf(problem) {
  return [
    ...(problem.examples ?? []).map((e, i) => ({ kind: "example", label: `example ${i + 1}`, input: e.input, expected: e.output })),
    ...(problem.testCases ?? []).map((t, i) => ({ kind: "test", label: `test ${i + 1}`, input: t.input, expected: t.expectedOutput })),
    ...(problem.hiddenTestCases ?? []).map((t, i) => ({ kind: "hidden", label: `hidden ${i + 1}`, input: t.input, expected: t.expectedOutput })),
  ];
}

/** Run `script` against every case; returns per-case results. Never throws. */
export async function checkCases(script, cases) {
  const results = [];
  for (const c of cases) {
    let actual;
    try {
      actual = await runScript(script, c.input);
    } catch (err) {
      actual = `<compiler error: ${err.message}>`;
    }
    results.push({ ...c, actual, passed: normalizeOutput(actual) === normalizeOutput(c.expected) });
  }
  return results;
}
