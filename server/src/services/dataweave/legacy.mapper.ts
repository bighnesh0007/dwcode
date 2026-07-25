/**
 * Legacy request-normalisation, ported from server.js.
 *
 * These two functions encode quirks that callers depend on. They are covered by
 * characterization tests; do not "clean them up".
 */
import type { Logger } from "pino";
import type { LegacyInput } from "./dataweave.client.ts";

/**
 * `normalizeDataWeaveScript` from server.js.
 *
 * Rules, in order:
 *  - non-string  -> returned untouched (the client then throws on it)
 *  - contains a real newline -> untouched
 *  - contains literal `\n` sequences -> those become real newlines
 *  - otherwise   -> untouched
 */
export function normalizeLegacyScript(script: unknown): unknown {
  if (typeof script !== "string") return script;
  if (script.includes("\n")) return script;
  if (script.includes("\\n")) return script.replace(/\\n/g, "\n");
  return script;
}

/**
 * `normalizeInputs` from server.js.
 *
 * An array maps each item to `{ name, value, mimeType ?? "application/json" }`.
 * ANYTHING else — including `undefined` — becomes `[]`. The original additionally
 * logged a warning when a non-array, non-undefined value arrived; that warning is
 * preserved because it is the only signal that a caller is malformed.
 */
export function normalizeLegacyInputs(inputs: unknown, log?: Logger): LegacyInput[] {
  if (Array.isArray(inputs)) {
    return inputs.map((input: unknown) => {
      const item = (input ?? {}) as { name?: unknown; value?: unknown; mimeType?: unknown };
      return {
        name: item.name,
        value: item.value,
        mimeType:
          typeof item.mimeType === "string" && item.mimeType
            ? item.mimeType
            : "application/json",
      };
    });
  }

  if (typeof inputs !== "undefined") {
    log?.warn(
      { receivedType: typeof inputs },
      "[api] inputs was not an array; defaulting to []",
    );
  }

  return [];
}
