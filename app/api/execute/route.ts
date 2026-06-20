import { NextResponse } from "next/server";

/**
 * Proxy to the DataWeave compiler backend (port 4000).
 * Used by the problem Workspace.
 *
 * Accepts: { code: string, input: string }
 * Returns: { success: boolean, output: string, time: string }
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
      response = await fetch("https://dwlbackend.onrender.com/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: code,
          inputs: [{ name: "payload", value: parsedInput }],
        }),
      });
    } catch (networkErr: any) {
      return NextResponse.json({
        success: false,
        output:
          `Connection error: Could not reach the DataWeave compiler at https://dwlbackend.onrender.com.\n` +
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

    return NextResponse.json({
      success: true,
      output: typeof (data.output ?? data.result) === "string"
        ? (data.output ?? data.result)
        : JSON.stringify(data.output ?? data.result, null, 2),
      time: `${executionTime}ms`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, output: error.message, time: "0ms" },
      { status: 500 }
    );
  }
}
