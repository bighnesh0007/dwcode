/**
 * Signature verification is the entire security boundary for payments: it is the only
 * thing standing between "someone POSTed a success message" and "we recorded money".
 * These tests exercise it directly.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, verifyHmacSha256 } from "../../src/lib/crypto/hmac.ts";

const SECRET = "rzp_test_secret_key";

function sign(payload: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("hmacSha256Hex", () => {
  it("matches Node's own HMAC output", () => {
    expect(hmacSha256Hex("order_1|pay_1", SECRET)).toBe(sign("order_1|pay_1"));
  });

  it("produces a 64-character hex digest", () => {
    expect(hmacSha256Hex("x", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyHmacSha256", () => {
  const payload = "order_ABC|pay_XYZ";

  it("accepts a correct signature", () => {
    expect(verifyHmacSha256(payload, sign(payload), SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyHmacSha256(payload, sign(payload, "wrong_secret"), SECRET)).toBe(false);
  });

  it("rejects a signature for a different payload", () => {
    expect(verifyHmacSha256(payload, sign("order_ABC|pay_OTHER"), SECRET)).toBe(false);
  });

  it("rejects a tampered payload — the classic amount-swap attempt", () => {
    const original = "order_1|pay_1";
    const signature = sign(original);
    expect(verifyHmacSha256("order_1|pay_2", signature, SECRET)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyHmacSha256(payload, "", SECRET)).toBe(false);
  });

  it("rejects when the secret is empty (misconfiguration must not pass)", () => {
    expect(verifyHmacSha256(payload, sign(payload), "")).toBe(false);
  });

  it("rejects a truncated signature without throwing", () => {
    const signature = sign(payload);
    expect(verifyHmacSha256(payload, signature.slice(0, 32), SECRET)).toBe(false);
  });

  it("rejects an over-long signature without throwing", () => {
    expect(verifyHmacSha256(payload, `${sign(payload)}00`, SECRET)).toBe(false);
  });

  it("rejects non-hex garbage of the correct length", () => {
    expect(verifyHmacSha256(payload, "z".repeat(64), SECRET)).toBe(false);
  });

  it("is case-sensitive (Razorpay sends lowercase hex)", () => {
    expect(verifyHmacSha256(payload, sign(payload).toUpperCase(), SECRET)).toBe(false);
  });

  it("verifies a raw JSON webhook body byte-for-byte", () => {
    // Whitespace is significant: the HMAC covers the exact bytes sent, which is why
    // the webhook route must use express.raw() rather than express.json().
    const rawBody = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"order_1"}}}}';
    expect(verifyHmacSha256(rawBody, sign(rawBody), SECRET)).toBe(true);

    const reSerialised = JSON.stringify(JSON.parse(rawBody) as unknown);
    const differs = reSerialised !== rawBody;
    // If re-serialisation changes the bytes at all, the signature must fail.
    if (differs) {
      expect(verifyHmacSha256(reSerialised, sign(rawBody), SECRET)).toBe(false);
    }
  });
});
