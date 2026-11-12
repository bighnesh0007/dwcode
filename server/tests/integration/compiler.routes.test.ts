/**
 * POST /api/v1/compiler/run, and the frozen legacy contract when it runs on the
 * compiler service (DW_BACKEND=service).
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { parseEnv } from "../../src/config/env.ts";
import type { FetchLike } from "../../src/types/ports.ts";

const COMPILER = { url: "http://compiler.internal", authToken: "t".repeat(40), cacheTtlMs: 0 };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const replying = (status: number, body: unknown): FetchLike => () => Promise.resolve(json(status, body));

const RUN = { script: "%dw 2.0\noutput application/json\n---\npayload", inputs: [{ name: "payload", value: "[1]" }] };

describe("POST /api/v1/compiler/run", () => {
  it("returns the result in the v1 envelope", async () => {
    const app = buildTestApp({ compiler: COMPILER, fetchImpl: replying(200, { ok: true, output: "[1]", mimeType: "application/json", timeMs: 2 }) });
    const res = await request(app).post("/api/v1/compiler/run").send(RUN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { ok: true, output: "[1]" } });
  });

  it("returns a user's compile error as 200 with data.ok=false", async () => {
    const app = buildTestApp({ compiler: COMPILER, fetchImpl: replying(200, { ok: false, error: { kind: "COMPILE", message: "Unable to parse" } }) });
    const res = await request(app).post("/api/v1/compiler/run").send(RUN);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: false, error: { kind: "COMPILE", message: "Unable to parse" } });
  });

  it("returns our overload as 503 with Retry-After, never as the user's result", async () => {
    const app = buildTestApp({ compiler: COMPILER, fetchImpl: replying(503, { ok: false, error: { kind: "OVERLOADED", message: "busy" } }) });
    const res = await request(app).post("/api/v1/compiler/run").send(RUN);
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("1");
    expect(res.body.error.code).toBe("COMPILER_UNAVAILABLE");
  });

  it("validates before calling the compiler", async () => {
    let called = false;
    const app = buildTestApp({ compiler: COMPILER, fetchImpl: () => ((called = true), Promise.resolve(json(200, {}))) });
    for (const body of [
      {},
      { script: "" },
      { script: "x", inputs: [{ name: "1bad", value: "1" }] },
      { script: "x", inputs: [{ name: "a", value: "1" }, { name: "a", value: "2" }] },
      { script: "x", inputs: [{ name: "a", value: "1", mimeType: "application/java" }] },
      { script: "x", extra: true },
    ]) {
      const res = await request(app).post("/api/v1/compiler/run").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(called).toBe(false);
  });

  it("reports 503 NOT_CONFIGURED when no compiler service is configured", async () => {
    const res = await request(buildTestApp()).post("/api/v1/compiler/run").send(RUN);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NOT_CONFIGURED");
  });
});

describe("POST /api/transform on the compiler service (DW_BACKEND=service)", () => {
  it("keeps the legacy success shape", async () => {
    const app = buildTestApp({ compiler: COMPILER, fetchImpl: replying(200, { ok: true, output: '{"a":1}', mimeType: "application/json" }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1", inputs: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ output: { a: 1 } });
  });

  it("keeps the legacy error shape with the engine's message verbatim", async () => {
    const message = "Unable to resolve reference of: `nope`.";
    const app = buildTestApp({ compiler: COMPILER, fetchImpl: replying(200, { ok: false, error: { kind: "COMPILE", message } }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\nnope", inputs: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
  });

  it("serialises object inputs to JSON text, as the upstream path does", async () => {
    let sent: { inputs: { value: string }[] } | undefined;
    const app = buildTestApp({
      compiler: COMPILER,
      fetchImpl: (_u, init) => {
        sent = JSON.parse(init?.body as string);
        return Promise.resolve(json(200, { ok: true, output: "1", mimeType: "application/json" }));
      },
    });
    await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1", inputs: [{ name: "payload", value: { a: [1, 2] } }] });
    expect(JSON.parse(sent!.inputs[0]!.value)).toEqual({ a: [1, 2] });
  });
});

describe("env: DW_BACKEND=service", () => {
  it("refuses to boot in production without the compiler token", () => {
    expect(() => parseEnv({ NODE_ENV: "production", DW_BACKEND: "service" })).toThrow(/COMPILER_AUTH_TOKEN/);
  });

  it("refuses the upstream backend without naming its URL (the Render default is gone)", () => {
    expect(() => parseEnv({ DW_BACKEND: "upstream" })).toThrow(/DW_COMPILER_URL/);
  });

  it("accepts TRUST_PROXY=loopback", () => {
    expect(parseEnv({ TRUST_PROXY: "loopback" }).TRUST_PROXY).toBe("loopback");
  });

  it("refuses a short auth token", () => {
    expect(() => parseEnv({ DW_BACKEND: "service", COMPILER_SERVICE_URL: "http://c", COMPILER_AUTH_TOKEN: "short" })).toThrow(/COMPILER_AUTH_TOKEN/);
  });

  it("accepts a bare host:port (Render private-network hostport) as http", () => {
    const env = parseEnv({ DW_BACKEND: "service", COMPILER_SERVICE_URL: "dwcode-compiler:10000", COMPILER_AUTH_TOKEN: "t".repeat(40) });
    expect(env.COMPILER_SERVICE_URL).toBe("http://dwcode-compiler:10000");
  });

  it("defaults to the local compiler service", () => {
    const env = parseEnv({});
    expect(env.DW_BACKEND).toBe("service");
    expect(env.COMPILER_SERVICE_URL).toBe("http://127.0.0.1:8080");
  });
});
