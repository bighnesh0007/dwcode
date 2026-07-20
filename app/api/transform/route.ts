import { NextResponse } from "next/server";
import { DWL_BACKEND_URL } from "@/lib/config";
import { getErrorMessage } from "@/lib/errors";

/**
 * Proxy to the DataWeave compiler backend.
 * Backend URL is controlled by DWL_BACKEND_URL in .env.local.
 *
 * Accepted body shape (sent by the playground):
 *   {
 *     script: string,
 *     inputs: Array<{
 *       name:     string,
 *       value:    any,
 *       mimeType: string   // e.g. "application/json", "application/xml", "text/plain"
 *     }>
 *   }
 *
 * Rules per MIME type:
 *   application/json  → parse string → object (existing behaviour)
 *   everything else   → keep as raw string (XML, CSV, YAML, plain text, etc.)
 *
 * The backend must understand the mimeType field to parse correctly.
 */

const JSON_MIME = "application/json";

type RawInput = {
    name?: unknown;
    value?: unknown;
    mimeType?: unknown;
};

function normaliseInput(item: RawInput, index: number) {
    const name = typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : `input${index}`;
    const mime = typeof item.mimeType === "string" && item.mimeType.trim()
        ? item.mimeType.trim()
        : JSON_MIME;
    const isJson = mime === JSON_MIME;

    let value: unknown = item.value;

    if (isJson) {
        // JSON inputs: parse string → object so the backend gets a structured value
        if (typeof value === "string") {
            try { value = JSON.parse(value); } catch { /* keep as string */ }
        }
    } else {
        // Non-JSON inputs: always send as raw string — do NOT parse
        if (typeof value !== "string") {
            if (value == null) value = "";
            else if (typeof value === "object") value = JSON.stringify(value, null, 2) ?? "";
            else if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
                value = value.toString();
            } else if (typeof value === "symbol") value = value.description ?? "";
            else value = "";
        }
    }

    return { name, value, mimeType: mime };
}

export async function POST(request: Request) {
    const start = Date.now();
    try {
        const body = await request.json();
        const { script, inputs } = body;

        if (!script || typeof script !== "string" || !script.trim()) {
            return NextResponse.json(
                { success: false, output: "Missing or empty 'script' field.", time: "0ms" },
                { status: 400 }
            );
        }

        // ── Normalise inputs ──────────────────────────────────────────────────────
        let normalisedInputs: ReturnType<typeof normaliseInput>[] = [];

        if (Array.isArray(inputs) && inputs.length > 0) {
            normalisedInputs = inputs.map((item, i) => normaliseInput(item as RawInput, i));
        } else if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
            // Legacy shape B: { payload: "..." }
            normalisedInputs = Object.entries(inputs as Record<string, unknown>).map(([name, val]) => {
                let v: unknown = val;
                if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* keep */ } }
                return { name, value: v, mimeType: JSON_MIME };
            });
        }

        if (normalisedInputs.length === 0) {
            normalisedInputs = [{ name: "payload", value: {}, mimeType: JSON_MIME }];
        }

        console.log(`[transform] script=${script.slice(0, 60).replace(/\n/g, " ")}…`);
        console.log(`[transform] inputs=${normalisedInputs.map(i => `${i.name}(${i.mimeType})`).join(", ")}`);

        // ── Forward to backend ────────────────────────────────────────────────────
        let response: Response;
        try {
            response = await fetch(`${DWL_BACKEND_URL}/api/transform`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ script, inputs: normalisedInputs }),
            });
        } catch (networkErr) {
            const elapsed = Date.now() - start;
            console.error(`[transform] network error after ${elapsed}ms:`, getErrorMessage(networkErr));
            return NextResponse.json(
                {
                    success: false,
                    output:
                        `Connection error: Could not reach the DataWeave compiler at ${DWL_BACKEND_URL}.\n` +
                        `Make sure your Docker container is running.\n\n${getErrorMessage(networkErr)}`,
                    time: "0ms",
                },
                { status: 503 }
            );
        }

        let data: { error?: string; message?: string; output?: unknown; result?: unknown; time?: string };
        try {
            data = await response.json();
        } catch {
            const text = await response.text();
            console.error("[transform] non-JSON backend response:", text.slice(0, 200));
            return NextResponse.json(
                { success: false, output: `Backend returned non-JSON response:\n${text}`, time: "0ms" },
                { status: 502 }
            );
        }

        const elapsed = Date.now() - start;
        console.log(`[transform] backend responded in ${elapsed}ms — ok=${response.ok}`);

        if (!response.ok || data.error) {
            return NextResponse.json(
                {
                    success: false,
                    output: data.error || data.message || `Compilation failed (HTTP ${response.status})`,
                    time: data.time ?? "0ms",
                },
                { status: response.ok ? 200 : response.status }
            );
        }

        const rawOutput = data.output ?? data.result;
        return NextResponse.json({
            success: true,
            output: typeof rawOutput === "string"
                ? rawOutput
                : JSON.stringify(rawOutput, null, 2),
            time: data.time ?? `${elapsed}ms`,
        });
    } catch (err) {
        console.error("[transform] unhandled error:", err);
        return NextResponse.json(
            { success: false, output: getErrorMessage(err), time: "0ms" },
            { status: 500 }
        );
    }
}
