/**
 * Admin, GitHub link and playground sharing, end to end over HTTP against an
 * in-memory MongoDB. GitHub is a fake fetch; identity is a fake verifier.
 */
import { vi } from "vitest";

// Config is parsed at import time, so the env must be in place first.
vi.hoisted(() => {
  vi.stubEnv("SUPER_ADMIN_USER_ID", "user_super");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "c".repeat(64));
  vi.stubEnv("OAUTH_STATE_SECRET", "test-oauth-state-secret");
  vi.stubEnv("GITHUB_CLIENT_ID", "gh-client");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");
  vi.stubEnv("APP_URL", "https://site.test");
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { Application } from "express";
import { LIMITS } from "@dwcode/shared";
import { buildTestApp } from "../helpers/buildTestApp.ts";
import { UnauthenticatedError } from "../../src/errors/AppError.ts";
import { signOAuthState } from "../../src/lib/crypto/oauthState.ts";
import { ENCRYPTED_PREFIX } from "../../src/lib/crypto/tokenCipher.ts";
import { GitHubIntegration } from "../../src/models/GitHubIntegration.ts";
import { PlaygroundSnippet } from "../../src/models/PlaygroundSnippet.ts";
import { Submission } from "../../src/models/Submission.ts";
import { UserRole } from "../../src/models/UserRole.ts";
import { GitHubRepository } from "../../src/repositories/github.repository.ts";
import type { FetchLike, TokenVerifier } from "../../src/types/ports.ts";

const STATE_SECRET = "test-oauth-state-secret";
let mongo: MongoMemoryServer;
let calls: { url: string; method: string; auth?: string; body?: unknown }[] = [];

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

/** Fake GitHub: OAuth exchange, /user, contents, trees and the git data API. */
const fakeGitHub: FetchLike = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? "GET";
  const headers = (init?.headers ?? {}) as Record<string, string>;
  calls.push({ url, method, ...(headers.Authorization ? { auth: headers.Authorization } : {}), body: init?.body ? JSON.parse(init.body as string) : undefined });
  const path = url.replace("https://api.github.com", "");
  if (url === "https://github.com/login/oauth/access_token") {
    const body = JSON.parse(init?.body as string) as { code: string };
    return body.code === "good" ? json(200, { access_token: "gho_new_token" }) : json(200, { error: "bad_verification_code" });
  }
  if (path === "/user") return json(200, { id: 42, login: "octo" });
  if (path === "/repos/octo/data/contents/src/in.json") return json(200, { type: "file", content: Buffer.from('{"a":1}').toString("base64"), sha: "s1" });
  if (path === "/repos/octo/data/contents/src") return json(200, [{ type: "file" }]);
  if (path === "/repos/octo/data") return json(200, { default_branch: "trunk" });
  if (path.startsWith("/repos/octo/data/git/trees/trunk")) return json(200, { tree: [{ type: "blob", path: "a.json" }, { type: "tree", path: "dir" }] });
  if (path === "/repos/octo/dwcode-workspace") return json(200, { default_branch: "main" });
  if (path === "/repos/octo/dwcode-workspace/git/ref/heads/main") return json(200, { object: { sha: "parent" } });
  if (path === "/repos/octo/dwcode-workspace/git/commits/parent") return json(200, { tree: { sha: "basetree" } });
  if (path === "/repos/octo/dwcode-workspace/git/blobs") return json(201, { sha: "blob" });
  if (path === "/repos/octo/dwcode-workspace/git/trees") return json(201, { sha: "newtree" });
  if (path === "/repos/octo/dwcode-workspace/git/commits") return json(201, { sha: "newcommit" });
  if (path === "/repos/octo/dwcode-workspace/git/refs/heads/main") return json(200, {});
  return json(404, { message: "Not Found" });
};

const verifier: TokenVerifier = {
  verify: (token) =>
    token.startsWith("user-")
      ? Promise.resolve({ userId: token.replace("user-", "user_") })
      : Promise.reject(new UnauthenticatedError("bad token")),
};

