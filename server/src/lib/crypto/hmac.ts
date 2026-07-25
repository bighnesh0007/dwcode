/**
 * HMAC helpers for payment-signature verification.
 *
 * Comparison is ALWAYS timing-safe. A naive `===` on a signature leaks information
 * through response timing, which is the standard way signature checks get broken.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so length is checked
 * first — and an early length mismatch is safe to short-circuit because the expected
 * digest length is fixed and public.
 */
export function verifyHmacSha256(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const expected = hmacSha256Hex(payload, secret);
  if (expected.length !== signature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}
