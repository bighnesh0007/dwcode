/**
 * Authentication middleware.
 *
 * Populates `req.auth` from a verified bearer token. The user id ALWAYS comes from
 * the token — never from a header, query parameter or request body — which is what
 * makes "the backend never trusts client-sent user IDs" true by construction.
 */
import type { Request, RequestHandler } from "express";
import { config } from "../config/index.ts";
import { ForbiddenError, UnauthenticatedError } from "../errors/AppError.ts";
import { ErrorCode } from "../errors/codes.ts";
import { hasAdminRole } from "../data/repositories/roles.ts";
import type { TokenVerifier } from "../types/ports.ts";

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token || null;
}

/** Clerk's session JWT, set by Clerk on the site's origin. */
function extractSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "__session") return decodeURIComponent(value.join("=")) || null;
  }
  return null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The token to verify, from the Authorization header or — because the site
 * reaches this API same-origin through its /backend proxy — Clerk's `__session`
 * cookie, which the browser then sends on its own.
 *
 * Cookies are sent by the browser automatically, which is what makes CSRF
 * possible, so a cookie-authenticated WRITE must come from one of our origins.
 * (Clerk's cookie is also SameSite=Lax, which already stops cross-site POSTs;
 * this check does not rely on that.) A bearer token cannot be attached by a
 * foreign page, so it needs no such check.
 */
function extractToken(req: Request): { token: string; viaCookie: boolean } | null {
  const bearer = extractBearer(req.get("authorization"));
  if (bearer) return { token: bearer, viaCookie: false };
  const cookie = extractSessionCookie(req.get("cookie"));
  return cookie ? { token: cookie, viaCookie: true } : null;
}

function originAllowed(req: Request): boolean {
  let origin = req.get("origin");
  if (!origin) {
    const referer = req.get("referer");
    try {
      origin = referer ? new URL(referer).origin : undefined;
    } catch {
      origin = undefined;
    }
  }
  return origin !== undefined && config.http.corsAllowedOrigins.includes(origin);
}

/** 401 unless a valid token is present. */
export function requireAuth(verifier: TokenVerifier): RequestHandler {
  return (req, _res, next) => {
    const found = extractToken(req);
    if (!found) {
      next(new UnauthenticatedError("Authentication required."));
      return;
    }
    if (found.viaCookie && !SAFE_METHODS.has(req.method) && !originAllowed(req)) {
      next(new ForbiddenError("Cross-origin request refused."));
      return;
    }

    verifier
      .verify(found.token)
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
    const found = extractToken(req);
    // A cross-origin cookie write is treated as anonymous, never as the user.
    if (!found || (found.viaCookie && !SAFE_METHODS.has(req.method) && !originAllowed(req))) {
      next();
      return;
    }

    verifier
      .verify(found.token)
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

/**
 * 403 unless the authenticated user is an admin: the SUPER_ADMIN_USER_ID, or a
 * `UserRole` with role "admin". Mount after requireAuth. Sets `req.isSuperAdmin`.
 */
export function requireAdmin(): RequestHandler {
  return (req, _res, next) => {
    const userId = req.auth?.userId;
    if (!userId) {
      next(new UnauthenticatedError("Authentication required."));
      return;
    }
    if (config.superAdminUserId && userId === config.superAdminUserId) {
      req.isSuperAdmin = true;
      next();
      return;
    }
    hasAdminRole(userId)
      .then((isAdmin) => {
        if (!isAdmin) throw new ForbiddenError("Admin access required.", ErrorCode.ADMIN_REQUIRED);
        req.isSuperAdmin = false;
        next();
      })
      .catch(next);
  };
}