let a: Application;
const as = (user: string) => `Bearer user-${user}`;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await PlaygroundSnippet.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  calls = [];
  a = buildTestApp({ fetchImpl: fakeGitHub, tokenVerifier: verifier, inlineQueues: true });
  await Promise.all([UserRole.deleteMany({}), GitHubIntegration.deleteMany({}), PlaygroundSnippet.deleteMany({}), Submission.deleteMany({})]);
});

describe("admin authorisation", () => {
  it("401 signed out, 403 for a normal user", async () => {
    expect((await request(a).get("/api/v1/admin/users")).status).toBe(401);
    expect((await request(a).get("/api/v1/admin/users").set("Authorization", as("bob"))).status).toBe(403);
  });

  it("lists users for a DB admin, unioning sources", async () => {
    await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "user_super" });
    await mongoose.connection.db!.collection("userprofiles").insertOne({ userId: "user_lurker", username: "lurk", createdAt: new Date() });
    await mongoose.connection.db!.collection("comments").insertOne({ userId: "user_talker", userName: "Talker" });
    const res = await request(a).get("/api/v1/admin/users").set("Authorization", as("admin"));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ids = (res.body.data.users as { userId: string }[]).map((u) => u.userId).sort();
    expect(ids).toEqual(["user_admin", "user_lurker", "user_super", "user_talker"]);
    expect(res.body.data.isSuperAdmin).toBe(false);
    expect(res.body.data.counts.admins).toBe(2);
  });

  it("only the super admin may list, grant and revoke admin roles", async () => {
    await UserRole.create({ userId: "user_admin", role: "admin", grantedBy: "user_super" });
    expect((await request(a).get("/api/v1/admin/roles").set("Authorization", as("admin"))).status).toBe(403);
    const denied = await request(a).post("/api/v1/admin/roles").set("Authorization", as("admin")).send({ targetUserId: "user_eve" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("SUPER_ADMIN_REQUIRED");
    expect((await request(a).delete("/api/v1/admin/roles/user_admin").set("Authorization", as("admin"))).status).toBe(403);
    expect(await UserRole.countDocuments()).toBe(1);

    const grant = await request(a).post("/api/v1/admin/roles").set("Authorization", as("super")).send({ targetUserId: "user_eve", targetUserName: "Eve" });
    expect(grant.status).toBe(200);
    const eve = await UserRole.findOne({ userId: "user_eve" }).lean();
    expect(eve).toMatchObject({ role: "admin", grantedBy: "user_super", userName: "Eve" });

    const list = await request(a).get("/api/v1/admin/roles").set("Authorization", as("super"));
    expect(list.body.data).toHaveLength(2);

    expect((await request(a).delete("/api/v1/admin/roles/user_eve").set("Authorization", as("super"))).status).toBe(200);
    expect(await UserRole.exists({ userId: "user_eve" })).toBeNull();
    expect((await request(a).delete("/api/v1/admin/roles/user_eve").set("Authorization", as("super"))).status).toBe(404);
  });

  it("rejects extra body fields (no mass assignment)", async () => {
    const res = await request(a).post("/api/v1/admin/roles").set("Authorization", as("super")).send({ targetUserId: "user_eve", role: "user", grantedBy: "x" });
    expect(res.status).toBe(400);
  });
});

