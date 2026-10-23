import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import {
  canonicalise,
  firstDifference,
  onShadowEvent,
  read,
  setDataBackendForTests,
  write,
  type ShadowEvent,
} from "@/lib/repositories/backend";

const events: ShadowEvent[] = [];
const off = onShadowEvent((e) => events.push(e));
vi.spyOn(console, "warn").mockImplementation(() => undefined);

afterEach(() => {
  setDataBackendForTests(null);
  events.length = 0;
});

describe("read dispatch (#23 phase 3)", () => {
  const mongo = vi.fn((id: string) => Promise.resolve({ id, from: "mongo" }));
  const pg = vi.fn((id: string) => Promise.resolve({ id, from: "pg" }));
  const op = read("t.read", mongo, pg);

  it("serves Mongo only by default", async () => {
    pg.mockClear();
    expect(await op("a")).toEqual({ id: "a", from: "mongo" });
    expect(pg).not.toHaveBeenCalled();
  });

  it("serves Postgres only in postgres mode", async () => {
    setDataBackendForTests("postgres");
    mongo.mockClear();
    expect(await op("a")).toEqual({ id: "a", from: "pg" });
    expect(mongo).not.toHaveBeenCalled();
  });

  it("serves Mongo in shadow mode and reports where Postgres differs", async () => {
    setDataBackendForTests("shadow");
    expect(await op("a")).toEqual({ id: "a", from: "mongo" });
    expect(events).toEqual([{ op: "t.read", kind: "mismatch", path: "from" }]);
  });

  it("reports nothing when both agree", async () => {
    setDataBackendForTests("shadow");
    await read("t.same", mongo, mongo)("a");
    expect(events).toEqual([]);
  });

  it("never lets a Postgres failure reach the caller in shadow mode", async () => {
    setDataBackendForTests("shadow");
    const broken = read("t.broken", (id: string) => mongo(id), (_id: string) => Promise.reject(new Error("pg down")));
    expect(await broken("a")).toEqual({ id: "a", from: "mongo" });
    expect(events).toEqual([{ op: "t.broken", kind: "read-error", error: "pg down" }]);
  });

  it("still fails when Mongo fails, since Mongo is what is served", async () => {
    setDataBackendForTests("shadow");
    const failing = read("t.mongoDown", (_id: string) => Promise.reject(new Error("mongo down")), (id: string) => pg(id));
    await expect(failing("a")).rejects.toThrow("mongo down");
  });

  it("never logs values, only the operation and path", async () => {
    setDataBackendForTests("shadow");
    const warn = vi.mocked(console.warn);
    warn.mockClear();
    await read("t.secret", () => Promise.resolve({ token: "s3cret" }), () => Promise.resolve({ token: "other" }))();
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/s3cret|other/);
  });
});

describe("write dispatch (#23 phase 3)", () => {
  it("writes Mongo first, then mirrors with Mongo's result", async () => {
    setDataBackendForTests("shadow");
    const order: string[] = [];
    const mongo = vi.fn(() => { order.push("mongo"); return Promise.resolve({ _id: "m1" }); });
    const pg = vi.fn(() => { order.push("pg"); return Promise.resolve({ _id: "p1" }); });
    const mirror = vi.fn((result: { _id: string }) => { order.push(`mirror:${result._id}`); return Promise.resolve(); });
    expect(await write("t.create", mongo, pg, mirror)()).toEqual({ _id: "m1" });
    expect(order).toEqual(["mongo", "mirror:m1"]);
    expect(pg).not.toHaveBeenCalled();
  });

  it("mirrors with the same arguments when no mirror is given", async () => {
    setDataBackendForTests("shadow");
    const pg = vi.fn((_a: string) => Promise.resolve());
    await write("t.update", (_a: string) => Promise.resolve(), pg)("x");
    expect(pg).toHaveBeenCalledWith("x");
  });

  it("reports a failed mirror without failing the write", async () => {
    setDataBackendForTests("shadow");
    const result = await write("t.mirrorFails", () => Promise.resolve(1), () => Promise.reject(new Error("fk")))();
    expect(result).toBe(1);
    expect(events).toEqual([{ op: "t.mirrorFails", kind: "write-error", error: "fk" }]);
  });

  it("writes only to the selected store outside shadow mode", async () => {
    const mongo = vi.fn(() => Promise.resolve("m"));
    const pg = vi.fn(() => Promise.resolve("p"));
    const op = write("t.single", mongo, pg);
    expect(await op()).toBe("m");
    setDataBackendForTests("postgres");
    expect(await op()).toBe("p");
    expect(mongo).toHaveBeenCalledTimes(1);
    expect(pg).toHaveBeenCalledTimes(1);
  });
});

describe("shadow comparison rules", () => {
  const id = new Types.ObjectId();
  const diff = (a: unknown, b: unknown, options = {}) =>
    firstDifference(canonicalise(a, options), canonicalise(b, options));

  it("treats an ObjectId and its hex string as equal", () => {
    expect(diff({ _id: id }, { _id: id.toHexString() })).toBeNull();
  });

  it("ignores __v, undefined fields and embedded subdocument ids", () => {
    expect(diff(
      { _id: id, __v: 3, tests: [{ _id: new Types.ObjectId(), input: "{}" }], gone: undefined },
      { _id: id, tests: [{ input: "{}" }] },
    )).toBeNull();
  });

  it("allows a few seconds between timestamps, not more", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(diff({ at: t }, { at: new Date(t.getTime() + 2000) })).toBeNull();
    expect(diff({ at: t }, { at: new Date(t.getTime() + 60000) })).toBe("at");
  });

  it("ignores record order but not field values", () => {
    const a = { _id: "a", n: 1 };
    const b = { _id: "b", n: 2 };
    expect(diff([a, b], [b, a])).toBeNull();
    expect(diff([a, b], [b, { ...a, n: 9 }])).toBe("[0].n");
  });

  it("compares unordered arrays as sets and can ignore top-level ids", () => {
    expect(diff({ followers: ["x", "y"] }, { followers: ["y", "x"] }, { unordered: ["followers"] })).toBeNull();
    expect(diff({ followers: ["x", "y"] }, { followers: ["y", "x"] })).toBe("followers[0]");
    expect(diff({ _id: id, userId: "u" }, { userId: "u" }, { ignoreId: true })).toBeNull();
    expect(diff({ _id: id, userId: "u" }, { userId: "u" })).toBe("_id");
  });

  it("reports a length change on arrays", () => {
    expect(diff({ tags: ["a"] }, { tags: ["a", "b"] })).toBe("tags.length");
  });
});

afterAll(off);
