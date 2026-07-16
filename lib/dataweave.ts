/**
 * Shared core for running a single DataWeave transform against the compiler
 * backend. Used by both `/api/execute` (one run) and `/api/execute/batch`
 * (many runs in one request) so the two paths share identical validation,
 * caching, and timeout behaviour — and hit the same result cache.
 *
 * This deliberately does NOT rate-limit; that's a per-request concern the
 * route handlers own (a batch is one user action, not N).
 */
import {
  cacheKey,
  cacheGet,
  cacheSet,
  BACKEND_TIMEOUT_MS,
} from "@/lib/executeGuards";

const BACKEND_URL = "https://dwlbackend.onrender.com/api/transform";

export type TransformResult = {
  success: boolean;
  output: string;
  time: string;
};

/**
 * Compile + run one DataWeave script against one input payload.
 *
 * `rawInput` is the raw string from the client; it's parsed to JSON when
 * possible so the backend receives a real value, not a quoted string.
 * Never throws — all failure modes are returned as `{ success: false }`.
 */
export async function runTransform(
  code: string,
  rawInput: string
): Promise<TransformResult> {
  if (!code || !code.trim().startsWith("%dw")) {
    return {
      success: false,
      output: "Error: Invalid DataWeave script. Script must start with %dw 2.0",
      time: "0ms",
    };
  }

  // Parse the input string into a real JSON value so the backend gets
  // { name: "payload", value: <object> } not { name: "payload", value: "<string>" }
  let parsedInput: unknown = {};
  try {
    parsedInput = JSON.parse(rawInput || "{}");
  } catch {
    parsedInput = rawInput || {};
  }

  // DataWeave scripts are pure, so an identical {script, inputs} pair always
  // yields the same result — serve repeats without touching the backend.
  const key = cacheKey(code, parsedInput);
  const cached = cacheGet(key);
  if (cached !== undefined) {
    return { ...(cached as Omit<TransformResult, "time">), time: "0ms (cached)" };
  }

  const start = Date.now();

  let response: Response;
  try {
    response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: code,
        inputs: [{ name: "payload", value: parsedInput }],
      }),
      // Don't let a hung compile occupy a connection indefinitely; a pile-up
      // of these is what turns a slow backend into a fully wedged one.
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (networkErr: any) {
    const timedOut = networkErr?.name === "TimeoutError";
    return {
      success: false,
      output: timedOut
        ? `The DataWeave compiler took too long to respond (>${BACKEND_TIMEOUT_MS / 1000}s) and the request was aborted. It may be overloaded — please retry in a moment.`
        : `Connection error: Could not reach the DataWeave compiler at ${BACKEND_URL}.\n` +
          `Make sure your Docker container is running.\n\n${networkErr.message}`,
      time: "0ms",
    };
  }

  const executionTime = Date.now() - start;

  let data: any;
  try {
    data = await response.json();
  } catch {
    const text = await response.text();
    return {
      success: false,
      output: `Backend returned non-JSON response:\n${text}`,
      time: `${executionTime}ms`,
    };
  }

  if (!response.ok || data.error) {
    return {
      success: false,
      output: data.error || data.message || `Compilation failed (HTTP ${response.status})`,
      time: `${executionTime}ms`,
    };
  }

  const result = {
    success: true,
    output:
      typeof (data.output ?? data.result) === "string"
        ? (data.output ?? data.result)
        : JSON.stringify(data.output ?? data.result, null, 2),
  };

  // Only successful runs are cached — never memoize a backend outage.
  cacheSet(key, result);

  return { ...result, time: `${executionTime}ms` };
}
