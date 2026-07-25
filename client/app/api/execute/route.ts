import { NextResponse } from "next/server";
import { DWL_BACKEND_URL } from "@/lib/config";
import { getErrorMessage } from "@/lib/errors";

/**
 * Proxy to the DataWeave compiler backend.
 * Backend URL is controlled by DWL_BACKEND_URL in .env.local.
 * Used by the problem Workspace.
 *
 * Accepts: { code: string, input: string }
 * Returns: { success: boolean, output: string, time: string }
 */
export async function POST(req: Request) {
  try {
    const { code, input } = await req.json();

    if (!code?.trim().startsWith("%dw")) {
      return NextResponse.json({
        success: false,
        output: "Error: Invalid DataWeave script. Script must start with %dw 2.0",
        time: "0ms",
      });
    }

    // Parse the input string into a real JSON value so the backend gets
    // { name: "payload", value: <object> } not { name: "payload", value: "<string>" }
    let parsedInput: unknown = {};
    try {
      parsedInput = JSON.parse(input || "{}");
    } catch {
      parsedInput = input || {};
    }

    const start = Date.now();

    let response: Response;
    try {
      response = await fetch(`${DWL_BACKEND_URL}/api/transform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: code,
          inputs: [{ name: "payload", value: parsedInput }],
        }),
      });
    } catch (networkErr) {
      return NextResponse.json({
        success: false,
        output:
          `Connection error: Could not reach the DataWeave compiler at ${DWL_BACKEND_URL}.\n` +
          `Make sure your Docker container is running.\n\n${getErrorMessage(networkErr)}`,
        time: "0ms",
      });
    }

    const executionTime = Date.now() - start;

    let data: { error?: string; message?: string; output?: unknown; result?: unknown };
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

    return NextResponse.json({
      success: true,
      output: typeof (data.output ?? data.result) === "string"
        ? (data.output ?? data.result)
        : JSON.stringify(data.output ?? data.result, null, 2),
      time: `${executionTime}ms`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, output: getErrorMessage(error), time: "0ms" },
      { status: 500 }
    );
  }
}
