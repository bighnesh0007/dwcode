/**
 * Issue #8 — hints for functions the compiler's engine does not have.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { explainCompilerError } from "@/lib/compilerErrors";
import { gradeSubmission } from "@/lib/grading";

const THEN_ERROR = "Unable to resolve reference of then.\n4| 1 then ((v) -> v)\n     ^^^^";

describe("explainCompilerError", () => {
    it("explains `then`, keeping the original message first", () => {
        const out = explainCompilerError(THEN_ERROR);
        expect(out.startsWith(THEN_ERROR)).toBe(true);
        expect(out).toMatch(/`then` is not available/);
        expect(out).toContain("do {");
    });

    it("gives a generic hint for other unresolved names", () => {
        const out = explainCompilerError("Unable to resolve reference of pluralise.");
        expect(out).toMatch(/`pluralise` is not defined/);
        expect(out).toContain("import * from dw::core::Strings");
    });

    it("leaves other errors untouched", () => {
        const msg = "Unexpected end of input, expected '}'";
        expect(explainCompilerError(msg)).toBe(msg);
    });
});

describe("grading surfaces the hint", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("appends it to a visible test's compiler error", async () => {
        vi.stubGlobal("fetch", vi.fn(() =>
            Promise.resolve(new Response(JSON.stringify({ error: THEN_ERROR }), { status: 400 })),
        ));
        const result = await gradeSubmission("%dw 2.0\noutput json\n---\n1 then ((v) -> v)", [
            { input: "{}", expectedOutput: "1" },
        ]);
        expect(result.status).toBe("Error");
        expect(result.summary).toMatch(/`then` is not available/);
    });
});
