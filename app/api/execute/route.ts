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

    // The backend returns `output` as the DECODED value, not serialized text:
    //   - application/json      → a real JSON value (string | number | object | array)
    //   - other formats (csv…)  → the already-serialized text as a string
    // For JSON output we must re-serialize so a top-level string keeps its quotes
    // (e.g. "Alice, Bob, Carol"), matching what `output application/json` produces.
    // For non-JSON formats the string is the final rendered text — pass it through.
    const value = data.output ?? data.result;
    const outputMime = /output\s+([\w./+-]+)/i.exec(code)?.[1]?.toLowerCase() ?? "application/json";
    const isJsonOutput = outputMime.includes("json");

    return NextResponse.json({
      success: true,
      output: !isJsonOutput && typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2),
      time: `${executionTime}ms`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, output: error.message, time: "0ms" },
      { status: 500 }
    );
  }
}
