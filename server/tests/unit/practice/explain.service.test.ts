import { describe, expect, it, vi } from "vitest";
import { ExplainService } from "../../../src/services/practice/explain.service.ts";
import { NotConfiguredError, UpstreamError } from "../../../src/errors/AppError.ts";

describe("ExplainService", () => {
  it("is not configured without a key, and never calls the model", async () => {
    const generate = vi.fn();
    await expect(new ExplainService({ generate }, undefined).explain("x", "y")).rejects.toBeInstanceOf(NotConfiguredError);
    expect(generate).not.toHaveBeenCalled();
  });

  it("sends the script and error as quoted data, and asks not to write the solution", async () => {
    const generate = vi.fn((_prompt: string, _key: string) => Promise.resolve("  The `mod` got a Boolean.  "));
    const out = await new ExplainService({ generate }, "k").explain("payload.n mod 2 == 0", "UnexpectedFunctionCallTypes");
    expect(out.explanation).toBe("The `mod` got a Boolean.");
    const prompt = generate.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("<<<SCRIPT\npayload.n mod 2 == 0\nSCRIPT>>>");
    expect(prompt).toContain("Do NOT write the corrected script");
  });

  it("turns a model failure or an empty answer into a retryable upstream error", async () => {
    await expect(new ExplainService({ generate: () => Promise.reject(new Error("quota")) }, "k").explain("a", "b"))
      .rejects.toBeInstanceOf(UpstreamError);
    await expect(new ExplainService({ generate: () => Promise.resolve("   ") }, "k").explain("a", "b"))
      .rejects.toBeInstanceOf(UpstreamError);
  });
});
