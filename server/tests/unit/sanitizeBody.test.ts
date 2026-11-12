import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { sanitizeBody } from "../../src/middleware/security.ts";

function run(raw: string): Record<string, unknown> {
  const req = { body: JSON.parse(raw) } as Request;
  sanitizeBody(req, {} as Response, () => undefined);
  return req.body as Record<string, unknown>;
}

describe("sanitizeBody", () => {
  it("drops Mongo operators and dotted paths", () => {
    expect(run('{"a":{"$gt":1},"b.c":2,"d":3}')).toEqual({ a: {}, d: 3 });
  });

  it("does not let a __proto__ key replace the object's prototype", () => {
    const body = run('{"__proto__":{"isAdmin":true},"nested":{"__proto__":{"isAdmin":true}}}');
    expect(Object.getPrototypeOf(body)).toBe(Object.prototype);
    expect(body.isAdmin).toBeUndefined();
    expect((body.nested as Record<string, unknown>).isAdmin).toBeUndefined();
  });
});
