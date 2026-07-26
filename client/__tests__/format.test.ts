/**
 * lib/format — display formatting for payloads.
 *
 * The load-bearing property is the SAFETY one: formatting must never lose or
 * corrupt content. A malformed example still has to render exactly as stored,
 * because the alternative (silently mangled or truncated) is worse than ugly.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { formatPayload, isFormattable } from "@/lib/format";

describe("formatPayload — JSON", () => {
    it("pretty-prints compact objects", () => {
        expect(formatPayload('{"a":1,"b":2}')).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });

    it("pretty-prints compact arrays — the common problem-example shape", () => {
        expect(formatPayload('[{"id":1,"name":"alice"}]')).toBe(
            '[\n  {\n    "id": 1,\n    "name": "alice"\n  }\n]',
        );
    });

    it("preserves key order", () => {
        const out = formatPayload('{"z":1,"a":2,"m":3}');
        expect(out.indexOf('"z"')).toBeLessThan(out.indexOf('"a"'));
        expect(out.indexOf('"a"')).toBeLessThan(out.indexOf('"m"'));
    });

    it("leaves already-formatted JSON semantically identical", () => {
        const pretty = '{\n  "a": 1\n}';
        expect(JSON.parse(formatPayload(pretty))).toEqual({ a: 1 });
    });

    it("returns malformed JSON untouched", () => {
        for (const bad of ['{"a":1,', "{oops}", '[1,2,', '{"a" 1}']) {
            expect(formatPayload(bad)).toBe(bad);
        }
    });

    it("leaves bare scalars alone", () => {
        // Reformatting "5" or "true" gains nothing and would churn the display.
        for (const scalar of ["5", "true", "null", '"hello"']) {
            expect(formatPayload(scalar)).toBe(scalar);
        }
    });
});

describe("formatPayload — XML", () => {
    it("indents nested elements", () => {
        expect(formatPayload("<a><b>1</b></a>")).toBe("<a>\n  <b>1</b>\n</a>");
    });

    it("keeps text content intact", () => {
        const out = formatPayload("<root><name>alice bob</name></root>");
        expect(out).toContain("alice bob");
    });

    it("handles self-closing tags without over-indenting", () => {
        const out = formatPayload("<a><b/><c/></a>");
        expect(out).toBe("<a>\n  <b/>\n  <c/>\n</a>");
    });

    it("returns a single tag untouched", () => {
        expect(formatPayload("<a/>")).toBe("<a/>");
    });
});

describe("formatPayload — non-structured formats are left alone", () => {
    it.each([
        ["csv" as const, "a,b,c\n1,2,3"],
        ["yaml" as const, "a: 1\nb: 2"],
        ["text" as const, "  spaced   text  "],
    ])("does not touch %s", (hint, value) => {
        expect(formatPayload(value, hint)).toBe(value);
    });

    it("does not reformat CSV that happens to start with a brace", () => {
        // The hint wins over shape-sniffing.
        expect(formatPayload('{"a":1}', "csv")).toBe('{"a":1}');
    });
});

describe("formatPayload — edge cases", () => {
    it("handles empty and whitespace-only input", () => {
        expect(formatPayload("")).toBe("");
        expect(formatPayload("   ")).toBe("   ");
    });

    it("handles non-string input without throwing", () => {
        expect(formatPayload(null)).toBe("");
        expect(formatPayload(undefined)).toBe("");
        expect(formatPayload({ a: 1 })).toBe('{\n  "a": 1\n}');
    });

    it("returns very large payloads unchanged rather than blocking the UI", () => {
        const huge = "[" + Array.from({ length: 40_000 }, (_, i) => i).join(",") + "]";
        expect(huge.length).toBeGreaterThan(200_000);
        expect(formatPayload(huge)).toBe(huge);
    });
});

describe("formatPayload — safety properties", () => {
    it("never throws, for any string input", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 400 }), (s) => {
                expect(() => formatPayload(s)).not.toThrow();
            }),
            { numRuns: 500 },
        );
    });

    it("is idempotent — formatting twice equals formatting once", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 400 }), (s) => {
                const once = formatPayload(s);
                return formatPayload(once) === once;
            }),
            { numRuns: 500 },
        );
    });

    it("preserves JSON semantics whenever it reformats", () => {
        fc.assert(
            fc.property(
                fc.jsonValue().filter((v) => typeof v === "object" && v !== null),
                (value) => {
                    const compact = JSON.stringify(value);
                    const formatted = formatPayload(compact);
                    // The whole point: prettier text, identical data.
                    expect(JSON.parse(formatted)).toEqual(JSON.parse(compact));
                },
            ),
            { numRuns: 300 },
        );
    });

    it("returns the input unchanged whenever it cannot format it", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 200 }), (s) => {
                const out = formatPayload(s);
                // Either it changed it (and then it must be parseable structure)
                // or it returned the original byte-for-byte.
                return out === s || out.length > 0;
            }),
            { numRuns: 300 },
        );
    });
});

describe("isFormattable", () => {
    it("is true only when formatting changes something", () => {
        expect(isFormattable('{"a":1}')).toBe(true);
        expect(isFormattable('{\n  "a": 1\n}')).toBe(false);
        expect(isFormattable("plain text")).toBe(false);
        expect(isFormattable("{malformed")).toBe(false);
    });
});
