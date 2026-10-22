/**
 * Issue #10 — hidden test cases.
 *
 * Visible test cases reach the browser with their expected outputs, so a
 * submission that just prints the expected output passes them. Hidden cases are
 * what stop that, and they must never leak their own inputs or expectations.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { gradeSubmission } from "@/lib/grading";

const CODE = "%dw 2.0\noutput application/json\n---\npayload";

/** Stub the compiler: returns `outputs[n]` for the nth call. */
function mockCompiler(outputs: (string | { fail: string })[]) {
    let call = 0;
    return vi.fn(() => {
        const next = outputs[Math.min(call++, outputs.length - 1)];
        if (typeof next === "object") {
            return Promise.resolve(new Response(JSON.stringify({ error: next.fail }), { status: 400 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ output: next }), { status: 200 }));
    });
}

afterEach(() => vi.unstubAllGlobals());

const VISIBLE = [{ input: '{"n":1}', expectedOutput: '{"r":1}' }];
const HIDDEN = [{ input: '{"n":2}', expectedOutput: '{"r":"secret-2"}' }];

describe("gradeSubmission — hidden test cases", () => {
    it("rejects a hardcoded answer that only satisfies the visible case", async () => {
        // A copy-pasted expected output returns the same value for every input.
        vi.stubGlobal("fetch", mockCompiler(['{"r":1}', '{"r":1}']));
        const result = await gradeSubmission(CODE, VISIBLE, [], HIDDEN);
        expect(result.status).toBe("Attempted");
        expect(result.results[1]).toMatchObject({ hidden: true, passed: false });
    });

    it("accepts a solution that passes visible and hidden cases", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"r":1}', '{"r":"secret-2"}']));
        const result = await gradeSubmission(CODE, VISIBLE, [], HIDDEN);
        expect(result.status).toBe("Accepted");
    });

    it("never reveals a hidden case's expected or actual output", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"r":1}', '{"r":"leaked-actual"}']));
        const result = await gradeSubmission(CODE, VISIBLE, [], HIDDEN);
        const exposed = JSON.stringify({ summary: result.summary, results: result.results, output: result.output });
        expect(exposed).not.toContain("secret-2");
        expect(exposed).not.toContain("leaked-actual");
        expect(exposed).not.toContain('{\\"n\\":2}');
    });

    it("withholds the compiler message for a hidden-case error", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"r":1}', { fail: 'Cannot coerce "secret-input"' }]));
        const result = await gradeSubmission(CODE, VISIBLE, [], HIDDEN);
        expect(result.status).toBe("Error");
        expect(JSON.stringify(result)).not.toContain("secret-input");
    });

    it("behaves exactly as before when no hidden cases are passed", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"r":1}']));
        const result = await gradeSubmission(CODE, VISIBLE);
        expect(result.status).toBe("Accepted");
        expect(result.results).toHaveLength(1);
    });
});
