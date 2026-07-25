/**
 * Authentication middleware.
 *
 * Populates `req.auth` from a verified bearer token. The user id ALWAYS comes from
 * the token — never from a header, query parameter or request body — which is what
 * makes "the backend never trusts client-sent user IDs" true by construction.
 */
import type { RequestHandler } from "express";
import { UnauthenticatedError } from "../errors/AppError.ts";
import type { TokenVerifier } from "../types/ports.ts";

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token || null;
}

/** 401 unless a valid token is present. */
export function requireAuth(verifier: TokenVerifier): RequestHandler {
  return (req, _res, next) => {
    const token = extractBearer(req.get("authorization"));
    if (!token) {
      next(new UnauthenticatedError("Authentication required."));
      return;
    }

    verifier
      .verify(token)
      .then((identity) => {
        req.auth = identity;
        // Re-bind the logger so every later line carries the user id.
        req.log = req.log.child({ userId: identity.userId });
        next();
      })
      .catch(next);
  };
}

/**
 * Attaches `req.auth` when a valid token is present, but allows the request through
 * when there is none. Used for endpoints that work anonymously yet behave better when
 * they know who you are — e.g. sponsoring without an account.
 *
 * An INVALID token is still allowed through as anonymous rather than rejected: the
 * caller asked for an anonymous-capable endpoint, and failing them on a merely
 * expired token would be a worse outcome than treating them as a guest.
 */
export function optionalAuth(verifier: TokenVerifier): RequestHandler {
  return (req, _res, next) => {
    const token = extractBearer(req.get("authorization"));
    if (!token) {
      next();
      return;
    }

    verifier
      .verify(token)
      .then((identity) => {
        req.auth = identity;
        req.log = req.log.child({ userId: identity.userId });
      })
      .catch(() => {
        req.log.debug("ignoring invalid bearer token on an optional-auth route");
      })
      .finally(() => next());
  };
}
