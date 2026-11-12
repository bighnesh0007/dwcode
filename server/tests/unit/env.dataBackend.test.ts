import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.ts";

describe("DATA_BACKEND", () => {
  it("defaults to mongo", () => {
    expect(parseEnv({}).DATA_BACKEND).toBe("mongo");
  });

  // Server repositories do not go through the backend switch yet, so these
  // would serve Mongo while claiming otherwise.
  it.each(["shadow", "postgres"])("refuses %s until the repositories are wired", (mode) => {
    expect(() => parseEnv({ DATA_BACKEND: mode, DATABASE_URL: "postgres://localhost/x" })).toThrow(
      /DATA_BACKEND: .*not wired/,
    );
  });
});
