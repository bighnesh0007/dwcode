/**
 * Session-cookie auth (same-origin /backend proxy) and its CSRF guard.
 */
import { describe, expect, it } from "vitest";
import express from "express";
import { pino } from "pino";
import request from "supertest";
import { optionalAuth, requireAuth } from "../../src/middleware/auth.ts";
import { errorHandler } from "../../src/middleware/errorHandler.ts";
import { config } from "../../src/config/index.ts";
import type { TokenVerifier } from "../../src/types/ports.ts";

const verifier: TokenVerifier = {
  verify: (t) => (t === "good" ? Promise.resolve({ userId: "user_1" }) : Promise.reject(new Error("bad"))),
};
const app = express()
  .use((req, _res, next) => {
    // the app's requestContext normally provides this
    req.log = pino({ level: "silent" });
    next();
  })
  .get("/me", requireAuth(verifier), (req, res) => res.json({ user: req.auth?.userId }))
  .post("/me", requireAuth(verifier), (req, res) => res.json({ user: req.auth?.userId }))
  .post("/maybe", optionalAuth(verifier), (req, res) => res.json({ user: req.auth?.userId ?? null }))
  .use(errorHandler);

const ALLOWED = config.http.corsAllowedOrigins[0]!;

describe("session cookie auth", () => {
  it("accepts the __session cookie on a read", async () => {
    const r = await request(app).get("/me").set("Cookie", "foo=1; __session=good");
    expect(r.body.user).toBe("user_1");
  });

  it("accepts a cookie-authenticated write from an allowed origin", async () => {
    const r = await request(app).post("/me").set("Cookie", "__session=good").set("Origin", ALLOWED);
    expect(r.status).toBe(200);
  });

  it("refuses a cookie-authenticated write from a foreign origin (CSRF)", async () => {
    const r = await request(app).post("/me").set("Cookie", "__session=good").set("Origin", "https://evil.example");
    expect(r.status).toBe(403);
  });

  it("refuses a cookie-authenticated write with no origin at all", async () => {
    expect((await request(app).post("/me").set("Cookie", "__session=good")).status).toBe(403);
  });

  it("still accepts a bearer token from anywhere (a foreign page cannot attach one)", async () => {
    const r = await request(app).post("/me").set("Authorization", "Bearer good").set("Origin", "https://evil.example");
    expect(r.status).toBe(200);
  });

  it("treats a foreign-origin cookie write on an optional route as anonymous", async () => {
    const r = await request(app).post("/maybe").set("Cookie", "__session=good").set("Origin", "https://evil.example");
    expect(r.body.user).toBeNull();
  });
});
