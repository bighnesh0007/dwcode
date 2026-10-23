/**
 * AES-256-GCM encryption for third-party access tokens at rest.
 *
 * Stored form: `enc:v1:<iv b64url>:<tag b64url>:<ciphertext b64url>`. The
 * version prefix is what lets rows written before encryption existed (plain
 * GitHub tokens) keep working: anything without the prefix is read as legacy
 * plaintext. `v1` leaves room to rotate the scheme or key later.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const ENCRYPTED_PREFIX = "enc:v1:";

function keyBuffer(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("Token encryption key must be 64 hex characters (32 bytes).");
  }
  return Buffer.from(hexKey, "hex");
}

export function isEncryptedToken(stored: string): boolean {
  return stored.startsWith(ENCRYPTED_PREFIX);
}

export function encryptToken(plaintext: string, hexKey: string): string {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard; never reused per key
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(hexKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/**
 * Decrypt a stored token. Legacy plaintext (no prefix) is returned unchanged.
 * Throws if an encrypted value was tampered with or the key is wrong — GCM's
 * tag check fails rather than yielding garbage.
 */
export function decryptToken(stored: string, hexKey: string | undefined): string {
  if (!isEncryptedToken(stored)) return stored;
  if (!hexKey) throw new Error("Token is encrypted but no encryption key is configured.");
  const [ivPart, tagPart, dataPart] = stored.slice(ENCRYPTED_PREFIX.length).split(":");
  if (ivPart === undefined || tagPart === undefined || dataPart === undefined) {
    throw new Error("Malformed encrypted token.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(hexKey), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}
