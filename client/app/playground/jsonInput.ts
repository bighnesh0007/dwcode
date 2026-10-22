/**
 * Parsing for the playground's JSON input files (payload.json, vars.json, …).
 *
 * Issue #18: people write inputs the way DataWeave writes objects —
 * `{ message: "Hello World" }`, with unquoted keys — and strict JSON.parse
 * rejected it. The raw text was then sent to the compiler labelled as JSON,
 * which failed with an unhelpful error.
 *
 * Strict JSON is tried first, so valid JSON is never reinterpreted. Anything
 * else goes through JSON5, which also accepts unquoted keys, single-quoted
 * strings, trailing commas and comments. If neither parses, the caller gets an
 * InputParseError naming the file and the position instead of a compiler error.
 */
import JSON5 from "json5";

export class InputParseError extends Error {
  constructor(readonly fileName: string, detail: string) {
    super(
      `${fileName} is not valid JSON: ${detail}\n\n` +
        "Keys may be unquoted ({ message: \"Hi\" }), but strings must be quoted " +
        "and objects and arrays must be closed.",
    );
    this.name = "InputParseError";
  }
}

/** Parse a JSON input file leniently. Throws InputParseError when it cannot. */
export function parseJsonInput(fileName: string, content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // Fall through to the lenient parser.
  }
  try {
    return JSON5.parse(content);
  } catch (err) {
    // JSON5's messages read "JSON5: invalid character 'x' at 1:5".
    const detail = err instanceof Error ? err.message.replace(/^JSON5:\s*/, "") : "could not be parsed";
    throw new InputParseError(fileName, detail);
  }
}
