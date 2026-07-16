import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit } from "@/lib/executeGuards";
import { runTransform, type TransformResult } from "@/lib/dataweave";

/**
 * Batch variant of /api/execute. Runs ONE script against MANY inputs in a
 * single request — the shape a "Submit" produces (custom input + every test
 * case). This collapses what used to be 1 + N sequential browser→server
 * round-trips into one, cutting both latency and connection churn on the
 * DataWeave backend. Each run still flows through the shared cache/timeout
 * guards in lib/dataweave.ts.
 *
 * Accepts: { code: string, inputs: string[] }
 * Returns: { results: { success, output, time }[] }  (same order as inputs)
 */

/** Cap batch size so one request can't fan out into an unbounded backend burst. */
const MAX_BATCH = 25;

export async function POST(req: Request) {
  try {
    const { code, inputs } = await req.json();

    if (!Array.isArray(inputs) || inputs.length === 0) {
      return NextResponse.json(
        { error: "`inputs` must be a non-empty array of strings." },
        { status: 400 }
      );
    }
    if (inputs.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Too many inputs (max ${MAX_BATCH} per batch).` },
        { status: 400 }
      );
    }

    // One batch is one user action, so it costs a single rate-limit token —
    // not N. This is the whole point: Submit no longer burns the per-minute
    // budget in one click.
    const { userId } = await auth();
    const identity =
      userId ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anonymous";
    const rate = checkRateLimit(identity);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded — too many executions. Try again in ${rate.retryAfterSec}s.`,
          retryAfterSec: rate.retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    // Run sequentially: the backend is the constrained resource, so firing all
    // inputs at once would just recreate the burst we're trying to avoid.
    // Cache hits (repeat runs, identical test cases) return instantly anyway.
    const results: TransformResult[] = [];
    for (const input of inputs) {
      results.push(await runTransform(code, typeof input === "string" ? input : String(input ?? "")));
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Batch execution failed." },
      { status: 500 }
    );
  }
}
