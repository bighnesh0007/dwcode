import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  cacheKey,
  cacheGet,
  cacheSet,
  checkRateLimit,
  BACKEND_TIMEOUT_MS,
} from "@/lib/executeGuards";

/**
 * Proxy to the DataWeave compiler backend (port 4000).
 * Used by the problem Workspace.
 *
 * Accepts: { code: string, input: string }
 * Returns: { success: boolean, output: string, time: string }
 *
 * The backend is a JVM that compiles + runs each script, so this route is the
 * hot path that overwhelms a small instance. It's protected by three in-memory
 * guards (see lib/executeGuards.ts): a per-identity rate limit, a result cache
 * for identical runs, and a hard timeout on the backend fetch.
 */
export async function POST(req: Request) {
  try {
    const { code, input } = await req.json();

    if (!code || !code.trim().startsWith("%dw")) {
      return NextResponse.json({
        success: false,
        output: "Error: Invalid DataWeave script. Script must start with %dw 2.0",
        time: "0ms",
      });
    }

    // --- Rate limit: cap runs per user (or per IP for anonymous callers) so a
    // single client — or a runaway loop — can't saturate the compiler. ---
    const { userId } = await auth();
    const identity =
      userId ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anonymous";
    const rate = checkRateLimit(identity);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          success: false,
          output: `Rate limit exceeded — too many executions. Try again in ${rate.retryAfterSec}s.`,
          time: "0ms",
        },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    // Parse the input string into a real JSON value so the backend gets
    // { name: "payload", value: <object> } not { name: "payload", value: "<string>" }
    let parsedInput: unknown = {};
    try {
      parsedInput = JSON.parse(input || "{}");
    } catch {
      parsedInput = input || {};
    }

    // --- Cache: DataWeave scripts are pure, so an identical {script, inputs}
    // pair always yields the same result. On a practice site the same reference
    // solutions get submitted over and over — serve those without a backend hit. ---
    const key = cacheKey(code, parsedInput);
    const cached = cacheGet(key);
    if (cached !== undefined) {
      return NextResponse.json({
        ...(cached as object),
        time: "0ms (cached)",
      });
    }

    const start = Date.now();

    let response: Response;
    try {
      response = await fetch("https://dwlbackend.onrender.com/api/transform", {
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
      return NextResponse.json({
        success: false,
        output: timedOut
          ? `The DataWeave compiler took too long to respond (>${BACKEND_TIMEOUT_MS / 1000}s) and the request was aborted. It may be overloaded — please retry in a moment.`
          : `Connection error: Could not reach the DataWeave compiler at https://dwlbackend.onrender.com.\n` +
            `Make sure your Docker container is running.\n\n${networkErr.message}`,
        time: "0ms",
      });
    }

    const executionTime = Date.now() - start;

    let data: any;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      return NextResponse.json({
        success: false,
        output: `Backend returned non-JSON response:\n${text}`,
        time: `${executionTime}ms`,
      });
    }

    if (!response.ok || data.error) {
      return NextResponse.json({
        success: false,
        output: data.error || data.message || `Compilation failed (HTTP ${response.status})`,
        time: `${executionTime}ms`,
      });
    }

    const result = {
      success: true,
      output: typeof (data.output ?? data.result) === "string"
        ? (data.output ?? data.result)
        : JSON.stringify(data.output ?? data.result, null, 2),
    };

    // Only successful runs are cached — never memoize a backend outage.
    cacheSet(key, result);

    return NextResponse.json({ ...result, time: `${executionTime}ms` });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, output: error.message, time: "0ms" },
      { status: 500 }
    );
  }
}
