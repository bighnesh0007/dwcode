import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit } from "@/lib/executeGuards";
import { runTransform } from "@/lib/dataweave";

/**
 * Proxy to the DataWeave compiler backend (port 4000).
 * Used by the problem Workspace and playground for single runs.
 *
 * Accepts: { code: string, input: string }
 * Returns: { success: boolean, output: string, time: string }
 *
 * The backend is a JVM that compiles + runs each script, so this route is the
 * hot path that overwhelms a small instance. It's protected by a per-identity
 * rate limit here plus the shared caching/timeout guards in lib/dataweave.ts.
 * For evaluating many test cases at once, prefer POST /api/execute/batch.
 */
export async function POST(req: Request) {
  try {
    const { code, input } = await req.json();

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

    const result = await runTransform(code, input);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, output: error.message, time: "0ms" },
      { status: 500 }
    );
  }
}
