/** Token encryption at rest and signed OAuth state. */
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, ENCRYPTED_PREFIX } from "../../src/lib/crypto/tokenCipher.ts";
import { OAUTH_STATE_TTL_MS, safeReturnTo, signOAuthState, verifyOAuthState } from "../../src/lib/crypto/oauthState.ts";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
const SECRET = "state-secret-0123456789";

describe("tokenCipher", () => {
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptToken("gho_secret", KEY);
    expect(stored.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(stored).not.toContain("gho_secret");
    expect(decryptToken(stored, KEY)).toBe("gho_secret");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptToken("x", KEY)).not.toBe(encryptToken("x", KEY));
  });

  it("reads legacy plaintext tokens unchanged, even without a key", () => {
    expect(decryptToken("gho_legacy", KEY)).toBe("gho_legacy");
    expect(decryptToken("gho_legacy", undefined)).toBe("gho_legacy");
  });

  it("rejects a tampered ciphertext, a wrong key, and a missing key", () => {
    const stored = encryptToken("gho_secret", KEY);
    const parts = stored.split(":");
    const data = Buffer.from(parts[4]!, "base64url");
    data[0] = data[0]! ^ 1;
    parts[4] = data.toString("base64url");
    expect(() => decryptToken(parts.join(":"), KEY)).toThrow();
    expect(() => decryptToken(stored, OTHER_KEY)).toThrow();
    expect(() => decryptToken(stored, undefined)).toThrow();
  });

  it("rejects a malformed key", () => {
    expect(() => encryptToken("x", "short")).toThrow();
  });
});

describe("oauthState", () => {
  const now = 1_700_000_000_000;

  it("verifies its own state and returns the payload", () => {
    const state = signOAuthState({ userId: "user_1", returnTo: "/playground" }, SECRET, now);
    expect(verifyOAuthState(state, SECRET, now + 1000)).toMatchObject({ userId: "user_1", returnTo: "/playground" });
  });

  it("rejects a tampered payload, a wrong secret, and garbage", () => {
    const state = signOAuthState({ userId: "user_1", returnTo: "/x" }, SECRET, now);
    const [, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "user_2", returnTo: "/x", nonce: "n", exp: now + 9e9 })).toString("base64url");
    expect(verifyOAuthState(`${forged}.${sig}`, SECRET, now)).toBeNull();
    expect(verifyOAuthState(state, "another-secret-xxxxxxx", now)).toBeNull();
    expect(verifyOAuthState("nonsense", SECRET, now)).toBeNull();
    expect(verifyOAuthState("", SECRET, now)).toBeNull();
  });

  it("expires", () => {
    const state = signOAuthState({ userId: "user_1", returnTo: "/x" }, SECRET, now);
    expect(verifyOAuthState(state, SECRET, now + OAUTH_STATE_TTL_MS - 1)).not.toBeNull();
    expect(verifyOAuthState(state, SECRET, now + OAUTH_STATE_TTL_MS)).toBeNull();
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "/a\nb", ""])(
    "neutralises the open redirect %j",
    (value) => {
      expect(safeReturnTo(value)).toBe("/profile");
      const state = signOAuthState({ userId: "u", returnTo: value }, SECRET, now);
      expect(verifyOAuthState(state, SECRET, now)?.returnTo).toBe("/profile");
    },
  );

  it("keeps a same-site path with a query", () => {
    expect(safeReturnTo("/playground?id=abc")).toBe("/playground?id=abc");
  });
});
