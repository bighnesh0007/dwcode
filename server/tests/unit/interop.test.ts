/**
 * Guards the CJS/ESM interop shims.
 *
 * A type-only fix is not enough here: which declaration file the resolver picks
 * varies by environment, and the *runtime* shape varies with it too. These tests
 * assert the shims produce callables no matter which shape arrives, so a future
 * dependency bump or a different CI resolver fails here instead of at boot.
 */
import { describe, expect, it } from "vitest";
import { interopDefault } from "../../src/lib/interop.ts";
import { createLimiter } from "../../src/middleware/rateLimit.ts";
import { securityHeaders, v1Cors, legacyCors } from "../../src/middleware/security.ts";

describe("interopDefault", () => {
  it("returns a bare function unchanged (ESM declaration shape)", () => {
    const fn = (): string => "x";
    expect(interopDefault<typeof fn>(fn)).toBe(fn);
  });

  it("unwraps .default from a namespace object (CJS-from-ESM shape)", () => {
    const fn = (): string => "x";
    expect(interopDefault<typeof fn>({ default: fn, other: 1 })).toBe(fn);
  });

  it("prefers the module itself when it is callable even if .default exists", () => {
    // Some bundlers attach `.default` to the function itself; the function wins.
    const fn = Object.assign((): string => "x", { default: () => "y" });
    expect(interopDefault<typeof fn>(fn)).toBe(fn);
  });

  it("passes a non-callable through rather than returning undefined", () => {
    const shape = { notAFunction: true };
    expect(interopDefault(shape)).toBe(shape);
  });
});

describe("middleware factories produce real express handlers", () => {
  it("securityHeaders() returns a callable middleware", () => {
    const handler = securityHeaders();
    expect(typeof handler).toBe("function");
  });

  it("createLimiter() returns a callable middleware for every policy", () => {
    for (const policy of ["global", "legacy", "write", "submission", "ai"] as const) {
      expect(typeof createLimiter(policy)).toBe("function");
    }
  });

  it("cors factories return callable middleware", () => {
    expect(typeof v1Cors()).toBe("function");
    expect(typeof legacyCors()).toBe("function");
  });
});
