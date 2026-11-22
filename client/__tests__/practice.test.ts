import { describe, expect, it } from "vitest";
import { codeSize, interviewOutcome, interviewVerdict, rankBySize } from "@dwcode/shared";

describe("codeSize", () => {
  it("ignores whitespace and comments", () => {
    const a = "%dw 2.0\noutput application/json\n---\npayload map $ * 2";
    const b = "%dw 2.0\n// doubled\noutput application/json\n---\n/* each */ payload  map  $ * 2\n";
    expect(codeSize(a)).toBe(codeSize(b));
  });

  it("keeps string contents, including comment markers and spaces", () => {
    expect(codeSize('"a // b"')).toBe(8);
    expect(codeSize("'x y'")).toBe(5);
  });

  it("handles escapes inside strings", () => {
    expect(codeSize('"a\\"b"')).toBe(6);
  });
});

describe("rankBySize", () => {
  it("keeps each user's smallest solution and ranks ascending, earlier solve first on ties", () => {
    const t = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));
    const ranked = rankBySize([
      { userId: "a", code: "payload map $", createdAt: t(1) },
      { userId: "a", code: "payload", createdAt: t(2) },
      { userId: "b", code: "payload", createdAt: t(0) },
      { userId: "c", code: "payload map ($ * 2)", createdAt: t(3) },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["b", "a", "c"]);
  });
});

describe("interview scoring", () => {
  const start = new Date("2026-11-22T10:00:00Z");
  const end = new Date("2026-11-22T11:00:00Z");
  const at = (m: number) => new Date(start.getTime() + m * 60_000);

  it("counts only submissions inside the window, and not compiler errors", () => {
    const o = interviewOutcome(
      [
        { status: "Accepted", createdAt: at(-5) },
        { status: "Error", createdAt: at(3) },
        { status: "Attempted", createdAt: at(5) },
        { status: "Accepted", createdAt: at(12) },
        { status: "Accepted", createdAt: at(75) },
      ],
      start,
      end,
    );
    expect(o).toEqual({ status: "solved", attempts: 2, solvedAfterMinutes: 12 });
  });

  it("distinguishes attempted from untouched", () => {
    expect(interviewOutcome([{ status: "Attempted", createdAt: at(1) }], start, end).status).toBe("attempted");
    expect(interviewOutcome([], start, end).status).toBe("untouched");
  });

  it("gives a verdict by share solved", () => {
    expect(interviewVerdict(3, 3)).toMatch(/Strong hire/);
    expect(interviewVerdict(0, 3)).toMatch(/Not yet/);
  });
});
