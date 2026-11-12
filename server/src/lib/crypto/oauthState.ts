/**
 * Signed OAuth `state`.
 *
 * The callback reaches us through the site's /backend proxy, and a Clerk
 * session JWT may well have expired during the GitHub round trip, so the state
 * itself must carry who started the flow and where to return. It is
 * `<payload b64url>.<hmac hex>`; the payload names the user, a nonce (for
 * single use), the expiry and a same-site return path.
 */
import { randomBytes } from "node:crypto";
import { hmacSha256Hex, verifyHmacSha256 } from "./hmac.ts";

export interface OAuthStatePayload {
  userId: string;
  returnTo: string;
  nonce: string;
  /** Epoch ms. */
  exp: number;
}

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_RETURN_TO = "/profile";

/**
 * Only a same-site absolute PATH is allowed. Rejects `//evil.com` and `/\evil.com`
 * (browsers treat both as protocol-relative), schemes, and control characters.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) return DEFAULT_RETURN_TO;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_RETURN_TO;
  if (/[\u0000-\u001f\\]/.test(value)) return DEFAULT_RETURN_TO;
  return value;
}

export function signOAuthState(
  input: { userId: string; returnTo: string },
  secret: string,
  nowMs: number,
): string {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    returnTo: safeReturnTo(input.returnTo),
    nonce: randomBytes(16).toString("base64url"),
    exp: nowMs + OAUTH_STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmacSha256Hex(encoded, secret)}`;
}

/** The payload when the signature is valid and unexpired; otherwise null. */
export function verifyOAuthState(state: string, secret: string, nowMs: number): OAuthStatePayload | null {
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const encoded = state.slice(0, dot);
  if (!verifyHmacSha256(encoded, state.slice(dot + 1), secret)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = parsed as Partial<OAuthStatePayload>;
  if (typeof p.userId !== "string" || !p.userId || typeof p.nonce !== "string" || typeof p.exp !== "number") return null;
  if (p.exp <= nowMs) return null;
  // Re-check even though we signed it: defence in depth if the rule tightens.
  const returnTo = safeReturnTo(p.returnTo);
  return { userId: p.userId, nonce: p.nonce, exp: p.exp, returnTo };
}
