/**
 * Issue #18 — playground JSON inputs written DataWeave-style.
 */
import { describe, it, expect } from "vitest";
import { InputParseError, parseJsonInput } from "@/app/playground/jsonInput";

describe("parseJsonInput", () => {
    it("accepts unquoted keys, as in the issue", () => {
        expect(parseJsonInput("vars.json", '{\n  message: "Hello World"\n}')).toEqual({ message: "Hello World" });
    });

    it("still parses strict JSON exactly", () => {
        expect(parseJsonInput("payload.json", '[{"id":1,"name":"alice"}]')).toEqual([{ id: 1, name: "alice" }]);
        expect(parseJsonInput("payload.json", '"just a string"')).toBe("just a string");
        expect(parseJsonInput("payload.json", "42")).toBe(42);
    });

    it("accepts single quotes, trailing commas and comments", () => {
        expect(parseJsonInput("vars.json", "{ a: 'x', b: [1, 2,], // note\n }")).toEqual({ a: "x", b: [1, 2] });
    });

    it("rejects unparseable input with the file name and position", () => {
        expect(() => parseJsonInput("vars.json", "{ message: Hello }")).toThrow(InputParseError);
        try {
            parseJsonInput("vars.json", "{ message: Hello }");
        } catch (e) {
            expect((e as Error).message).toMatch(/^vars\.json is not valid JSON: .*1:\d+/);
        }
    });

    it("rejects an empty file rather than sending an empty string as JSON", () => {
        expect(() => parseJsonInput("vars.json", "   ")).toThrow(InputParseError);
    });
});
