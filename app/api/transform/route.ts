import { NextResponse } from "next/server";

/**
 * Proxy to the DataWeave compiler backend at https://dwlbackend.onrender.com.
 *
 * Accepts either of two shapes from the frontend:
 *   A) { script: string, inputs: Array<{ name: string, value: any }> }   ← already correct
 *   B) { script: string, inputs: { [name]: string|object } }             ← legacy object form
 *
 * Always forwards to the backend as shape A.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { script, inputs } = body;

        if (!script) {
            return NextResponse.json(
                { success: false, output: "Missing 'script' field", time: "0ms" },
                { status: 400 }
            );
        }

        // ── Normalise inputs → Array<{ name, value }> ──────────────────────────
        let normalisedInputs: { name: string; value: unknown }[] = [];

        if (Array.isArray(inputs)) {
            // Shape A — already correct, just make sure value is parsed if it's a string
            normalisedInputs = inputs.map((item: any) => {
                let val = item.value;
                if (typeof val === "string") {
                    try { val = JSON.parse(val); } catch { /* keep as string */ }
                }
                return { name: item.name, value: val };
            });
        } else if (inputs && typeof inputs === "object") {
            // Shape B — { payload: "..." } or { payload: {...} }
            normalisedInputs = Object.entries(inputs).map(([name, val]) => {
                if (typeof val === "string") {
                    try { val = JSON.parse(val); } catch { /* keep as string */ }
                }
                return { name, value: val };
            });
        }

        // If no inputs provided at all, pass an empty payload
        if (normalisedInputs.length === 0) {
            normalisedInputs = [{ name: "payload", value: {} }];
        }

        const backendBody = { script, inputs: normalisedInputs };

        // ── Forward to backend ─────────────────────────────────────────────────
        let response: Response;
        try {
            response = await fetch("https://dwlbackend.onrender.com/api/transform", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(backendBody),
            });
        } catch (networkErr: any) {
            return NextResponse.json(
                {
                    success: false,
                    output:
                        `Connection error: Could not reach the DataWeave compiler at https://dwlbackend.onrender.com.\n` +
                        `Make sure your Docker container is running.\n\n${networkErr.message}`,
                    time: "0ms",
                },
                { status: 503 }
            );
        }

        let data: any;
        try {
            data = await response.json();
        } catch {
            const text = await response.text();
            return NextResponse.json(
                { success: false, output: `Backend returned non-JSON response:\n${text}`, time: "0ms" },
                { status: 502 }
            );
        }

        if (!response.ok || data.error) {
            return NextResponse.json(
                {
                    success: false,
                    output: data.error || data.message || `Compilation failed (HTTP ${response.status})`,
                    time: data.time ?? "0ms",
                },
                { status: response.status }
            );
        }

        return NextResponse.json({
            success: true,
            output: typeof (data.output ?? data.result) === "string"
                ? (data.output ?? data.result)
                : JSON.stringify(data.output ?? data.result, null, 2),
            time: data.time ?? "0ms",
        });
    } catch (err: any) {
        return NextResponse.json(
            { success: false, output: err.message, time: "0ms" },
            { status: 500 }
        );
    }
}
