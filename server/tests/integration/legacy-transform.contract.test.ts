/**
 * CHARACTERIZATION TESTS for the frozen legacy DataWeave contract.
 *
 * These assert what `server/server.js` + `server/dataweaverunner.js` did BEFORE the
 * TypeScript rewrite. They exist so `dwlbackend.onrender.com` can be redeployed from
 * this codebase without breaking the live Next.js client, which calls
 * `POST {DWL_BACKEND_URL}/api/transform` and prints returned error strings verbatim.
 *
 * If one of these fails, the contract broke. Fix the code, not the test.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  buildTestApp,
  failingFetch,
  jsonFetch,
  recordingFetch,
  textFetch,
} from "../helpers/buildTestApp.ts";

describe("POST /api/transform — success shape", () => {
  it("returns 200 with exactly one `output` key", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: '{"a":1}' }) });

    const res = await request(app)
      .post("/api/transform")
      .send({ script: "%dw 2.0\noutput application/json\n---\npayload", inputs: [] });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["output"]);
  });

  it("JSON.parses the upstream output string into an object", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: '{"a":1,"b":[2,3]}' }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expect(res.body.output).toEqual({ a: 1, b: [2, 3] });
  });

  it("unwraps an array output", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "[1,2,3]" }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expect(res.body.output).toEqual([1, 2, 3]);
  });

  it("unwraps a numeric output as a number", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "42" }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expect(res.body.output).toBe(42);
  });

  it("falls back to the raw string when output is not parseable JSON", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "hello world" }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expect(res.body.output).toBe("hello world");
  });
});

describe("POST /api/transform — script normalisation", () => {
  it("converts literal \\n sequences to real newlines before sending upstream", async () => {
    const { fetchImpl, calls } = recordingFetch({ output: "1" });
    const app = buildTestApp({ fetchImpl });

    await request(app)
      .post("/api/transform")
      .send({ script: "%dw 2.0\\noutput application/json\\n---\\npayload", inputs: [] });

    expect(calls).toHaveLength(1);
    expect((calls[0]!.body as { script: string }).script).toBe(
      "%dw 2.0\noutput application/json\n---\npayload",
    );
  });

  it("leaves a script that already contains real newlines untouched", async () => {
    const { fetchImpl, calls } = recordingFetch({ output: "1" });
    const app = buildTestApp({ fetchImpl });
    const script = "%dw 2.0\n---\n{ a: 1 }\\nnot-a-newline";

    await request(app).post("/api/transform").send({ script });

    expect((calls[0]!.body as { script: string }).script).toBe(script);
  });

  it("sends the configured compiler version", async () => {
    const { fetchImpl, calls } = recordingFetch({ output: "1" });
    const app = buildTestApp({ fetchImpl });
    await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expect((calls[0]!.body as { version: string }).version).toBe("2.3.0");
  });
});

describe("POST /api/transform — input normalisation", () => {
  it("defaults a non-array `inputs` to [] instead of failing", async () => {
    const { fetchImpl, calls } = recordingFetch({ output: "1" });
    const app = buildTestApp({ fetchImpl });

    const res = await request(app)
      .post("/api/transform")
      .send({ script: "%dw 2.0\n---\n1", inputs: { payload: "{}" } });

    expect(res.status).toBe(200);
    expect((calls[0]!.body as { inputs: unknown[] }).inputs).toEqual([]);
  });

  it("defaults a missing mimeType to application/json", async () => {
    const { fetchImpl, calls } = recordingFetch({ output: "1" });
    const app = buildTestApp({ fetchImpl });

    await request(app)
      .post("/api/transform")
      .send({ script: "%dw 2.0\n---\n1", inputs: [{ name: "payload", value: "{}" }] });

    expect((calls[0]!.body as { inputs: { mimeType: string }[] }).inputs[0]!.mimeType).toBe(
      "application/json",
    );
  });

  it("JSON.stringifies a non-string input value with 2-space indent", async () => {
    const { fetchImpl, calls } = recordingFetch({ output: "1" });
    const app = buildTestApp({ fetchImpl });

    await request(app)
      .post("/api/transform")
      .send({ script: "%dw 2.0\n---\n1", inputs: [{ name: "payload", value: { a: 1 } }] });

    expect((calls[0]!.body as { inputs: { value: string }[] }).inputs[0]!.value).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });
});

describe("POST /api/transform — every failure is 400 { error }", () => {
  const expectLegacyError = (res: request.Response): void => {
    expect(res.status).toBe(400);
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(typeof res.body.error).toBe("string");
  };

  it("rejects a missing script with the exact original message", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "1" }) });
    const res = await request(app).post("/api/transform").send({ inputs: [] });
    expectLegacyError(res);
    expect(res.body.error).toBe("`script` is required and must be a string");
  });

  it("rejects a non-string script with the exact original message", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "1" }) });
    const res = await request(app).post("/api/transform").send({ script: 42 });
    expectLegacyError(res);
    expect(res.body.error).toBe("`script` is required and must be a string");
  });

  it("rejects an input without a valid name, naming its index", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "1" }) });
    const res = await request(app)
      .post("/api/transform")
      .send({ script: "%dw 2.0\n---\n1", inputs: [{ name: "ok", value: 1 }, { value: 2 }] });
    expectLegacyError(res);
    expect(res.body.error).toBe('inputs[1] is missing a valid "name"');
  });

  it("surfaces an upstream {error} body verbatim", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ error: "Unable to resolve reference of foo." }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\nfoo" });
    expectLegacyError(res);
    expect(res.body.error).toBe("Unable to resolve reference of foo.");
  });

  it("appends upstream body text for a non-2xx response", async () => {
    const app = buildTestApp({ fetchImpl: textFetch("boom", 500) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expectLegacyError(res);
    expect(res.body.error).toBe("Compiler responded with HTTP 500 - boom");
  });

  it("reports an unreachable compiler including the URL", async () => {
    const app = buildTestApp({ fetchImpl: failingFetch(new Error("ECONNREFUSED")) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expectLegacyError(res);
    expect(res.body.error).toContain("Could not reach DataWeave compiler at");
    expect(res.body.error).toContain("ECONNREFUSED");
  });

  it("reports a timeout including the URL and the timeout value", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const app = buildTestApp({ fetchImpl: failingFetch(abort) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expectLegacyError(res);
    expect(res.body.error).toContain("did not respond within 15000ms");
  });
});

describe("GET /health", () => {
  it("returns 200 {status:'ok'} with exactly that key", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /healthcheck — including the status key-collision quirk", () => {
  it("returns 200 and a NUMERIC status when upstream is healthy", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({}, { status: 200 }) });
    const res = await request(app).get("/healthcheck");

    expect(res.status).toBe(200);
    // `...result` overwrites the "ok" string with the numeric upstream status.
    expect(typeof res.body.status).toBe("number");
    expect(res.body.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Object.keys(res.body)).toEqual(["status", "upstream", "ok", "durationMs"]);
  });

  it("returns 503 and status 0 with an error key when upstream is unreachable", async () => {
    const app = buildTestApp({ fetchImpl: failingFetch(new Error("dns fail")) });
    const res = await request(app).get("/healthcheck");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe(0);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("dns fail");
    expect(Object.keys(res.body)).toEqual(["status", "upstream", "ok", "durationMs", "error"]);
  });

  it("returns 503 and the numeric status when upstream is unhealthy", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({}, { status: 503 }) });
    const res = await request(app).get("/healthcheck");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });
});

describe("legacy router isolation", () => {
  it("adds successor-version headers without changing the body", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "1" }) });
    const res = await request(app).post("/api/transform").send({ script: "%dw 2.0\n---\n1" });
    expect(res.headers.deprecation).toBe('version="legacy"');
    expect(res.headers.link).toContain("successor-version");
    expect(Object.keys(res.body)).toEqual(["output"]);
  });

  it("serves CORS wide open, as the original did", async () => {
    const app = buildTestApp({ fetchImpl: jsonFetch({ output: "1" }) });
    const res = await request(app)
      .post("/api/transform")
      .set("Origin", "https://totally-unknown.example")
      .send({ script: "%dw 2.0\n---\n1" });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("returns the v1 envelope for unknown routes, not the legacy shape", async () => {
    const app = buildTestApp();
    const res = await request(app).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(typeof res.body.error.requestId).toBe("string");
  });
});
