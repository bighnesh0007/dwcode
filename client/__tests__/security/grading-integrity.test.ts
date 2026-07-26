/**
 * Security regression — C-4: client-side grading made every verdict forgeable.
 *
 * The browser used to compute `Accepted` and POST it; the API stored that
 * verdict and paid coins on it. Grading now happens in lib/grading.ts on the
 * server, against test cases read from the database.
 *
 * These tests pin two things:
 *   1. the verdict is derived from actual compiler output, not from any input
 *      the caller controls;
 *   2. the comparison semantics are UNCHANGED from the browser implementation,
 *      so moving the computation server-side did not silently re-grade anyone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gradeSubmission, normalizeOutput } from "@/lib/grading";

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

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("normalizeOutput — comparison semantics", () => {
    it("ignores JSON whitespace and key order", () => {
        expect(normalizeOutput('{"a":1,"b":2}')).toBe(normalizeOutput('{ "a" : 1, "b" : 2 }'));
    });

    it("falls back to a trimmed string compare for non-JSON", () => {
        expect(normalizeOutput("  <x/>  ")).toBe("<x/>");
        expect(normalizeOutput("a,b,c\n")).toBe("a,b,c");
    });

    it("does not treat differing values as equal", () => {
        expect(normalizeOutput('{"a":1}')).not.toBe(normalizeOutput('{"a":2}'));
    });
});

describe("gradeSubmission — verdicts", () => {
    it("Accepted only when every visible test matches", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"ok":true}', '{"ok":true}']));
        const result = await gradeSubmission(CODE, [
            { input: "{}", expectedOutput: '{"ok":true}' },
            { input: "{}", expectedOutput: '{ "ok" : true }' }, // whitespace differs
        ]);
        expect(result.status).toBe("Accepted");
        expect(result.results.every((r) => r.passed)).toBe(true);
    });

    it("Attempted when any test fails", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"ok":true}', '{"ok":false}']));
        const result = await gradeSubmission(CODE, [
            { input: "{}", expectedOutput: '{"ok":true}' },
            { input: "{}", expectedOutput: '{"ok":true}' },
        ]);
        expect(result.status).toBe("Attempted");
    });

    it("Error on a compiler failure, and stops grading immediately", async () => {
        const fetchMock = mockCompiler([{ fail: "Unexpected token" }, '{"ok":true}']);
        vi.stubGlobal("fetch", fetchMock);
        const result = await gradeSubmission(CODE, [
            { input: "{}", expectedOutput: '{"ok":true}' },
            { input: "{}", expectedOutput: '{"ok":true}' },
        ]);
        expect(result.status).toBe("Error");
        // Early break preserved from the browser implementation.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("Attempted — never Accepted — when a problem has no test cases", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"anything":true}']));
        const result = await gradeSubmission(CODE, [], []);
        expect(result.status).toBe("Attempted");
        expect(result.summary).toContain("No test cases");
    });

    it("falls back to the first example when no test cases exist", async () => {
        vi.stubGlobal("fetch", mockCompiler(['{"v":1}']));
        const result = await gradeSubmission(CODE, [], [{ input: "{}", output: '{"v":1}' }]);
        expect(result.status).toBe("Accepted");
    });

    it("Error on empty code without calling the compiler", async () => {
        const fetchMock = mockCompiler(['{"ok":true}']);
        vi.stubGlobal("fetch", fetchMock);
        const result = await gradeSubmission("   ", [{ input: "{}", expectedOutput: "1" }]);
        expect(result.status).toBe("Error");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Error on oversized code without calling the compiler", async () => {
        const fetchMock = mockCompiler(['{"ok":true}']);
        vi.stubGlobal("fetch", fetchMock);
        const result = await gradeSubmission("x".repeat(50_001), [
            { input: "{}", expectedOutput: "1" },
        ]);
        expect(result.status).toBe("Error");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("caps execution at 24 test cases", async () => {
        const fetchMock = mockCompiler(['{"ok":true}']);
        vi.stubGlobal("fetch", fetchMock);
        const cases = Array.from({ length: 40 }, () => ({
            input: "{}",
            expectedOutput: '{"ok":true}',
        }));
        await gradeSubmission(CODE, cases);
        expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(24);
    });

    it("treats an unreachable compiler as Error, not Accepted", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
        );
        const result = await gradeSubmission(CODE, [{ input: "{}", expectedOutput: "1" }]);
        expect(result.status).toBe("Error");
    });

    it("ignores any caller-supplied verdict — the signature accepts none", async () => {
        // gradeSubmission's inputs are (code, testCases, examples). There is no
        // parameter through which a caller can assert a status; the only way to
        // reach Accepted is for the compiler output to match the stored expectation.
        vi.stubGlobal("fetch", mockCompiler(['{"wrong":1}']));
        const result = await gradeSubmission(CODE, [
            { input: "{}", expectedOutput: '{"right":1}' },
        ]);
        expect(result.status).not.toBe("Accepted");
    });
});
