/**
 * formatCompilerOutput — issue #12.
 *
 * The compiler proxy JSON-parses output, so a JSON string result arrives
 * unquoted. These tests pin that it is re-quoted for JSON scripts only, and that
 * a correct submission now matches its expected output.
 */
import { describe, it, expect } from "vitest";
import { formatCompilerOutput, normalizeOutput } from "@/lib/grading";

const JSON_SCRIPT = '%dw 2.0\noutput application/json\n---\npayload joinBy ", "';

describe("formatCompilerOutput", () => {
    it("re-quotes a top-level string from a JSON-output script", () => {
        expect(formatCompilerOutput("Alice, Bob, Carol", JSON_SCRIPT)).toBe('"Alice, Bob, Carol"');
    });

    it("accepts the short `output json` form", () => {
        expect(formatCompilerOutput("Dave", "%dw 2.0\noutput json\n---\n\"Dave\"")).toBe('"Dave"');
    });

    it("leaves raw documents from non-JSON outputs untouched", () => {
        const xml = '<?xml version="1.0"?>\n<a>1</a>';
        expect(formatCompilerOutput(xml, "%dw 2.0\noutput application/xml\n---\n{a: 1}")).toBe(xml);
        expect(formatCompilerOutput("a,b\n1,2", "%dw 2.0\noutput application/csv\n---\npayload")).toBe("a,b\n1,2");
    });

    it("ignores the word `output` in the script body", () => {
        const script = '%dw 2.0\noutput application/xml\n---\n// output application/json\n{a: 1}';
        expect(formatCompilerOutput("<a>1</a>", script)).toBe("<a>1</a>");
    });

    it("does not double-encode a backend that returns unparsed JSON text", () => {
        expect(formatCompilerOutput('{"ok":true}', JSON_SCRIPT)).toBe('{"ok":true}');
        expect(formatCompilerOutput('"Alice"', JSON_SCRIPT)).toBe('"Alice"');
    });

    it("pretty-prints non-string values as before", () => {
        expect(formatCompilerOutput({ a: 1 }, JSON_SCRIPT)).toBe('{\n  "a": 1\n}');
        expect(formatCompilerOutput(42, JSON_SCRIPT)).toBe("42");
    });

    it("makes a correct string-output submission match its expected output", () => {
        const actual = formatCompilerOutput("Alice, Bob, Carol", JSON_SCRIPT);
        expect(normalizeOutput(actual)).toBe(normalizeOutput('"Alice, Bob, Carol"'));
    });
});