describe("GitHub OAuth", () => {
  it("connect redirects a signed-out user to sign-in", async () => {
    const res = await request(a).get("/api/v1/github/connect");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://site.test/sign-in");
  });

  it("connect redirects to GitHub with the public callback and a signed state", async () => {
    const res = await request(a).get("/api/v1/github/connect?returnTo=/playground").set("Authorization", as("alice"));
    expect(res.status).toBe(302);
    const url = new URL(String(res.headers.location));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe("https://site.test/backend/api/v1/github/callback");
    expect(url.searchParams.get("state")).toMatch(/^[\w-]+\.[0-9a-f]{64}$/);
  });

  it("callback stores an ENCRYPTED token and returns to the signed path; the state is single use", async () => {
    const start = await request(a).get("/api/v1/github/connect?returnTo=/playground").set("Authorization", as("alice"));
    const state = new URL(String(start.headers.location)).searchParams.get("state")!;
    const res = await request(a).get(`/api/v1/github/callback?code=good&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://site.test/playground?github=connected");

    const row = await GitHubIntegration.findOne({ userId: "user_alice" }).lean();
    expect(row?.githubUsername).toBe("octo");
    expect(row?.accessToken.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(row?.accessToken).not.toContain("gho_new_token");
    expect(await new GitHubRepository().findLink("user_alice")).toEqual({ token: "gho_new_token", username: "octo" });

    const replay = await request(a).get(`/api/v1/github/callback?code=good&state=${encodeURIComponent(state)}`);
    expect(replay.headers.location).toBe("https://site.test/profile?error=invalid_oauth_state");
  });

  it("rejects a tampered, foreign-signed, expired or session-mismatched state", async () => {
    const good = signOAuthState({ userId: "user_alice", returnTo: "/x" }, STATE_SECRET, Date.now());
    const [payload, sig] = good.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ userId: "user_mallory", returnTo: "/x", nonce: "n", exp: Date.now() + 60_000 })).toString("base64url");
    const cases = [
      `${forgedPayload}.${sig}`,
      signOAuthState({ userId: "user_alice", returnTo: "/x" }, "some-other-secret-value", Date.now()),
      signOAuthState({ userId: "user_alice", returnTo: "/x" }, STATE_SECRET, Date.now() - 11 * 60_000),
      `${payload}.`,
    ];
    for (const state of cases) {
      const res = await request(a).get(`/api/v1/github/callback?code=good&state=${encodeURIComponent(state)}`);
      expect(res.headers.location).toBe("https://site.test/profile?error=invalid_oauth_state");
    }
    // Signed in as someone else than the user who started the flow.
    const mismatch = await request(a).get(`/api/v1/github/callback?code=good&state=${encodeURIComponent(good)}`).set("Authorization", as("bob"));
    expect(mismatch.headers.location).toBe("https://site.test/profile?error=invalid_oauth_state");
    expect(await GitHubIntegration.countDocuments()).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("never redirects off-site, whatever returnTo says", async () => {
    for (const evil of ["https://evil.com", "//evil.com", "/\\evil.com"]) {
      const start = await request(a).get(`/api/v1/github/connect?returnTo=${encodeURIComponent(evil)}`).set("Authorization", as("alice"));
      const state = new URL(String(start.headers.location)).searchParams.get("state")!;
      const res = await request(a).get(`/api/v1/github/callback?code=good&state=${encodeURIComponent(state)}`);
      expect(res.headers.location).toBe("https://site.test/profile?github=connected");
    }
  });

  it("a failed code exchange stores nothing", async () => {
    const state = signOAuthState({ userId: "user_alice", returnTo: "/x" }, STATE_SECRET, Date.now());
    const res = await request(a).get(`/api/v1/github/callback?code=bad&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toBe("https://site.test/profile?error=github_token_exchange_failed");
    expect(await GitHubIntegration.countDocuments()).toBe(0);
  });

  it("status never exposes the token; disconnect removes the link", async () => {
    await GitHubIntegration.create({ userId: "user_alice", githubId: "1", githubUsername: "octo", accessToken: "gho_legacy" });
    expect((await request(a).get("/api/v1/github/status")).status).toBe(401);
    const status = await request(a).get("/api/v1/github/status").set("Authorization", as("alice"));
    expect(status.body.data).toEqual({ connected: true, username: "octo", repoName: "dwcode-workspace", repoPrivate: false, defaultBranch: "main" });
    expect(JSON.stringify(status.body)).not.toContain("gho_");
    expect((await request(a).post("/api/v1/github/disconnect").set("Authorization", as("alice"))).status).toBe(200);
    expect(await GitHubIntegration.countDocuments()).toBe(0);
  });
});

describe("playground GitHub", () => {
  it("reads a LEGACY plaintext token to import, list and push", async () => {
    await GitHubIntegration.create({ userId: "user_alice", githubId: "1", githubUsername: "octo", accessToken: "gho_legacy" });
    const file = await request(a).get("/api/v1/playground/github/file?repo=octo/data&path=src/in.json").set("Authorization", as("alice"));
    expect(file.status, JSON.stringify(file.body)).toBe(200);
    expect(file.body.data).toEqual({ fileName: "in.json", content: '{"a":1}', sha: "s1" });
    expect(calls[0]?.auth).toBe("Bearer gho_legacy");

    const list = await request(a).get("/api/v1/playground/github/files?repo=octo/data").set("Authorization", as("alice"));
    expect(list.body.data).toEqual({ files: ["a.json"], branch: "trunk" });

    const push = await request(a)
      .post("/api/v1/playground/github/push")
      .set("Authorization", as("alice"))
      .send({ script: "%dw 2.0\n---\n1", files: [{ name: "in.json", content: "{}" }], testCases: [{ name: "t", expectedOutput: "1" }], message: "Run" });
    expect(push.status, JSON.stringify(push.body)).toBe(200);
    expect(push.body.data).toMatchObject({ repo: "octo/dwcode-workspace", branch: "main", commitSha: "newcommit" });
  });

  it("rejects path traversal and malformed repos, and requires a link", async () => {
    await GitHubIntegration.create({ userId: "user_alice", githubId: "1", githubUsername: "octo", accessToken: "gho_legacy" });
    for (const q of ["repo=octo/data&path=../../user", "repo=octo/..&path=a", "repo=a/b/c&path=x", "repo=octo/data&path=/abs"]) {
      expect((await request(a).get(`/api/v1/playground/github/file?${q}`).set("Authorization", as("alice"))).status).toBe(400);
    }
    expect((await request(a).get("/api/v1/playground/github/file?repo=octo/data&path=src").set("Authorization", as("alice"))).status).toBe(400);
    expect((await request(a).get("/api/v1/playground/github/files?repo=octo/data").set("Authorization", as("bob"))).status).toBe(403);
    expect((await request(a).get("/api/v1/playground/github/files?repo=octo/data")).status).toBe(401);
  });
});

describe("playground shares", () => {
  const body = {
    script: "%dw 2.0\n---\npayload",
    files: [{ name: " in.json ", kind: "payload", language: "json", content: "{}" }],
    testCases: [{ expectedOutput: "{}" }],
  };

  it("creates an unguessable id and loads it back, signed out", async () => {
    const res = await request(a).post("/api/v1/playground/shares").send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = res.body.data.id as string;
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const loaded = await request(a).get(`/api/v1/playground/shares/${id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.data).toMatchObject({
      id,
      script: body.script,
      files: [{ name: "in.json", kind: "payload", language: "json", content: "{}" }],
      testCases: [{ name: "Test 1", expectedOutput: "{}", files: [{ name: "in.json" }] }],
    });
  });

  it("still loads a legacy 12-hex id; 404 for an unknown one", async () => {
    await PlaygroundSnippet.create({ slug: "0123456789ab", script: "x", files: [], testCases: [] });
    expect((await request(a).get("/api/v1/playground/shares/0123456789ab")).status).toBe(200);
    expect((await request(a).get("/api/v1/playground/shares/ffffffffffff")).status).toBe(404);
    expect((await request(a).get("/api/v1/playground/shares/bad$id!")).status).toBe(400);
  });

  it("enforces LIMITS.playground", async () => {
    const P = LIMITS.playground;
    const post = (b: unknown) => request(a).post("/api/v1/playground/shares").send(b as object);
    expect((await post({ ...body, script: "x".repeat(P.maxScriptLength + 1) })).status).toBe(400);
    expect((await post({ ...body, script: "x".repeat(P.maxScriptLength) })).status).toBe(201);
    expect((await post({ ...body, script: "   " })).status).toBe(400);
    expect((await post({ ...body, files: [{ content: "x".repeat(P.maxFileLength + 1) }] })).status).toBe(400);
    expect((await post({ ...body, files: Array.from({ length: P.maxFiles + 1 }, () => ({ content: "" })) })).status).toBe(400);
    expect((await post({ ...body, testCases: Array.from({ length: P.maxTestCases + 1 }, () => ({})) })).status).toBe(400);
    expect((await post({ ...body, slug: "chosen" })).status).toBe(400);
    expect(await PlaygroundSnippet.countDocuments()).toBe(1);
  });
});
